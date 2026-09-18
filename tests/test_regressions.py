"""Run: python -m unittest discover -s tests (install httpx for TestClient)."""
import io
import os
import unittest
import wave
from concurrent.futures import ThreadPoolExecutor
os.environ.setdefault('SPEECH_MODE', 'dynamic')
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
        self.assertEqual(status['dynamic'], SPEECH_MODE == 'dynamic')

    def test_voice_returns_real_wav(self):
        response = self.client.post('/api/speech', json={'text':'Welcome to my world.'})
        self.assertEqual(response.status_code, 200)
        with wave.open(io.BytesIO(response.content)) as audio:
            self.assertEqual(audio.getnchannels(), 1)
            self.assertGreater(audio.getnframes(), 22050)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_pronunciation_and_narration(self):
        self.assertEqual(normalize_pronunciation('AI, IoT, HTML, C++, C# and GitHub.'),
                         'A I, internet of things, H T M L, C plus plus, C sharp and Git Hub.')
        text = "Hello world. I'm Dale, a computer engineer."
        for profile in ('robot','narration'):
            with wave.open(io.BytesIO(synthesize(text, profile))) as wav:
                self.assertGreater(wav.getnframes(), 22050)
        self.assertEqual(self.client.post('/api/speech', json={'text':text, 'profile':'narration'}).status_code,200)
        self.assertEqual(self.client.post('/api/speech', json={'text':text, 'profile':'invalid'}).status_code,422)

    def test_voice_validation(self):
        for text in ['', '   ', 'a'*501]:
            self.assertEqual(self.client.post('/api/speech',json={'text':text}).status_code,422)

    def test_voice_rate_limit(self):
        for i in range(60):
            self.assertEqual(self.client.post('/api/speech',json={'text':'Hi.'}).status_code,200)
        self.assertEqual(self.client.post('/api/speech',json={'text':'Hi.'}).status_code,429)

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
        for asset in ['/loader.js','/loader.css','/speech-worker.js','/assets/whoami-robot.wav','/assets/voice-preview.wav']:
            self.assertEqual(self.client.get(asset).status_code,200)

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
