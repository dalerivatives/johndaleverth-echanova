"""Local eSpeak NG synthesis. No text is sent to an external speech service."""
import ctypes
import io
import re
import threading
import wave
from functools import lru_cache

_lock = threading.Lock()
_engine = None
_voice_callback = None
_samples = []
_sample_rate = 22050


def _initialize():
    global _engine, _voice_callback, _sample_rate
    import espeakng_loader
    lib = espeakng_loader.load_library()
    if lib is None:
        raise RuntimeError('eSpeak NG library is unavailable')
    lib.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    lib.espeak_Initialize.restype = ctypes.c_int
    rate = lib.espeak_Initialize(2, 0, espeakng_loader.get_data_path().encode(), 0)
    if rate <= 0:
        raise RuntimeError('Could not initialize robot voice')
    callback_type = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.POINTER(ctypes.c_short), ctypes.c_int, ctypes.c_void_p)
    def collect(samples, count, events):
        if samples and count > 0:
            _samples.append(ctypes.string_at(samples, count * 2))
        return 0
    _voice_callback = callback_type(collect)
    lib.espeak_SetSynthCallback.argtypes = [callback_type]
    lib.espeak_SetSynthCallback(_voice_callback)
    lib.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    if lib.espeak_SetVoiceByName(b'en-us') != 0:
        raise RuntimeError('English robot voice is unavailable')
    lib.espeak_SetParameter.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int]
    lib.espeak_Synth.argtypes = [ctypes.c_void_p, ctypes.c_size_t, ctypes.c_uint,
        ctypes.c_int, ctypes.c_uint, ctypes.c_uint, ctypes.c_void_p, ctypes.c_void_p]
    _sample_rate = rate
    _engine = lib


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


@lru_cache(maxsize=32)
def synthesize(text: str, profile: str = "robot") -> bytes:
    if not text.strip() or len(text) > 500:
        raise ValueError('Text must contain 1–500 characters')
    if profile not in ('robot', 'narration'):
        raise ValueError('Unknown voice profile')
    if not _lock.acquire(timeout=2):
        raise RuntimeError('Robot voice is busy; please retry')
    try:
        if _engine is None:
            _initialize()
        # One male voice; narration uses a wider range for readable sentences.
        # Set inside the synthesis lock so concurrent profiles cannot interfere.
        rate, pitch, intonation = (158, 44, 52) if profile == 'narration' else (160, 38, 35)
        _engine.espeak_SetParameter(1, rate, 0)
        _engine.espeak_SetParameter(3, pitch, 0)
        _engine.espeak_SetParameter(4, intonation, 0)
        _samples.clear()
        encoded = normalize_pronunciation(text).encode('utf-8') + b'\0'
        # UTF-8 flag only: never interpret visitor content as SSML.
        if _engine.espeak_Synth(encoded, len(encoded), 0, 1, 0, 1, None, None) != 0:
            raise RuntimeError('Robot voice could not synthesize this text')
        audio = b''.join(_samples)
        _samples.clear()
        if not audio:
            raise RuntimeError('Robot voice produced no audio')
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(_sample_rate)
            wav.writeframes(audio)
        return out.getvalue()
    finally:
        _lock.release()
