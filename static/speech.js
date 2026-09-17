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

    /* WHICH VOICE, AND WHY.

       The brief is Optimus Prime: deep, resonant, unhurried, a little
       metallic. The previous scorer chased the opposite — it gave its
       biggest bonus to "robot", "zarvox", "trinoids", "cellos". Those are
       macOS NOVELTY voices: Zarvox is a thin beeping monotone, Trinoids a
       chorus of chirps. They are "robot" in the 1980s-arcade sense and
       nothing at all like a baritone.

       So the hunt is now for the deepest natural male voice the device
       has, and the novelty voices are pushed DOWN rather than up.

       There is no processing to be had here. The Web Speech API exposes a
       voice, a rate and a pitch and nothing else — the synthesised audio
       never passes through anything this code can touch, so no filter,
       resonator or pitch-shift can be applied to it. Choosing well and
       pitching low is the entire available lever, which is why this list
       is as specific as it is. */
    const DEEP = /\b(alex|daniel|david|guy|fred|george|oliver|thomas|aaron|reed|rocko|arthur|gordon|lee|liam|ryan|male)\b/;
    const NOVELTY = /zarvox|trinoids|cellos|bells|boing|bubbles|whisper|bad news|good news|jester|organ|superstar|wobble|bahh|albert|junior|princess|kathy|hysterical|deranged|zuzu/;

    /* A VOICE THAT LIVES ON THE DEVICE BEATS A BETTER ONE THAT DOES NOT.

       This weighting used to say the opposite, and it is what made the
       terminal speaker fail on its first press: `localService` was worth 4
       points while the name "google" was worth 10, so on desktop Chrome the
       scorer picked "Google UK English Male" — a NETWORK voice — over the
       local baritone Daniel, by six points.

       A network voice has to fetch its audio the first time it is used.
       Until that fetch lands the utterance has been accepted and has not
       started, which from the page is indistinguishable from an engine that
       has wedged; the watchdog concluded exactly that and turned the button
       red. The visitor's description was the diagnosis: "it looks like it's
       calling the speaker api first."

       It also cannot work offline, and it can stall part-way through a long
       line. None of that is worth a slightly nicer timbre, so being local is
       now worth more than any other single property. The vendor bonus is
       gone with it — Android's Google voices are mostly local and still win
       on their own merits, which is the distinction that actually matters. */
    const score = v => {
      const n = (v.name || "").toLowerCase();
      const lang = (v.lang || "").toLowerCase();
      let s = 0;
      if(DEEP.test(n)) s += 45;                       // a baritone, which is the point
      if(NOVELTY.test(n)) s -= 70;                    // beeps and chirps are not Optimus
      if(/female|samantha|victoria|karen|moira|tessa|fiona|zira|susan/.test(n)) s -= 30;
      if(/natural|enhanced|premium|neural/.test(n)) s += 16;   // more body, less buzz
      if(lang.startsWith("en-gb")) s += 8;            // the films' cadence is closer to this
      if(lang.startsWith("en")) s += 25;
      if(v.localService) s += 40;                     // instant, offline, cannot stall
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

  /* The last thing we were asked to say, kept so a read that never starts
     can be tried again without the visitor pressing anything. `tries`
     guards it: one retry, never a loop. */
  let lastSaid = null;

  function speak(text, opts, isRetry){
    if(!supported) return false;
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if(!clean) return false;
    const o = opts || {};
    if(!isRetry) lastSaid = {text: clean, opts: o, tries: 0};

    /* THE FIRST-CLICK SILENCE.

       This used to cancel() and defer on EVERY interrupting call, including
       the very first one, when there was nothing to interrupt. Both halves
       of that were harmful on a cold engine:

         * cancel() before anything has ever been spoken leaves Chrome's
           queue in a state where the next speak() is accepted and dropped;
         * and the 60ms setTimeout moved speak() out of the click's task.
           Chrome will only start speech from a user-activated task the
           first time, so the deferred call was refused — silently, as
           always. The click still primed the page's sticky activation, so
           the SECOND click worked. That is exactly the reported symptom:
           "the first click activates it and the second one talks".

       So an interrupt is only performed when there is genuinely something
       in flight. With nothing to cancel there is nothing to wait for, and
       the utterance is queued synchronously — still inside the click. */
    const mustInterrupt = !!o.interrupt &&
      (outstanding > 0 || synth.speaking || synth.pending);

    if(mustInterrupt){
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

    const fire = () => {
      enqueue();
      // Chrome can leave the queue paused from an earlier session.
      try{ synth.resume(); }catch(e){}
      startWatchdog();
    };

    /* Only a real cancel needs the tick of separation (speak() in the same
       tick as cancel() is a Chrome dead-end). Everything else goes out now,
       synchronously, so it is still inside the user gesture that asked for
       it. */
    if(mustInterrupt) setTimeout(fire, 60);
    else fire();
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
  /* HOW LONG THE ENGINE IS ALLOWED TO BE SLOW BEFORE WE CALL IT BROKEN.

     1.5s is a fair budget for a warm local voice and far too mean for a cold
     one. It is not a bug for the first read of a session to take a couple of
     seconds — the engine may be waking, or fetching a voice — and declaring
     failure at 1.5s is what put a red cross on a button that was about to
     work perfectly well. `WAITING_MS` is the total the engine gets while it
     still claims to be holding our utterance; `GRACE_MS` is how long each
     extension runs. Past that it really has stopped, and saying so is
     better than a spinner that never ends. */
  const GRACE_MS = 1500;
  const WAITING_MS = 12000;
  let waited = 0;

  function startWatchdog(ms){
    clearTimeout(watchdog);
    if(!outstanding) return;
    const budget = ms || START_MS;
    if(budget === START_MS && !ms) waited = 0;   // a fresh read, fresh patience
    watchdog = setTimeout(()=>{
      if(!outstanding) return;
      if(budget !== STALL_MS && started) return;

      /* IS IT BROKEN, OR MERELY SLOW? Those need different answers and the
         engine will tell us which: `speaking`/`pending` stay true from the
         moment speak() is accepted, so an utterance that has not started
         while the engine still claims it is one being WORKED ON — a voice
         being fetched, most often. Cancelling that to "retry" is the worst
         possible move: it throws away a download that was nearly done and
         starts another from cold, which is why the first press could never
         win however long the visitor waited.

         So while the engine is holding it, we wait. Only when the engine has
         gone idle with our utterance unaccounted for has it genuinely been
         dropped, and only then is there anything to retry. */
      let holding = false;
      try{ holding = !!(synth.speaking || synth.pending); }catch(e){}
      if(!started && holding && waited < WAITING_MS){
        waited += GRACE_MS;
        startWatchdog(GRACE_MS);
        return;
      }

      /* IT NEVER STARTED. Try once more before giving up.

         This is the recoverable case, and it is common: Chrome accepts an
         utterance and silently drops it after certain cancel/speak
         sequences, and some engines need a beat after waking. Nothing has
         been spoken, so repeating it cannot talk over anything.

         The retry does not need a fresh gesture. The press that got us
         here already set the page's sticky activation, which is what the
         engine actually checks — so the visitor does not have to press the
         same button a second time to make it work, which is the whole
         point of this branch.

         Exactly one retry. A loop against an engine with no voices
         installed would keep a phone awake saying nothing. */
      const canRetry = budget !== STALL_MS && !started &&
                       lastSaid && lastSaid.tries < 1;
      if(canRetry){
        lastSaid.tries += 1;
        const again = lastSaid;
        outstanding = 0;
        alive.length = 0;
        try{ synth.cancel(); }catch(e){}
        /* A tick of separation after cancel(), for the same Chrome reason
           the first queue needed one. onDrain is deliberately left in
           place: the caller is still waiting on this read, and the retry
           is the same read, not a new one. */
        setTimeout(()=>speak(again.text, again.opts, true), 80);
        return;
      }

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
    /* OPTIMUS. Pitch near the floor and a rate under one: he is deep, and
       he does not hurry. 0.55/0.94 was "a slightly low robot"; this is a
       different character. The engine clamps both, so asking for 0.1 asks
       for the lowest the device will give rather than a specific note. */
    robot(text, interrupt, onend){
      if(window.SFX && window.SFX.vox) window.SFX.vox();
      return speak(text, {rate:0.86, pitch:0.15, interrupt:!!interrupt, onend});
    },
    plain(text, interrupt, onend){
      return speak(text, {rate:1, pitch:1, interrupt:!!interrupt, onend});
    },
    stop(){
      if(!supported) return;
      /* Drop the retry too. Someone pressing stop does not want the thing
         they stopped coming back a moment later. */
      lastSaid = null;
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
