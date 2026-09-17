/* ============================================================
   SPEECH  —  window.Speech

   One shared wrapper over the browser's SpeechSynthesis. The goal is a
   smooth, low male/robot character without relying on novelty robot voices,
   because those are usually the least natural and vary wildly in tempo.
   ============================================================ */
(() => {
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof SpeechSynthesisUtterance === "function";

  let voices = [];
  let chosen = null;
  let voiceLocked = false;
  let unlocked = false;

  /* Prefer a high-quality English male/natural voice. The robot character is
     then created gently with rate/pitch; forcing a novelty robot voice or an
     extreme pitch is what made syllables and sentences feel uneven. */
  function voiceScore(v){
    const n = (v.name || "").toLowerCase();
    const lang = (v.lang || "").toLowerCase();
    let s = 0;

    if(lang === "en-us") s += 45;
    else if(lang.startsWith("en")) s += 36;
    else s -= 80;

    if(/natural|neural|premium|enhanced/.test(n)) s += 42;
    if(/microsoft|google|apple/.test(n)) s += 16;

    /* Common male English voice names across Windows/macOS/browser engines. */
    if(/\b(guy|david|mark|george|daniel|ryan|alex|fred|aaron|arthur|brian|christopher|eric|james|john|liam|oliver|thomas)\b/.test(n)) s += 36;

    /* Avoid novelty/effect voices: fun, but poor for smooth narration. */
    if(/robot|zarvox|trinoids|cellos|whisper|boing|bells|bad news|good news/.test(n)) s -= 70;
    if(/\b(zira|aria|samantha|victoria|susan|hazel|karen|moira|fiona|tessa)\b/.test(n)) s -= 12;

    if(v.localService) s += 5; // stable/offline is a small bonus, not a requirement
    if(v.default) s += 3;
    return s;
  }

  function refreshVoices(){
    if(!supported) return;
    const list = synth.getVoices() || [];
    if(!list.length) return;
    voices = list;

    /* Once the page has actually chosen a voice for speech, keep it for the
       session. Some browsers fire voiceschanged more than once; changing the
       winner mid-visit makes the robot sound like a different person. */
    if(voiceLocked && chosen && list.some(v => v.name === chosen.name && v.lang === chosen.lang)) return;

    chosen = list.slice().sort((a,b)=>voiceScore(b)-voiceScore(a))[0] || null;
  }

  if(supported){
    refreshVoices();
    synth.addEventListener("voiceschanged", refreshVoices);
    const prime = ()=>{
      unlocked = true;
      try{ synth.resume(); }catch(e){}
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, {once:false});
    window.addEventListener("keydown", prime, {once:false});
  }

  /* Give punctuation predictable pauses. Smart typography and slash-heavy
     technical wording can make browser TTS engines abruptly change cadence. */
  function normalize(text){
    return String(text || "")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[—–]+/g, ", ")
      .replace(/\s*[·•]\s*/g, ", ")
      .replace(/\bUI\s*\/\s*UX\b/gi, "U I, U X")
      .replace(/\bIoT\b/g, "I O T")
      .replace(/\bAI\b/g, "A I")
      .replace(/\s+([,.;!?])/g, "$1")
      .replace(/([,.;!?])(?=[A-Za-z])/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* A single utterance keeps one continuous prosody contour. 220 chars keeps
     the profile terminal in one pass on normal content while remaining below
     Chrome's long-utterance trouble zone for ordinary English. */
  const CHUNK_CHARS = 220;

  function splitLong(piece, size){
    const out = [];
    let rest = piece.trim();
    while(rest.length > size){
      let cut = -1;
      for(const mark of ["; ", ", ", ": ", " "]){
        const at = rest.lastIndexOf(mark, size);
        if(at > cut && at >= Math.floor(size * .62)) cut = at + (mark === " " ? 0 : 1);
      }
      if(cut <= 0) cut = size;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if(rest) out.push(rest);
    return out;
  }

  function chunk(text, size){
    const clean = String(text || "").trim();
    if(!clean) return [];
    if(clean.length <= size) return [clean];

    const sentences = clean.match(/[^.!?]+[.!?]+(?:["'](?=\s|$))?|[^.!?]+$/g) || [clean];
    const out = [];
    let current = "";

    for(const raw of sentences){
      const sentence = raw.trim();
      if(!sentence) continue;
      if(sentence.length > size){
        if(current){ out.push(current); current = ""; }
        out.push(...splitLong(sentence, size));
        continue;
      }
      const merged = current ? `${current} ${sentence}` : sentence;
      if(merged.length <= size) current = merged;
      else { if(current) out.push(current); current = sentence; }
    }
    if(current) out.push(current);
    return out;
  }

  let outstanding = 0;
  let onDrain = null;
  let watchdog = null;
  let started = false;
  const alive = [];

  function forget(u){
    const i = alive.indexOf(u);
    if(i >= 0) alive.splice(i, 1);
  }

  function settle(){
    started = true;
    clearTimeout(watchdog);
    outstanding = Math.max(0, outstanding - 1);
    if(outstanding > 0){
      startWatchdog(STALL_MS);
      return;
    }
    started = false;
    const done = onDrain;
    onDrain = null;
    if(typeof done === "function") done(true);
  }

  let lastSaid = null;

  function speak(text, opts, isRetry){
    if(!supported) return false;
    const clean = normalize(text);
    if(!clean) return false;
    const o = opts || {};
    if(!isRetry) lastSaid = {text: clean, opts: o, tries: 0};

    const mustInterrupt = !!o.interrupt &&
      (outstanding > 0 || synth.speaking || synth.pending);

    if(mustInterrupt){
      outstanding = 0;
      onDrain = null;
      alive.length = 0;
      synth.cancel();
    }

    if(!chosen) refreshVoices();
    if(chosen) voiceLocked = true;

    const parts = chunk(clean, CHUNK_CHARS);
    if(!parts.length) return false;
    onDrain = typeof o.onend === "function" ? o.onend : null;

    const enqueue = () => parts.forEach(part=>{
      const u = new SpeechSynthesisUtterance(part);
      if(chosen) u.voice = chosen;
      u.rate = o.rate != null ? o.rate : 1;
      u.pitch = o.pitch != null ? o.pitch : 1;
      u.volume = o.volume != null ? o.volume : 1;
      u.lang = (chosen && chosen.lang) || "en-US";
      u.onstart = ()=>{ started = true; clearTimeout(watchdog); };
      u.onend = ()=>{ forget(u); settle(); };
      u.onerror = ()=>{ forget(u); settle(); };
      alive.push(u);
      outstanding += 1;
      synth.speak(u);
    });

    const fire = () => {
      enqueue();
      try{ synth.resume(); }catch(e){}
      startWatchdog();
    };

    if(mustInterrupt) setTimeout(fire, 60);
    else fire();
    return true;
  }

  const START_MS = 1800;
  const STALL_MS = 24000;

  function startWatchdog(ms){
    clearTimeout(watchdog);
    if(!outstanding) return;
    const budget = ms || START_MS;
    watchdog = setTimeout(()=>{
      if(!outstanding) return;
      if(budget === START_MS && started) return;

      const canRetry = budget === START_MS && !started &&
                       lastSaid && lastSaid.tries < 1;
      if(canRetry){
        lastSaid.tries += 1;
        const again = lastSaid;
        outstanding = 0;
        alive.length = 0;
        try{ synth.cancel(); }catch(e){}
        setTimeout(()=>speak(again.text, again.opts, true), 80);
        return;
      }

      console.warn("[speech] the engine stopped responding — giving up on this read");
      outstanding = 0;
      const done = onDrain;
      onDrain = null;
      alive.length = 0;
      try{ synth.cancel(); }catch(e){}
      if(typeof done === "function") done(false);
    }, budget);
  }

  window.Speech = {
    supported,

    /* Smooth machine voice: low enough to sound synthetic, but not so low that
       the engine stretches vowels/consonants at different rates. */
    robot(text, interrupt, onend){
      return speak(text, {rate:0.92, pitch:0.82, volume:1, interrupt:!!interrupt, onend});
    },

    plain(text, interrupt, onend){
      return speak(text, {rate:0.96, pitch:0.94, volume:1, interrupt:!!interrupt, onend});
    },

    stop(){
      if(!supported) return;
      lastSaid = null;
      outstanding = 0;
      onDrain = null;
      alive.length = 0;
      started = false;
      clearTimeout(watchdog);
      synth.cancel();
    },

    get speaking(){ return outstanding > 0; },
    get primed(){ return unlocked; },
    get voiceName(){ return chosen ? chosen.name : ""; }
  };
})();
