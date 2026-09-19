"""Run: python -m unittest discover -s tests (install httpx for TestClient)."""
import io
import os
import atexit
import importlib.util
import secrets
import tempfile
import unittest
import wave
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
# Never seed, mutate or test against the bundled/production database.
_test_dir = tempfile.TemporaryDirectory(prefix='portfolio-regressions-')
atexit.register(_test_dir.cleanup)
os.environ['DATABASE_URL'] = 'sqlite:///' + str(Path(_test_dir.name) / 'test.db')
os.environ['ADMIN_KEY'] = secrets.token_urlsafe(32)
os.environ['SPEECH_MODE'] = 'static'
REAL_VOICE = os.getenv('RUN_DYNAMIC_VOICE_TESTS') == '1' and importlib.util.find_spec('piper') is not None
from fastapi.testclient import TestClient
from backend.main import app, _speech_hits, SPEECH_MODE
from backend.speech import synthesize, normalize_pronunciation

class RegressionTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        _speech_hits.clear()

    def test_health(self):
        self.assertEqual(self.client.get('/api/health').json()['status'], 'ok')
        self.assertEqual(self.client.get('/api/health/db').json()['db'], 'ok')
        status = self.client.get('/api/speech/status').json()
        self.assertTrue(status['dynamic'])

    def test_blank_optional_database_url(self):
        result = subprocess.run([sys.executable, '-c',
            'from backend.database import DATABASE_URL; print(DATABASE_URL)'],
            env={**os.environ, 'DATABASE_URL':'  '}, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'sqlite:///./portfolio.db')

    def test_new_profile_and_recording_assets(self):
        for path in ['/profile.css', '/assets/profile-shield.svg', '/assets/code-transform.wav']:
            self.assertEqual(self.client.get(path).status_code, 200)
        with wave.open(io.BytesIO(self.client.get('/assets/code-transform.wav').content)) as wav:
            self.assertEqual(wav.getnchannels(), 1)
            self.assertGreater(wav.getnframes(), wav.getframerate())

    def test_static_startup_does_not_load_neural_runtime(self):
        result = subprocess.run([sys.executable, '-c',
            "import sys; import backend.main; assert 'onnxruntime' not in sys.modules; assert 'piper' not in sys.modules"],
            env={**os.environ,'SPEECH_MODE':'static'}, capture_output=True,text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_presence_join_leave_and_expiry_events(self):
        from backend import main
        with main._presence_lock:
            main._presence.clear()
        a=self.client.post('/api/presence',json={'viewer_id':'test-a','name':''})
        self.assertEqual(a.json()['online'],1)
        b=self.client.post('/api/presence',json={'viewer_id':'test-b','name':''})
        self.assertEqual(b.json()['online'],2)
        c=self.client.post('/api/presence/leave',json={'viewer_id':'test-a','name':''})
        self.assertEqual(c.json()['online'],1)
        with main._presence_lock:
            main._presence['test-b']=(0,'')
        self.assertEqual(self.client.get('/api/presence').json()['online'],0)
        self.assertEqual(main._presence_events[-1]['online'],0)

    @unittest.skipUnless(REAL_VOICE, 'Optional Piper synthesis: set RUN_DYNAMIC_VOICE_TESTS=1 with piper installed')
    def test_voice_returns_real_wav(self):
        with patch('backend.main.SPEECH_MODE','dynamic'):
            response = self.client.post('/api/speech', json={'text':'Welcome to my world.'})
        self.assertEqual(response.status_code, 200)
        with wave.open(io.BytesIO(response.content)) as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertGreater(audio.getnframes(), 22050)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_pronunciation_and_narration(self):
        self.assertEqual(normalize_pronunciation('AI, IoT, HTML, C++, C# and GitHub.'),
                         'A I, internet of things, H T M L, C plus plus, C sharp and Git Hub.')
        self.assertEqual(self.client.post('/api/speech', json={'text':'hello','profile':'invalid'}).status_code,422)

    @unittest.skipUnless(REAL_VOICE, 'Optional Piper synthesis')
    def test_dynamic_narration(self):
        text = "Hello world. I'm Dale, a computer engineer."
        for profile in ('robot','narration'):
            with wave.open(io.BytesIO(synthesize(text, profile))) as wav:
                self.assertGreater(wav.getnframes(), 22050)
        with patch('backend.main.SPEECH_MODE','dynamic'):
            self.assertEqual(self.client.post('/api/speech', json={'text':text, 'profile':'narration'}).status_code,200)

    def test_voice_validation(self):
        for text in ['', '   ', 'a'*501]:
            self.assertEqual(self.client.post('/api/speech',json={'text':text}).status_code,422)

    def test_voice_rate_limit(self):
        # Endpoint/rate-limit behavior is independent of the optional model.
        with patch('backend.main.SPEECH_MODE','dynamic'), patch('backend.main.synthesize',return_value=b'RIFF'):
            for i in range(60):
                self.assertEqual(self.client.post('/api/speech',json={'text':'Hi.'}).status_code,200)
            self.assertEqual(self.client.post('/api/speech',json={'text':'Hi.'}).status_code,429)

    @unittest.skipUnless(REAL_VOICE, 'Optional Piper synthesis')
    def test_concurrent_voice_is_not_mixed(self):
        texts=['First robot message.', 'Second voice message.', 'Welcome Dale.']
        with ThreadPoolExecutor(max_workers=3) as pool:
            results=list(pool.map(synthesize,texts))
        self.assertEqual(len(set(results)),3)
        for data in results:
            with wave.open(io.BytesIO(data)) as wav:
                self.assertGreater(wav.getnframes(),0)

    def test_loader_and_speech_assets(self):
        html = self.client.get('/').text
        for feature in ['bootScreen','Developed by Trevelade Company.','loader.js']:
            self.assertIn(feature,html)
        self.assertNotIn('whoamiSpeech', html)
        self.assertNotIn('id="siteLogo"',html)
        self.assertNotIn('id="siteLogoImg"',html)
        self.assertIn('favicon.js',html)
        for asset in ['/favicon.js','/loader.js','/loader.css','/speech-worker.js','/assets/whoami-robot.wav','/assets/voice-preview.wav']:
            self.assertEqual(self.client.get(asset).status_code,200)

    def test_static_mode_uses_lightweight_male_voice_not_neural(self):
        with patch('backend.main.synthesize',side_effect=AssertionError('must not synthesize')) as voice:
            for text in ['Welcome to my world!','Customized terminal words']:
                self.assertEqual(self.client.post('/api/speech',json={'text':text}).status_code,200)
            voice.assert_not_called()
        self.assertEqual(self.client.get('/api/speech/status').json()['mode'],'static')
        self.assertEqual(self.client.get('/api/speech/status').json()['engine'],'male-robot-lite')

    def test_lightweight_voice_without_neural_runtime(self):
        result = subprocess.run([sys.executable, '-c',
            "import sys,io,wave; from backend.speech_lite import synthesize_lite; "
            "data=synthesize_lite('Johndale won this round by defeating the robot!'); "
            "w=wave.open(io.BytesIO(data)); assert w.getnframes()>22050; "
            "assert 'onnxruntime' not in sys.modules; assert 'piper' not in sys.modules"],
            capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_lightweight_concurrent_messages(self):
        from backend.speech_lite import synthesize_lite
        with ThreadPoolExecutor(max_workers=3) as pool:
            results=list(pool.map(synthesize_lite,['First message.','Second message.','Third message.']))
        self.assertEqual(len(set(results)),3)
        for data in results:
            with wave.open(io.BytesIO(data)) as wav:
                self.assertGreater(wav.getnframes(),0)

    def test_editor_tab_branding(self):
        html=self.client.get('/editor.html').text
        self.assertIn('Browser-tab icon',html)
        self.assertIn('favicon.js',html)
        self.assertNotIn('id="siteLogo"',html)

    def test_clean_section_urls(self):
        for path in ['/projects','/achievements','/tools','/chat']:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn('id="mainContent"', response.text)
        legacy = self.client.get('/index.html', follow_redirects=False)
        self.assertEqual(legacy.status_code, 308)
        self.assertEqual(legacy.headers['location'], '/')

if __name__ == '__main__':
    unittest.main()
