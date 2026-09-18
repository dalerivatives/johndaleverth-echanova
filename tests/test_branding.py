"""Logo uploads use an isolated database; no real settings are changed."""
import base64
import io
import unittest
from PIL import Image
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from backend.main import app, ADMIN_KEY
from backend.database import Base, get_db

class BrandingTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        sessions = sessionmaker(bind=self.engine)
        def database():
            with sessions() as db:
                yield db
        app.dependency_overrides[get_db] = database
        self.client = TestClient(app)
        self.headers = {'X-Admin-Key': ADMIN_KEY}

    def tearDown(self):
        app.dependency_overrides.pop(get_db, None)
        self.engine.dispose()

    def upload(self, raw, headers=None):
        return self.client.post('/api/settings/upload', data={'key':'favicon_url'}, files={'file':('logo.png',raw,'image/png')}, headers=self.headers if headers is None else headers)

    def test_upload_render_and_reset(self):
        output = io.BytesIO()
        Image.new('RGB',(600,300),'blue').save(output,'JPEG')
        response = self.upload(output.getvalue())
        self.assertEqual(response.status_code,200,response.text)
        logo = response.json()['value']
        with Image.open(io.BytesIO(base64.b64decode(logo.split(',')[1]))) as image:
            self.assertEqual(image.size,(128,128))
            self.assertEqual(image.format,'PNG')
            self.assertEqual(image.getpixel((0,0))[3],0)
        self.assertEqual(self.client.get('/api/settings').json()['favicon_url'],logo)
        for url in ['/', '/editor.html']:
            response = self.client.get(url)
            self.assertEqual(response.status_code,200)
            self.assertIn('href="'+logo+'"',response.text)
        self.assertEqual(self.client.put('/api/settings',json={'favicon_url':''},headers=self.headers).status_code,200)
        self.assertNotIn(logo,self.client.get('/').text)
        self.assertIn('data:image/svg+xml',self.client.get('/').text)

    def test_rejects_unauthenticated_invalid_and_oversized_files(self):
        self.assertEqual(self.upload(b'fake',headers={}).status_code,401)
        self.assertEqual(self.upload(b'<svg onload="alert(1)"></svg>').status_code,400)
        self.assertEqual(self.upload(b'0'*(5*1024*1024+1)).status_code,413)
        self.assertEqual(self.client.get('/api/settings').json()['favicon_url'],'')

if __name__ == '__main__':
    unittest.main()
