"""Local neural male speech. Model and synthesis stay on this server."""
import io
import json
import re
import threading
import wave
from pathlib import Path
from functools import lru_cache

_lock = threading.Lock()
_engine = None
from .voice_model import ensure_model


def _initialize():
    global _engine
    import onnxruntime as ort
    from piper import PiperVoice
    from piper.config import PiperConfig
    model = ensure_model()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    with open(str(model) + '.json', encoding='utf-8') as stream:
        config = PiperConfig.from_dict(json.load(stream))
    _engine = PiperVoice(config=config, session=ort.InferenceSession(
        str(model), sess_options=options, providers=['CPUExecutionProvider']))


def normalize_pronunciation(text: str) -> str:
    """Read common engineering terms consistently without changing visible text."""
    text = text.replace('“', '').replace('”', '').replace('’', "'").replace('‘', "'")
    text = re.sub(r'[—–]', ', ', text)
    for term, spoken in [('C++', 'C plus plus'), ('C#', 'C sharp'),
                         ('Node.js', 'Node J S'), ('VS Code', 'Visual Studio Code')]:
        text = re.sub(r'(?<!\w)' + re.escape(term) + r'(?!\w)', spoken, text, flags=re.I)
    words = {'AI':'A I', 'IoT':'internet of things', 'UI':'user interface',
             'UX':'user experience', 'HTML':'H T M L', 'CSS':'C S S',
             'API':'A P I', 'APIs':'A P I s', 'SQL':'S Q L', 'PHP':'P H P',
             'CPU':'C P U', 'GPU':'G P U', 'USB':'U S B',
             'GitHub':'Git Hub', 'JavaScript':'Java Script'}
    pattern = r'\b(' + '|'.join(re.escape(k) for k in words) + r')\b'
    text = re.sub(pattern, lambda match: words[match.group()], text)
    text = text.replace('&', ' and ')
    text = re.sub(r'[,;:]\s*[.]', '.', text)
    return re.sub(r'\s+', ' ', text).strip()


def _phrases(text):
    """Bound CPU inference memory, preferring real sentence/clause boundaries."""
    while len(text) > 220:
        prefix = text[:220]
        boundaries = list(re.finditer(r'[.!?;,](?=\s)', prefix))
        cut = boundaries[-1].end() if boundaries else prefix.rfind(' ')
        if cut < 60:
            cut = prefix.rfind(' ')
        if cut < 1:
            cut = 220
        yield text[:cut].strip()
        text = text[cut:].strip()
    if text:
        yield text


@lru_cache(maxsize=16)
def synthesize(text: str, profile: str = "robot") -> bytes:
    if not text.strip() or len(text) > 500:
        raise ValueError('Text must contain 1–500 characters')
    if profile not in ('robot', 'narration'):
        raise ValueError('Unknown voice profile')
    if not _lock.acquire(timeout=8):
        raise RuntimeError('Voice is busy; please retry')
    try:
        from piper import SynthesisConfig
        if _engine is None:
            _initialize()
        # The SAME tempo for both profiles; low duration noise limits timing
        # variation. No playback-rate/pitch hacks or per-sentence rate changes.
        config = SynthesisConfig(length_scale=1.05, noise_scale=0.45,
                                 noise_w_scale=0.15, normalize_audio=False, volume=1.0)
        frames = []
        sample_rate = 22050
        for phrase in _phrases(normalize_pronunciation(text)):
            for chunk in _engine.synthesize(phrase, syn_config=config):
                sample_rate = chunk.sample_rate
                frames.append(chunk.audio_int16_bytes)
        if not frames:
            raise RuntimeError('Voice produced no audio')
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(b''.join(frames))
        return out.getvalue()
    finally:
        _lock.release()
