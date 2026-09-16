/* ============================================================
   SFX — the sound of the whole site
   ------------------------------------------------------------
   Every noise this site makes comes from here: button presses, the
   navigation rail, the theme dial's detents, a section revealing
   itself, and the robot being punched. One engine, one mute switch.

   WHY SYNTHESISED AND NOT AUDIO FILES
   A dozen interface sounds as MP3s is a few hundred kilobytes to
   download before the first click makes a noise, and a first click
   that arrives before its sample does is exactly the bug we just
   spent a phase fixing. An oscillator and a gain envelope cost
   nothing, arrive with the page, and can be re-pitched per press so
   a fast sequence doesn't turn into one sample machine-gunning.

   WHY A CONTEXT IS NOT CREATED AT LOAD
   Browsers refuse to start audio before the visitor has interacted,
   and — the part that actually bites — an AudioContext is born
   SUSPENDED, with its clock FROZEN, while resume() is asynchronous.
   Scheduling straight after calling resume() books the note at a
   timestamp that is already in the past by the time the context
   really starts, so the browser drops it. That was the "first tap
   makes no sound, second tap works" bug. `withCtx` below is the
   answer: nothing is ever scheduled into a context that is not
   already running.
   ============================================================ */
(function(){
  "use strict";

  const KEY     = "portfolio-sfx";            // the master switch
  const OLD_KEY = "portfolio-robot-sound";    // what the robot's own toggle used

  const AC = window.AudioContext || window.webkitAudioContext;

  /* ---- the master switch --------------------------------------------
     Anyone who muted the robot back when that was the only speaker on
     the site stays muted now that the same button governs everything.
     Reading the old key once and writing the new one keeps that promise
     without asking them to mute a second time. */
  let muted = false;
  try{
    const now = localStorage.getItem(KEY);
    if(now !== null) muted = now === "off";
    else if(localStorage.getItem(OLD_KEY) === "off"){
      muted = true;
      localStorage.setItem(KEY, "off");
    }
  }catch(e){/* private browsing: default to sound on, don't break */}

  let ctx = null;
  let master = null;                       // one gain node everything passes through

  function build(){
    if(!ctx){
      try{ ctx = new AC(); }catch(e){ return null; }
    }
    if(!master){
      master = ctx.createGain();
      master.gain.value = 1;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  /* Wake the clock. Safe to call from any real gesture; harmless if the
     context is already running. */
  function unlock(){
    if(!AC) return null;
    if(!build()) return null;
    if(ctx.state === "suspended") ctx.resume().catch(()=>{});
    return ctx;
  }

  /* ---- withCtx: the rule that everything obeys ----------------------
     Hand the callback a context that is genuinely RUNNING, or don't call
     it at all. One shared wake-up per burst: a single press fires two or
     three voices, and before this each of them called resume() and
     started its own timer. */
  let waking = null;
  function withCtx(fn){
    if(muted || !AC) return;
    if(!build()) return;
    const c = ctx;
    if(c.state === "running"){ fn(c); return; }

    if(!waking){
      waking = new Promise(resolve => {
        let settled = false;
        const done = () => {
          if(settled) return;
          settled = true; waking = null;
          resolve(c.state === "running");
        };
        try{
          const r = c.resume();
          if(r && typeof r.then === "function") r.then(done).catch(done);
          else done();
        }catch(e){ done(); return; }
        /* Safari has shipped versions where resume() resolves late, or
           never, while the state flips anyway. A short poll is the
           difference between a silent first press and a working one. */
        let tries = 0;
        const poll = setInterval(()=>{
          if(settled || ++tries > 12){ clearInterval(poll); if(!settled) done(); return; }
          if(c.state === "running"){ clearInterval(poll); done(); }
        }, 25);
      });
    }
    waking.then(ok => { if(ok && c.state === "running") fn(c); });
  }

  /* ================= the primitives =================
     Two voices make everything below: a pitched oscillator through its
     own envelope, and a band of filtered noise. Interface sounds are
     mostly the second one — what makes a press read as a physical click
     rather than a beep is noise, not pitch. */

  function tone(type, from, to, dur, peak, delay, curve){
    withCtx(c => {
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t0);
      if(to !== from){
        if(curve === "linear") osc.frequency.linearRampToValueAtTime(Math.max(1, to), t0 + dur);
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    });
  }

  /* A band of noise. `to` sweeps the filter rather than the pitch, which
     is what turns a click into a whoosh without changing anything else. */
  function noise(dur, peak, freq, q, delay, to){
    withCtx(c => {
      const t0 = c.currentTime + (delay || 0);
      const frames = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, frames, c.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<frames;i++) data[i] = (Math.random()*2-1) * (1 - i/frames);
      const src = c.createBufferSource(); src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(freq, t0);
      if(to && to !== freq) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      filter.Q.value = q || 1;
      const gain = c.createGain();
      gain.gain.setValueAtTime(peak, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter).connect(gain).connect(master);
      src.start(t0);
    });
  }

  /* ---- don't let a burst become a machine-gun -----------------------
     Rapid taps, a key held down, a resize firing a reveal per frame: any
     of these can ask for the same voice fifty times a second. Each voice
     keeps its own minimum gap, so the first one in a burst is heard and
     the rest are dropped rather than piling up into mush. */
  const last = Object.create(null);
  function gate(name, ms){
    const now = (performance && performance.now) ? performance.now() : Date.now();
    if(last[name] && now - last[name] < ms) return false;
    last[name] = now;
    return true;
  }

  /* ================= the vocabulary =================
     Deliberately quiet. These fire on ordinary interface actions dozens
     of times a visit, and the test for every one of them is not "is it
     satisfying once" but "is it still tolerable on the fortieth press".
     Peaks sit between 0.02 and 0.09 for that reason; the robot, which is
     meant to be loud, is the exception. */
  const SFX = {

    /* A generic control: a tiny high tick with just enough body to feel
       like a switch closing rather than a beep. The pitch wanders a few
       percent per press so a run of clicks doesn't sound looped. */
    click(){
      if(!gate("click", 35)) return;
      const p = 1650 + Math.random()*180;
      noise(0.016, 0.030, p*1.7, 2.6);
      tone("square", p, p*0.62, 0.022, 0.017);
    },

    /* A single keystroke in the terminal. The quietest thing here by a
       wide margin — it fires once per character, so anything with real
       body would be intolerable inside one word. */
    key(){
      if(!gate("key", 22)) return;
      noise(0.010, 0.016, 2600 + Math.random()*700, 3.0);
      tone("square", 1900 + Math.random()*300, 1400, 0.012, 0.008);
    },

    /* Navigation: lower and rounder than a button, so moving between
       sections doesn't sound like pressing one. */
    tap(){
      if(!gate("tap", 40)) return;
      const p = 880 + Math.random()*120;
      noise(0.022, 0.034, 1500, 1.8);
      tone("triangle", p, p*0.7, 0.05, 0.030);
    },

    /* The theme dial landing on a detent. Two layers, because a real
       rotary switch makes two noises at once: the sprung ball dropping
       into the notch (the low knock) and the metal-on-metal edge of it
       (the high tick). One without the other sounds like a UI beep. */
    detent(){
      if(!gate("detent", 28)) return;
      noise(0.030, 0.075, 2300, 3.4);                 // the edge
      tone("square", 420, 190, 0.045, 0.038);         // the knock
      noise(0.050, 0.030, 700, 1.4, 0.008);           // the body of the housing
    },

    /* A switch turning on / off. Same gesture, opposite directions, so
       you can hear which way it went without looking. */
    on(){
      if(!gate("toggle", 60)) return;
      noise(0.018, 0.034, 2000, 2.4);
      tone("triangle", 520, 1040, 0.09, 0.040);
    },
    off(){
      if(!gate("toggle", 60)) return;
      noise(0.018, 0.034, 1700, 2.4);
      tone("triangle", 880, 380, 0.10, 0.038);
    },

    /* A section arriving. A soft sweep rather than a click: it is the
       only sound here that accompanies motion instead of a press, and it
       is pitched low and wide so it sits underneath everything else. */
    reveal(){
      if(!gate("reveal", 220)) return;
      noise(0.26, 0.036, 320, 0.9, 0, 2100);
      tone("sine", 150, 330, 0.24, 0.026, 0.01);
    },

    /* Something opening over the page — a lightbox, the nav rail. */
    open(){
      if(!gate("panel", 90)) return;
      noise(0.09, 0.034, 900, 1.1, 0, 2000);
      tone("sine", 320, 620, 0.10, 0.026);
    },
    close(){
      if(!gate("panel", 90)) return;
      noise(0.09, 0.030, 1900, 1.1, 0, 700);
      tone("sine", 600, 280, 0.11, 0.024);
    },

    /* A message going out, and one arriving. */
    send(){
      if(!gate("msg", 70)) return;
      tone("triangle", 660, 1320, 0.11, 0.038);
      noise(0.05, 0.022, 2400, 1.6, 0, 4200);
    },
    receive(){
      if(!gate("msg", 70)) return;
      tone("triangle", 1180, 700, 0.12, 0.030);
      noise(0.05, 0.020, 1400, 1.6);
    },

    /* Refused input — a wrong key, an empty field, a rejected name. Two
       short low buzzes, which is the shape every physical machine uses
       to say no. */
    error(){
      if(!gate("error", 140)) return;
      tone("square", 220, 200, 0.07, 0.036);
      tone("square", 200, 165, 0.09, 0.034, 0.10);
    },

    /* ---- UNIT-01. Louder on purpose: these are the point of that
       corner of the site, not background texture. ---- */
    hit(){
      if(!gate("hit", 45)) return;
      const p = 420 + Math.random()*260;
      tone("square", p, p*0.55, 0.09, 0.055);
      noise(0.07, 0.09, 1800 + Math.random()*900, 1.2);
    },
    boom(){
      noise(0.55, 0.32, 260, 0.6);
      tone("sawtooth", 180, 32, 0.6, 0.13);
      tone("triangle", 90, 24, 0.75, 0.1, 0.03);
    },
    revive(){
      tone("triangle", 220, 880, 0.34, 0.075);
      tone("sine", 440, 1320, 0.3, 0.05, 0.08);
    },

    /* ---- state ---- */

    /* Called from the first real gesture anywhere on the page, so the
       clock is already running by the time anything wants to make a
       noise. withCtx is the safety net; this is what makes the very
       first press instant rather than a resume() late. */
    prime(){ unlock(); },

    get available(){ return !!AC; },
    get running(){ return !!ctx && ctx.state === "running"; },

    get muted(){ return muted; },
    set muted(value){
      const next = !!value;
      if(next === muted) return;
      muted = next;
      try{ localStorage.setItem(KEY, muted ? "off" : "on"); }catch(e){}
      /* Un-muting happens on a click, which is a gesture — start the
         clock now so the confirming blip is instant. */
      if(!muted){ unlock(); SFX.on(); }
      /* Anything drawing a speaker icon listens for this rather than
         polling, so a toggle anywhere repaints every copy of it. */
      window.dispatchEvent(new CustomEvent("sfx-mute", {detail:{muted}}));
    },
    toggle(){ SFX.muted = !muted; return muted; }
  };

  /* ---- wake the clock on the first real gesture ----------------------
     Capture phase so nothing can stop it first, once-only so it costs one
     listener for the life of the page, and isTrusted because a click
     dispatched by script cannot legally unlock audio — priming on one
     would leave an idle context lying around and earn a console warning
     for nothing. */
  (function primeOnFirstGesture(){
    const EVENTS = ["pointerdown","touchstart","keydown","click"];
    const wake = e => {
      if(!e || !e.isTrusted) return;
      try{ SFX.prime(); }catch(err){}
      for(const ev of EVENTS) window.removeEventListener(ev, wake, true);
    };
    for(const ev of EVENTS) window.addEventListener(ev, wake, true);
  })();

  window.SFX = SFX;
})();
