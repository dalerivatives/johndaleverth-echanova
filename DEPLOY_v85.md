# Deploy v85 on your existing Render service

1. Back up and retain your existing database, uploads and environment values.
   This ZIP contains application files, not a backup of your live content.
2. Extract the ZIP and update the existing repository with its contents. Keep
   backend/, static/, voices/ and the requirements files together at the root.
3. Keep SPEECH_MODE=static on the service that previously exceeded memory.
   This mode does not load Piper/ONNX during startup or for the three bundled
   recordings. Do not set dynamic merely to enable chat voices on a small host.
4. Keep your ADMIN_KEY and DATABASE_URL. Set PYTHON_VERSION=3.12.14 if an older
   value is already set. The included .python-version also selects this version;
   Render environment values take precedence over that file.
5. Build: `pip install -r requirements.txt`
6. Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
   Keep a single worker because live viewer/chat event state is per process.
7. Health-check path: `/api/health`. Deploy, then confirm this returns status ok.
8. Check `/`, `/projects`, `/achievements`, `/tools` and `/chat`. On Profile,
   type `whoami`, then `code`. Check the dial and the chat voice button tooltip.
   Open two tabs to check the live count. Reopen the tab if the favicon is cached.

The included render.yaml configures a new Blueprint too. Existing services
that are not Blueprint-managed still need the environment values above.

If you use local SQLite or store uploaded files on the service's temporary
filesystem, preserve them separately before redeploying. An external database
does not by itself preserve locally stored uploaded images. Keep your existing
durable storage arrangement; see SUPABASE.md for the database option.

The default terminal recording matches the original default narration. Edited
terminal text and World Chat use lightweight eSpeak NG male robot audio in
static mode. This works without a male browser voice and does not load Piper
or ONNX. Install the updated requirements, including espeakng-loader.
On phones, tap the chat voice button to enable audio. Reload the page after
deploying so that the v85 scripts replace cached versions. Browser autoplay
restrictions still require interaction; a background/locked phone may suspend audio.

Locally tested on Python 3.12.14. Render build, production PostgreSQL, stored
uploads and actual device audio still require a check after deployment.

Reference: [Render Python version settings](https://render.com/docs/python-version).
