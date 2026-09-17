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
      /* Everything goes through one bus, and the bus goes straight out.

         There WAS a DynamicsCompressor here as a safety limiter. Measured
         offline, it cost 13dB on a signal peaking at -22dBFS — twenty-two
         decibels below its own -6dB threshold, where it should have been
         doing nothing at all. Click 0.080 in, 0.018 out. That single node
         was most of why the palette sounded thin and far away, and it was
         solving a problem that does not exist: these voices are short and
         sparse, the loudest peaks about 0.15, so even four landing at once
         stays well clear of full scale. Levels are set by design instead. */
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
     started its own timer.

     WHAT HAPPENS WHEN THAT FAILS
     It can, legitimately. resume() is refused when the browser does not
     believe a gesture is in play. iOS suspends the context outright for a
     phone call, an alarm, or another app taking the audio session, and
     hands it back "interrupted". A backgrounded tab gets suspended and
     stays that way until it is looked at again.

     Before, the sound was simply dropped and you pressed again. Now it is
     HELD: the callback goes into a pending list, and the moment the
     context does start running — on the next gesture, when the
     interruption ends, when the tab comes back — the list fires. The
     visitor does not press twice. */
  let waking = null;

  /* Sounds waiting for a context that is not running yet. Bounded, and
     stamped, because a held sound is only worth playing if it is still
     current: a click you queued four seconds ago is an echo of something
     you have already stopped thinking about, not feedback. */
  const held = [];
  const HOLD_MAX = 8;
  const HOLD_MS  = 4000;

  function hold(fn){
    const now = (performance && performance.now) ? performance.now() : Date.now();
    held.push({fn, at: now});
    /* Keep the most recent. If a burst piles up while the audio is asleep,
       the newest few are the ones that still mean something. */
    while(held.length > HOLD_MAX) held.shift();
  }

  function flush(){
    if(!ctx || ctx.state !== "running" || !held.length) return;
    const now = (performance && performance.now) ? performance.now() : Date.now();
    const due = held.splice(0, held.length).filter(h => now - h.at < HOLD_MS);
    for(const h of due){
      /* One bad voice must not swallow the rest of the queue. */
      try{ h.fn(ctx); }catch(e){}
    }
  }

  /* The context tells us when it wakes up, whatever woke it — our own
     resume(), the end of an iOS interruption, the tab being looked at
     again. This is the recovery path that needs no gesture at all, and it
     is why a held sound can arrive without the visitor doing anything. */
  function watch(c){
    if(!c || c.__sfxWatched) return;
    c.__sfxWatched = true;
    const onChange = () => {
      if(c.state === "running"){ flush(); return; }
      /* It went to sleep. Re-arm the first-gesture primer so the next
         touch wakes it, instead of leaving the site silent until someone
         happens to press something that queues a sound. */
      armPrimer();
    };
    if(c.addEventListener) c.addEventListener("statechange", onChange);
    else c.onstatechange = onChange;
  }

  function withCtx(fn){
    if(muted || !AC) return;
    if(!build()) return;
    const c = ctx;
    watch(c);
    if(c.state === "running"){ flush(); fn(c); return; }

    /* Not running. Hold the sound FIRST, so that however the wake-up goes
       — resolved, rejected, or never answered — it is already queued for
       whenever the context does come up. */
    hold(fn);

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
    waking.then(ok => {
      if(ok && c.state === "running"){ flush(); return; }
      /* The wake-up failed. The sound stays held and the primer is
         re-armed, so the visitor's next touch anywhere plays it. Nothing
         is retried here in a loop: without a gesture a retry cannot
         succeed, and hammering resume() just fills the console. */
      armPrimer();
    });
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
  /* `shape`: "hit" gives a near-instant exponential decay, which is what a
     STRIKE sounds like — a pawl hitting steel, a switch bottoming out.
     The default linear fade is right for a wash or a sweep and wrong for
     an impact: it is what made the old presses read as a short buzz
     rather than as something being hit. */
  function noise(dur, peak, freq, q, delay, to, shape, type){
    withCtx(c => {
      const t0 = c.currentTime + (delay || 0);
      const frames = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, frames, c.sampleRate);
      const data = buffer.getChannelData(0);
      if(shape === "tail"){
        /* A long natural decay — loud immediately, then falling away for
           the better part of a second. The linear fade is too even for a
           blast tail (it reads as a fade-out someone is performing) and
           the "hit" curve is far too fast. */
        for(let i=0;i<frames;i++) data[i] = (Math.random()*2-1) * Math.exp(-3.2 * i/frames);
      }else if(shape === "hit"){
        /* A steep exponential over a LONGER buffer, rather than a gentle
           one over a short buffer. Both are over in about the same few
           milliseconds by ear, but the short version held only ~430
           samples, and the spectrum of 430 random samples is close to
           random itself: measured across renders, the click's spectral
           centre wandered by +/-1700Hz. A press that is different every
           time is the point; a press that is a DIFFERENT SOUND every time
           is sloppiness. More samples, same envelope, a third of the
           variance. */
        for(let i=0;i<frames;i++) data[i] = (Math.random()*2-1) * Math.exp(-16 * i/frames);
      }else{
        for(let i=0;i<frames;i++) data[i] = (Math.random()*2-1) * (1 - i/frames);
      }
      const src = c.createBufferSource(); src.buffer = buffer;
      const filter = c.createBiquadFilter();
      /* bandpass for a body or a wash; highpass for a STRIKE, which has to
         keep its top end — a short burst through a low-Q bandpass loses
         most of exactly the brightness that makes it sound like an
         impact rather than a puff. */
      filter.type = type || "bandpass";
      filter.frequency.setValueAtTime(freq, t0);
      if(to && to !== freq) filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
      filter.Q.value = q || 1;
      const gain = c.createGain();
      if(shape === "tail"){
        /* The BUFFER already carries the decay for a tail, so the gain
           stays flat and only releases at the very end.

           This was a real and invisible bug: the shaped buffer and this
           envelope were both decaying exponentially, and the two multiply.
           A 1.3s tail with a gentle exp(-3.2) in its samples was also
           being ramped from 0.34 to 0.0001 — another factor of 3400 — so
           the effective decay was exp(-11) and the rumble was inaudible
           by 350ms. Dumping the envelope in 50ms slices is what showed it;
           the arithmetic on paper said 1.3 seconds. */
        gain.gain.setValueAtTime(peak, t0);
        gain.gain.setValueAtTime(peak, t0 + dur*0.94);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      }else{
        gain.gain.setValueAtTime(peak, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      }
      src.connect(filter).connect(gain).connect(master);
      src.start(t0);
    });
  }

  /* The BODY of an impact: a low sine whose pitch collapses almost
     immediately. This is the part the old presses were missing entirely —
     they had 0% of their energy below 400Hz, which is exactly why they
     sounded like an insect rather than like a switch. You barely hear this
     on its own; you notice when it is gone. */
  function thock(from, to, dur, peak, delay){
    withCtx(c => {
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur*0.7);
      g.gain.setValueAtTime(peak, t0);                       // no fade-in: it is a hit
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    });
  }

  /* METAL. A struck steel part does not ring on a harmonic series the way
     a string does — its partials are INHARMONIC, unevenly spaced, and the
     high ones die first. That irregular spacing is the whole difference
     between "a bell" and "a beep", and it is what a revolver cylinder
     dropping into its notch actually sounds like. Each partial gets its
     own decay so the sound thins as it fades, like real metal. */
  function ring(partials, delay){
    withCtx(c => {
      const t0 = c.currentTime + (delay || 0);
      for(const [f, amp, dur] of partials){
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sine";
        /* A few cents of drift per strike. Identical partials every time
           is the tell of a sample; real metal never rings twice alike. */
        osc.frequency.setValueAtTime(f * (1 + (Math.random()-0.5)*0.014), t0);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(amp, t0 + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.connect(g).connect(master);
        osc.start(t0); osc.stop(t0 + dur + 0.02);
      }
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
    /* A GOOD SWITCH, in three layers.

       The old one was a 1650Hz tick with 0% of its energy below 400Hz —
       measurably an insect. What a quality button actually sounds like is
       a STRIKE (the high transient of two hard things meeting), a BODY
       (the low thud of the mass behind it) and an EDGE (a brief mid tone
       that gives it a pitch). Drop any one and it stops sounding like an
       object: no strike and it is a beep, no body and it is a mosquito,
       no edge and it is a tap on cardboard. */
    click(){
      if(!gate("click", 34)) return;
      const j = 0.94 + Math.random()*0.12;                        // life per press
      noise(0.022, 0.185, 1700*j, 0.7, 0, 1200, "hit", "highpass"); // strike
      thock(250*j, 132, 0.030, 0.050);                              // body
      tone("square", 900*j, 540, 0.018, 0.045);                    // edge
    },

    /* A single keystroke in the terminal. The quietest thing here by a
       wide margin — it fires once per character, so anything with real
       body would be intolerable inside one word. */
    /* A single keystroke in the terminal. Same three layers as a click,
       scaled right down — it fires once per character, so anything with
       real weight would be intolerable inside one word. */
    key(){
      if(!gate("key", 20)) return;
      const j = 0.9 + Math.random()*0.2;
      noise(0.013, 0.055, 1350*j, 0.8, 0, 1000, "hit", "highpass");
      thock(320*j, 190, 0.015, 0.026);
      tone("square", 1250*j, 900, 0.009, 0.014);
    },

    /* Navigation. The same object, struck more softly and lower down, so
       moving between sections does not sound like pressing a button. */
    tap(){
      if(!gate("tap", 38)) return;
      const j = 0.94 + Math.random()*0.12;
      noise(0.024, 0.150, 1250*j, 0.7, 0, 900, "hit", "highpass");
      thock(200*j, 112, 0.038, 0.048);
      tone("triangle", 660*j, 420, 0.028, 0.040);
    },

    /* THE DIAL — one pawl of a bike hub freewheel.

       A revolver cylinder and a freewheel are both ratchets and they
       sound nothing alike, because the difference is MASS. A revolver
       turns a heavy steel cylinder: the note is low, the body thuds, the
       ring is long. A bike hub pawl is a sliver of spring steel flicking
       over a fine tooth — almost no weight behind it, so it is bright,
       quick and dry. Coasting is dozens of these a second, and any real
       low thump in one of them would turn that into a rumble.

       Against the revolver it replaces: the pawl strike moved up and got
       shorter, the ring partials moved up about an octave and lost two
       thirds of their decay, and the mass layer — the whole point of the
       revolver — is a fifth of what it was, kept only so the tick has
       somewhere to sit instead of floating.

       The partials stay INHARMONIC. That is what makes steel sound like
       steel at any size; only their register says whether the steel is
       heavy or light. */
    detent(){
      if(!gate("detent", 24)) return;
      const j = 0.96 + Math.random()*0.08;

      noise(0.010, 0.26, 4000*j, 0.8, 0, 3000, "hit", "highpass");   // the pawl
      ring([                                                          // fine teeth
        [2480*j, 0.050, 0.032],
        [3390*j, 0.042, 0.027],
        [4610*j, 0.032, 0.021],
        [6180*j, 0.020, 0.015],
        [8240*j, 0.011, 0.011]
      ]);
      /* The hub SHELL. A freewheel pawl has almost no mass of its own,
         but it is flicking against an aluminium drum that does — take
         this out entirely and the tick floats, all hiss and no object.
         At 98% treble it measured as escaping steam rather than a
         ratchet; a fifth of a revolver's body is the difference. */
      thock(300*j, 190, 0.026, 0.044);
      noise(0.018, 0.038, 1900*j, 1.3, 0.004, 2900, "hit");           // the spring
    },

    /* VOX — the half-second of machinery before the robot speaks.

       The Web Speech API hands back audio this code can never touch: no
       filter, no resonance, no pitch-shift. Voice choice and pitch are the
       only levers on the VOICE itself, and they only get so far towards a
       character built on a chestful of gears.

       So the character is carried in front of it instead — a short low
       servo turning over and settling, the sound of something mechanical
       preparing to talk. It plays once as a line begins and is out of the
       way well before the first syllable, so it colours the delivery
       rather than competing with it.

       Gated at two seconds: a burst of chat messages read aloud back to
       back should sound like one machine talking, not like it is rebooting
       between sentences. */
    vox(){
      if(!gate("vox", 2000)) return;
      const j = 0.97 + Math.random()*0.06;
      tone("sawtooth", 62*j, 96, 0.20, 0.030);            // the servo spinning up
      ring([                                               // gears meshing
        [188*j, 0.028, 0.16],
        [274*j, 0.020, 0.13],
        [409*j, 0.013, 0.10]
      ], 0.02);
      noise(0.13, 0.026, 520*j, 1.1, 0.01, 260);           // the housing settling
    },

    /* HOVER — the cursor or a finger ARRIVING on a control.

       The hardest voice here to get right, because it fires without
       anyone asking for it. It has to be present enough that the control
       feels like it noticed you, and quiet enough that sweeping across a
       row of icons is not an event. So: no strike, no body, no real
       pitch — a short breath of filtered air rising slightly, at about a
       fifth the level of a click. If you catch yourself listening TO it
       rather than just noticing it, it is too loud. */
    hover(){
      if(!gate("hover", 55)) return;
      const j = 0.92 + Math.random()*0.16;
      noise(0.030, 0.026, 1900*j, 0.9, 0, 3400);
      tone("sine", 560*j, 720, 0.045, 0.011);
    },

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

    /* A section arriving.

       This one was reported as "an explosion sound when I click the
       section buttons", and the report was right about what it sounded
       like and wrong only about which voice it was: nothing calls boom()
       on a nav press. The old reveal was a 150Hz sine sweeping up under a
       320Hz band of noise for a quarter of a second — measured, 98% of
       its energy below 400Hz, spectral centre 184Hz, flatness 0.002. A
       low pure tone swelling is exactly the shape of a distant blast, and
       it landed on top of the tap's own low body, which doubled it.

       The lesson is in the spec rather than the sound: `reveal` was only
       ever checked for loudness and length, and it passed both the whole
       time. A voice with no constraint on its CHARACTER can drift into
       being a different sound entirely without a single test going red.

       What replaces it is movement with no weight — two offset bands of
       filtered air rising, and a whisper of pitch near the top to give
       the sweep a direction. Nothing here has meaningful energy below
       about 600Hz, so it reads as the page moving rather than as
       something landing, and it stays out of the way of the tap it always
       plays with. */
    reveal(){
      if(!gate("reveal", 220)) return;
      noise(0.20, 0.058, 1000, 1.1, 0,     3800);   // the movement
      noise(0.15, 0.028, 1700, 0.9, 0.040, 5400);   // its trailing edge
      tone("sine", 1150, 1780, 0.10, 0.011, 0.050); // a hint of direction
    },

    /* Something opening over the page — a lightbox, the nav rail.

       Rising for open, falling for close: the pair has to read as a
       direction, which is the whole reason they are two voices and not
       one. The start pitch used to be 320Hz, which put 92% of this below
       400Hz — the same low swell that made the old reveal sound like a
       blast, and on a phone it fires in the same gesture (a nav tap opens
       the rail AND reveals a section, so all three used to stack). Moved
       up a fifth it still rises, still sits under the tap, and no longer
       contributes any weight of its own. */
    open(){
      if(!gate("panel", 90)) return;
      noise(0.09, 0.034, 1100, 1.1, 0, 2400);
      tone("sine", 520, 940, 0.10, 0.024);
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
      tone("triangle", 1180, 700, 0.12, 0.042);
      noise(0.05, 0.028, 1400, 1.6);
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
    /* THE EXPLOSION.

       It was a descending sawtooth with a noise burst over it, and a
       sawtooth sliding down is a PEW — a pitch, and the ear hears a pitch
       as something tuned rather than something destroyed. Measured, it was
       84% below 400Hz with a flatness of 0.031: almost pure tone, which is
       the opposite of a detonation.

       A real blast is five things arriving in order, and leaving out any
       one of them is audible:

         1. the CRACK — the shock front. A few milliseconds of very loud
            broadband, and the only part with any top end. Without it
            there is no moment of detonation, just a swell;
         2. the BODY — a big burst of low noise whose filter collapses
            downward. The "whoomp" is that collapse, not a pitch;
         3. the PUNCH — the sub you feel more than hear;
         4. DEBRIS — scattered crackle over the next third of a second,
            irregularly spaced, because nothing about falling wreckage is
            evenly timed;
         5. the TAIL — a long rumble that outlasts everything else. This
            is what makes a blast sound BIG: size is communicated by how
            long the room keeps ringing, not by how loud the hit was. */
    boom(){
      const j = 0.94 + Math.random()*0.12;

      /* Loud, and it gets the first few milliseconds to ITSELF. Measured
         at the old level with the body arriving 4ms behind it, only 6% of
         the attack's energy was above 2kHz — the shock front existed on
         paper and was inaudible under the body. A blast without a crack
         is a swell. */
      noise(0.045, 0.47, 2000*j, 0.45, 0, 380, "hit", "highpass");  // 1. crack
      /* A WIDE filter, not a resonant one. At Q 0.7 the body rang around
         its centre frequency and the whole blast measured as nearly a
         pure tone; an explosion is broadband by nature, so the filter is
         there to shape it, not to pitch it. */
      /* LOWPASS, not bandpass. A bandpass sweeping down to 70Hz throws
         away everything on both sides of a very narrow band, so most of
         the blast was being filtered into nothing; a lowpass keeps the
         whole bottom of the spectrum and lets the sweep close over it,
         which is what a pressure wave actually does. */
      noise(0.34,  0.58, 1000*j, 0.4, 0.012, 95, "tail", "lowpass");  // 2. body
      noise(0.20,  0.050, 1000*j, 0.5, 0.016, 300, "tail");         // 2b. grit
      /* The punch is a sine, so it is the most tonal thing in here —
         enough to be felt, not enough to be heard as a note. */
      thock(130*j, 34, 0.30, 0.15, 0.010);                          // 3. punch

      /* 4. debris — deliberately uneven. Evenly spaced crackle sounds
         like a machine gun; real wreckage lands when it lands. */
      for(let k = 0; k < 5; k++){
        const at = 0.06 + Math.random()*0.30;
        /* Quieter and lower than the first attempt. Debris is texture, not
           the event: at the old level the blast's spectral centre sat at
           1250Hz — brighter than the small clank of a single punch, which
           cannot be right for something an order of magnitude bigger. */
        noise(0.03 + Math.random()*0.05,
              0.030 + Math.random()*0.035,
              (500 + Math.random()*1700) * j,
              1.4, at, 240, "hit");
      }

      /* The tail is LOUD for a tail. Size is communicated by how long the
         room keeps ringing, and at a tenth of the blast it fell under the
         floor in a third of a second, which is a firecracker rather than
         a machine coming apart. */
      /* The tail's filter barely moves. Sweeping it from 380Hz down to
         80Hz sounded right in principle and measured wrong: by half a
         second the filter had closed so far that a rumble which should
         still be going was already inaudible. A rumble stays a rumble —
         it gets quieter, not darker. */
      noise(1.30, 0.34, 300*j, 0.4, 0.045, 165, "tail", "lowpass"); // 5. tail
    },
    revive(){
      tone("triangle", 220, 880, 0.34, 0.075);
      tone("sine", 440, 1320, 0.3, 0.05, 0.08);
    },

    /* ---- the world chat --------------------------------------------- */

    /* JOINING. Two rising notes and a soft latch — the sound of being let
       in. Short, because it happens once and then never again. */
    join(){
      if(!gate("join", 400)) return;
      noise(0.020, 0.055, 1800, 0.9, 0, 1200, "hit", "highpass");
      tone("triangle", 420, 620, 0.10, 0.045);
      tone("triangle", 620, 830, 0.14, 0.038, 0.09);
    },

    /* THE GATE OPENING once UNIT-01 falls. A real latch: the bolt lets go,
       something heavy slides, and a tone confirms it. This is the moment
       the chat becomes usable, so it is allowed to be the most mechanical
       thing in the room. */
    unlock(){
      if(!gate("unlock", 800)) return;
      const j = 0.97 + Math.random()*0.06;
      noise(0.030, 0.13, 2600*j, 1.1, 0, 900, "hit", "highpass");   // the bolt
      thock(150*j, 92, 0.11, 0.075, 0.01);                          // the weight
      noise(0.16, 0.048, 700*j, 0.9, 0.03, 1500, "tail");           // the slide
      tone("triangle", 330, 660, 0.20, 0.042, 0.12);                // confirmed
    },

    /* SOMEONE ELSE LANDING A HIT. The same clank as your own, heard from
       across the room: quieter, duller, and without the noise burst that
       makes your own hit feel like it came off your hand. Hearing every
       blow is what makes the arena feel occupied; hearing them at full
       strength would make it unbearable. */
    farHit(){
      if(!gate("farhit", 90)) return;
      const p = 300 + Math.random()*180;
      tone("square", p, p*0.6, 0.07, 0.018);
      noise(0.05, 0.022, 900 + Math.random()*500, 1.1);
    },

    /* THE ROUND WINNER, crowned — someone else. A short bright flourish
       up a major triad with a metal shimmer over it: news about another
       person, worth looking up for and over in half a second. */
    crown(){
      if(!gate("crown", 1500)) return;
      const root = 523;                                   // C5
      tone("triangle", root,        root,        0.13, 0.050);
      tone("triangle", root*1.26,   root*1.26,   0.13, 0.048, 0.10);
      tone("triangle", root*1.5,    root*1.5,    0.30, 0.055, 0.20);
      ring([[2093, 0.020, 0.34], [3136, 0.014, 0.26], [4186, 0.009, 0.20]], 0.20);
      noise(0.30, 0.020, 3200, 0.8, 0.20, 6000, "tail");
    },

    /* ...and when the winner is YOU. The same shape, one octave of
       ambition further, with a low note under it so it lands rather than
       tinkles, and a fourth step at the top. A win should be audibly
       different from someone else's win — otherwise the site has told you
       something happened but not that it happened to you. */
    victory(){
      if(!gate("crown", 1500)) return;
      const root = 523;
      thock(131, 131, 0.55, 0.055);                       // the floor under it
      tone("triangle", root,      root,      0.14, 0.060);
      tone("triangle", root*1.26, root*1.26, 0.14, 0.058, 0.11);
      tone("triangle", root*1.5,  root*1.5,  0.14, 0.060, 0.22);
      tone("triangle", root*2,    root*2,    0.48, 0.068, 0.33);
      tone("sine",     root,      root,      0.48, 0.030, 0.33);    // an octave below the top
      ring([[2093, 0.026, 0.50], [3136, 0.019, 0.40], [4186, 0.013, 0.30]], 0.33);
      noise(0.45, 0.026, 3000, 0.8, 0.33, 7000, "tail");
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
      if(muted){
        /* Throw away anything still waiting for the audio to wake up.
           Without this, a press made moments before the switch was flipped
           could be released the next time sound comes back — the site
           making a noise after being told not to. */
        held.length = 0;
      }else{
        /* Un-muting happens on a click, which is a gesture — start the
           clock now so the confirming blip is instant. */
        unlock(); SFX.on();
      }
      /* Anything drawing a speaker icon listens for this rather than
         polling, so a toggle anywhere repaints every copy of it. */
      window.dispatchEvent(new CustomEvent("sfx-mute", {detail:{muted}}));
    },
    toggle(){ SFX.muted = !muted; return muted; }
  };

  /* ---- wake the clock on a real gesture ------------------------------
     Capture phase so nothing can stop it first, and isTrusted because a
     click dispatched by script cannot legally unlock audio — priming on
     one would leave an idle context lying around and earn a console
     warning for nothing.

     Re-armable, which is the part that matters for recovery. It used to
     unhook itself permanently after the first gesture, so if the context
     was later suspended — a phone call, a backgrounded tab, a refused
     resume — nothing was left listening and the site simply stayed quiet.
     Now it disarms when the context is running and arms again the moment
     it is not, so the visitor's next touch always brings the sound back
     without them having to press the same control twice. */
  const PRIME_EVENTS = ["pointerdown","touchstart","keydown","click"];
  let armed = false;

  function onGesture(e){
    if(!e || !e.isTrusted) return;
    try{ unlock(); }catch(err){}
    /* Whatever was waiting goes out now if the context came straight up;
       if the resume is still in flight, its own handler flushes. */
    setTimeout(flush, 0);
    if(ctx && ctx.state === "running") disarmPrimer();
  }
  function armPrimer(){
    if(armed) return;
    armed = true;
    for(const ev of PRIME_EVENTS) window.addEventListener(ev, onGesture, true);
  }
  function disarmPrimer(){
    if(!armed) return;
    armed = false;
    for(const ev of PRIME_EVENTS) window.removeEventListener(ev, onGesture, true);
  }
  armPrimer();

  /* Coming back to the tab is not a gesture, but it IS the moment a
     context suspended for being in the background is allowed to run
     again. Try it, and let the statechange watcher do the rest. */
  document.addEventListener("visibilitychange", ()=>{
    if(document.hidden) return;
    if(ctx && ctx.state !== "running"){ try{ ctx.resume().then(flush).catch(()=>{}); }catch(e){} }
    armPrimer();
  });

  window.SFX = SFX;
})();
