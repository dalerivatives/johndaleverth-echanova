/* ============================================================
   SPEECH  —  window.Speech

   One shared wrapper over the browser's SpeechSynthesis, used by the robot
   (which reads out every chat message) and by the terminal's read-aloud
   button. Centralised because there is only ONE speech engine per page: two
   modules each calling speechSynthesis directly would talk over each other,
   and cancelling one would silently cut the other off.

   Nothing is downloaded — the voices are the ones already on the device.
   That does mean the exact voice differs between machines, so the robot
   character comes from pitch and rate plus a preference for a low or
   "robotic" voice where the platform offers one, rather than from a
   specific named voice that only exists on one OS.
   ============================================================ */
(() => {
  const synth = window.speechSynthesis;
  const supported = !!synth && typeof SpeechSynthesisUtterance === "function";

  let voices = [];
  let chosen = null;
  let unlocked = false;

  /* Voice lists load asynchronously on most browsers and come back empty on
     the first synchronous call, which is why this re-runs on the event. */
  function refreshVoices(){
    if(!supported) return;
    voices = synth.getVoices() || [];
    if(!voices.length) return;

    const score = v => {
      const n = (v.name || "").toLowerCase();
      let s = 0;
      if(/robot|zarvox|trinoids|cellos|android|whisper/.test(n)) s += 60;
      if(/google|microsoft|natural/.test(n)) s += 12;
      if(/male|david|daniel|alex|fred|george|guy/.test(n)) s += 18;
      if((v.lang || "").toLowerCase().startsWith("en")) s += 25;
      if(v.localService) s += 6;
      return s;
    };
    chosen = voices.slice().sort((a,b)=>score(b)-score(a))[0] || null;
  }

  if(supported){
    refreshVoices();
    synth.addEventListener("voiceschanged", refreshVoices);
    /* Chrome refuses to speak until the page has had a real user gesture,
       and the refusal is silent — the utterance just never fires. Priming
       once on the first interaction avoids a first message that vanishes. */
    const prime = ()=>{
      unlocked = true;
      try{ synth.resume(); }catch(e){}
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
    window.addEventListener("pointerdown", prime, {once:false});
    window.addEventListener("keydown", prime, {once:false});
  }

  /* Long text is split on sentence boundaries. Two reasons, not one: some
     engines silently drop an over-long utterance, and Chrome cuts one off
     around 15 seconds. 140 characters is about ten seconds at normal rate,
     which stays clear of both without chopping the delivery into fragments. */
  const CHUNK_CHARS = 140;
  function chunk(text, size){
    const out = [];
    let rest = String(text || "").trim();
    while(rest.length > size){
      let cut = rest.lastIndexOf(". ", size);
      if(cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
      if(cut <= 0) cut = size;
      out.push(rest.slice(0, cut + 1).trim());
      rest = rest.slice(cut + 1).trim();
    }
    if(rest) out.push(rest);
    return out;
  }

  /* ---- tracking what is actually being said -------------------------

     `speechSynthesis.speaking` is NOT a reliable way to ask "is it still
     going?" when more than one utterance is queued: between two chunks it
     and `pending` can both read false for a tick, and anything polling that
     gap concludes the speech ended. That is exactly what made the terminal
     button flip back to off about a second in — the first chunk finished,
     the poll caught the seam, and the button reset while the voice carried
     on talking.

     So the queue is counted here instead, from the utterances' own start,
     end and error events, and the "finished" callback fires once — when the
     LAST one drains. */
  let outstanding = 0;
  let onDrain = null;
  let keepAlive = null;
  let watchdog = null;
  let started = false;

  /* THE reason speech cut out after about a second.

     Chrome garbage-collects an utterance that nothing references any more —
     and once it does, the audio stops mid-sentence and the end event fires
     as if it had finished. `speak()` built its utterances as locals, so the
     moment that function returned they were unreachable and eligible for
     collection; a short line would just about survive, a longer one would
     not. Holding them in a live array until they settle is the fix, and
     forgetting them afterwards keeps that array from growing all session. */
  const alive = [];
  function forget(u){
    const i = alive.indexOf(u);
    if(i >= 0) alive.splice(i, 1);
  }

  /* Chrome stops speaking about 15 seconds into a single utterance. The
     widely-copied workaround is pause()+resume() on a timer — and on some
     Chrome/Windows builds that itself kills the utterance it was meant to
     save, which is a miserable way to "fix" silence.

     Short chunks are the other standard answer and the safe one: keep every
     utterance well under the limit and it never triggers. CHUNK_CHARS is
     sized for that — roughly ten seconds of speech at normal rate, with
     margin for a slow voice — so nothing here needs nudging at all. */
  function stopKeepAlive(){
    if(keepAlive){ clearInterval(keepAlive); keepAlive = null; }
  }

  function settle(){
    /* An utterance ending is proof the engine did something, so it counts as
       "started" even on an engine that never fires onstart — some do skip
       it, and the watchdog must not then cut a perfectly good read short. */
    started = true;
    clearTimeout(watchdog);

    outstanding = Math.max(0, outstanding - 1);
    if(outstanding > 0){
      /* Still chunks to go. Re-arm on a STALL budget rather than the start
         budget: a chunk legitimately takes several seconds to speak, so the
         1.5s "did it begin?" timeout would cut a healthy read to pieces.
         This only catches an engine that has genuinely stopped advancing. */
      startWatchdog(STALL_MS);
      return;
    }
    started = false;
    stopKeepAlive();
    const done = onDrain;
    onDrain = null;
    if(typeof done === "function") done(true);     // true = it actually spoke
  }

  function speak(text, opts){
    if(!supported) return false;
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if(!clean) return false;
    const o = opts || {};
    if(o.interrupt){
      // cancel() fires no end event for what it drops, so the count has to
      // be reset by hand or the queue would never look drained again.
      outstanding = 0;
      onDrain = null;
      alive.length = 0;
      synth.cancel();
    }
    if(!chosen) refreshVoices();

    const parts = chunk(clean, CHUNK_CHARS);
    if(!parts.length) return false;
    onDrain = typeof o.onend === "function" ? o.onend : null;

    /* Queue on the next tick, not this one. Calling speak() in the same tick
       as cancel() is a long-standing Chrome dead-end: the utterance is
       accepted, never starts, and no event ever fires — the exact shape of
       "I pressed it and nothing happened". One tick of separation avoids it,
       and is imperceptible. */
    const enqueue = () => parts.forEach(part=>{
      const u = new SpeechSynthesisUtterance(part);
      if(chosen) u.voice = chosen;
      u.rate  = o.rate  != null ? o.rate  : 1;
      u.pitch = o.pitch != null ? o.pitch : 1;
      u.volume = o.volume != null ? o.volume : 1;
      u.lang = (chosen && chosen.lang) || "en-US";
      u.onstart = ()=>{ started = true; clearTimeout(watchdog); };
      u.onend = ()=>{ forget(u); settle(); };
      u.onerror = ()=>{ forget(u); settle(); };   // a dropped utterance must not strand the count
      alive.push(u);                              // keep it reachable — see `alive`
      outstanding += 1;
      synth.speak(u);
    });

    setTimeout(()=>{
      enqueue();
      // Chrome can leave the queue paused from an earlier session.
      try{ synth.resume(); }catch(e){}
      startWatchdog();
    }, o.interrupt ? 60 : 0);
    return true;
  }

  /* If the engine accepts everything and then simply never speaks — which
     Chrome does after certain cancel/speak sequences, and some Linux setups
     do when no voice is installed — nothing would ever call settle(), and a
     caller waiting on `onend` would wait forever. The watchdog gives it a
     second and a half to start, then gives up cleanly: the queue is cleared,
     the drain callback runs, and whatever UI was showing "playing" goes back
     to rest instead of lying. */
  const START_MS = 1500;    // "it never began at all"
  const STALL_MS = 20000;   // "it began and then stopped advancing"

  function startWatchdog(ms){
    clearTimeout(watchdog);
    if(!outstanding) return;
    const budget = ms || START_MS;
    watchdog = setTimeout(()=>{
      if(!outstanding) return;
      if(budget === START_MS && started) return;
      // eslint-disable-next-line no-console
      console.warn("[speech] the engine stopped responding — giving up on this read");
      outstanding = 0;
      const done = onDrain;
      onDrain = null;
      alive.length = 0;
      try{ synth.cancel(); }catch(e){}
      if(typeof done === "function") done(false);   // false = nothing was said
    }, budget);
  }

  window.Speech = {
    supported,
    /* The robot's voice: below normal pitch and a touch slow, which is what
       reads as machine rather than assistant. */
    robot(text, interrupt, onend){
      return speak(text, {rate:0.94, pitch:0.55, interrupt:!!interrupt, onend});
    },
    plain(text, interrupt, onend){
      return speak(text, {rate:1, pitch:1, interrupt:!!interrupt, onend});
    },
    stop(){
      if(!supported) return;
      outstanding = 0;
      onDrain = null;
      alive.length = 0;
      started = false;
      clearTimeout(watchdog);
      stopKeepAlive();
      synth.cancel();
    },
    /* Counted from the utterances' own events, not from
       `synth.speaking` — see the note above `outstanding`. */
    get speaking(){ return outstanding > 0; },
    get primed(){ return unlocked; }
  };
})();
