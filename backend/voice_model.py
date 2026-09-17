"""Assemble bundled model parts (each below GitHub's browser upload limit)."""
import hashlib
import json
import os
import tempfile
from pathlib import Path

VOICE_DIR = Path(__file__).resolve().parent.parent / 'voices'
MODEL = VOICE_DIR / 'en_US-john-medium.onnx'

def ensure_model():
    manifest = json.loads((VOICE_DIR / 'manifest.json').read_text())
    if MODEL.is_file() and MODEL.stat().st_size == manifest['size']:
        return MODEL
    temp_path = None
    try:
        digest = hashlib.sha256()
        size = 0
        with tempfile.NamedTemporaryFile(dir=VOICE_DIR, suffix='.tmp', delete=False) as target:
            temp_path = Path(target.name)
            for part in manifest['parts']:
                # Fixed package filenames, not request-supplied paths.
                if Path(part).name != part:
                    raise RuntimeError('Invalid voice manifest')
                with (VOICE_DIR / part).open('rb') as source:
                    while block := source.read(1024*1024):
                        target.write(block)
                        digest.update(block)
                        size += len(block)
        if size != manifest['size'] or digest.hexdigest() != manifest['sha256']:
            raise RuntimeError('Voice files are incomplete or corrupted; re-extract the ZIP')
        os.replace(temp_path, MODEL)
        return MODEL
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()
