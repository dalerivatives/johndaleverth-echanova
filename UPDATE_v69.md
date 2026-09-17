# v69 update

Anonymous visitors now have a head-and-shoulders silhouette within a fully
circular avatar. The disc and silhouette use theme colors for contrast.
Registered visitors keep their own avatar. No +N badge is added.

Voice changes:
- Terminal lines are joined as continuous prose instead of inserting a full
  stop at each visual line break.
- Longer speech is split at sentence/word boundaries, up to 440 characters,
  instead of resetting intonation every 120 characters.
- Terminal narration uses a wider intonation range and moderate male pitch.
  Robot speech also has a less extreme pitch and more expressive delivery.
- Common engineering terms have spoken forms: AI, IoT, HTML, CSS, UI, UX,
  SQL, API, C++, C#, GitHub, Node.js and others.
- Accented names and sentence punctuation are retained. Only spoken text is
  normalized; visible profile text remains unchanged.
- The welcome WAV was regenerated with the updated robot settings. whoami
  still says only "Welcome to my world!", with no message box.

This continues to use local eSpeak NG: a synthetic male/robot voice, not a
studio or neural recording. Unusual personal/place names may still need a
specific pronunciation adjustment. No external voice service or account is used.

Deploy all project files, including the backend and new welcome audio. Keep
existing environment settings, database and uploaded content. The Trevelade
loading logo, loading gate and keep-awake workflow remain in place.

Validation: seven backend tests passed, including pronunciation normalization
and distinct narration/robot audio; speech-controller and loader tests passed.
Physical-device listening and browser visual testing remain unverified.
