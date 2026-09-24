"""Bounded, lightweight male robot speech for phones and small Render hosts.

eSpeak NG's explicitly male m3 voice produces WAV audio server-side. No browser
voice selection, external TTS service, neural model or ONNX runtime is needed.
"""
import ctypes as c
import io
import sys
import threading
import wave
from functools import lru_cache
from pathlib import Path

_lock = threading.Lock()
_engine = None
_callback = None
_rate = 22050
_frames = []
_samples = 0
_overflow = False
_CALLBACK = c.CFUNCTYPE(c.c_int, c.POINTER(c.c_short), c.c_int, c.c_void_p)


def _initialize():
    global _engine, _callback, _rate
    import espeakng_loader
    engine = espeakng_loader.load_library()
    if engine is None:
        raise RuntimeError('Male robot voice library could not be loaded')
    engine.espeak_Initialize.argtypes = [c.c_int, c.c_int, c.c_char_p, c.c_int]
    engine.espeak_Initialize.restype = c.c_int
    # AUDIO_OUTPUT_SYNCHRONOUS: callback runs during Synth, under our lock.
    rate = engine.espeak_Initialize(2, 0,
        str(Path(espeakng_loader.get_data_path()).parent).encode(), 0)
    if rate <= 0:
        raise RuntimeError('Male robot voice initialization failed')
    engine.espeak_SetVoiceByName.argtypes = [c.c_char_p]
    engine.espeak_SetParameter.argtypes = [c.c_int, c.c_int, c.c_int]
    engine.espeak_SetSynthCallback.argtypes = [_CALLBACK]
    engine.espeak_Synth.argtypes = [c.c_void_p, c.c_size_t, c.c_uint, c.c_int,
                                  c.c_uint, c.c_uint, c.c_void_p, c.c_void_p]
    if engine.espeak_SetVoiceByName(b'en-us+m3') != 0:
        raise RuntimeError('Required male voice is missing')
    engine.espeak_SetParameter(1, 165, 0)  # words/minute, one fixed tempo
    engine.espeak_SetParameter(2, 90, 0)   # volume

    @_CALLBACK
    def collect(samples, count, events):
        global _samples, _overflow
        if samples and count > 0:
            _samples += count
            if _samples > rate * 45:
                _overflow = True
                return 1
            _frames.append(c.string_at(samples, count * 2))
        return 0

    _callback = collect  # keep callback alive for the native library
    engine.espeak_SetSynthCallback(_callback)
    _rate, _engine = rate, engine


@lru_cache(maxsize=16)
def synthesize_lite(text: str, profile: str = 'robot') -> bytes:
    global _frames, _samples, _overflow
    if not text.strip() or len(text) > 500:
        raise ValueError('Text must contain 1–500 characters')
    if profile not in ('robot', 'narration'):
        raise ValueError('Unknown voice profile')
    if not _lock.acquire(timeout=5):
        raise RuntimeError('Voice is busy; please retry')
    try:
        if _engine is None:
            _initialize()
        from .speech import normalize_pronunciation
        phrase = normalize_pronunciation(text).replace('\x00', ' ').encode('utf-8')
        _frames, _samples, _overflow = [], 0, False
        # UTF-8 + end pause. SSML and phoneme input flags remain disabled.
        result = _engine.espeak_Synth(phrase, len(phrase)+1, 0, 1, 0, 1|4096, None, None)
        if result != 0 or _overflow or not _frames:
            raise RuntimeError('Male robot voice produced no bounded audio')
        pcm = b''.join(_frames)
        if sys.byteorder != 'little':
            import array
            samples = array.array('h', pcm)
            samples.byteswap()
            pcm = samples.tobytes()
        out = io.BytesIO()
        with wave.open(out, 'wb') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(_rate)
            wav.writeframes(pcm)
        return out.getvalue()
    finally:
        _frames = []
        _lock.release()
