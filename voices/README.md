# Optional neural speech model (not bundled in compact ZIP)

The current site uses SPEECH_MODE=static: bundled male WAV recordings and
lightweight male robot synthesis. This requires no neural model.

To opt back into Piper on a sufficiently sized host:
1. Restore the four en_US-john-medium.onnx.part01–part04 files from the full
   v88 ZIP into this directory. Retain the manifest/configuration files here.
2. Install: pip install -r requirements-neural.txt
3. Set SPEECH_MODE=dynamic on the host (local launchers default to static).

The model assembler checks the retained manifest's SHA-256 before use.
MODEL_CARD and configuration are retained for attribution and optional restore.
