# Bundled male neural voice

Voice: en_US-john-medium, by Bryce Beattie; distributed in rhasspy/piper-voices.
Source: https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/john/medium
The model card describes this as a US English male, single-speaker voice and
identifies the source LibriVox recordings as public domain. The model repository
identifies its license as MIT. The original MODEL_CARD is included unchanged.

Engine: Piper 1.3.0, installed via pip; GPL-3.0-or-later.
Source/license: https://github.com/OHF-Voice/piper1-gpl/tree/v1.3.0

The unmodified ONNX model is split into four .partNN files, each at most 20 MiB,
so it can be uploaded through GitHub's file-upload interface. Keep ALL four
parts, the manifest and JSON configuration. backend/voice_model.py joins and
SHA-256 checks the parts locally on first synthesis. No voice model download or
external speech API is needed during website use. The generated .onnx file is
ignored by git and is not an extra file you need to upload.
