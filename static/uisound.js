/* ============================================================
   UI SOUND — wiring the engine to the interface
   ------------------------------------------------------------
   sfx.js knows how to MAKE noises. This file decides WHEN.

   The whole thing is delegated and observed rather than wired
   control by control. That matters more than it looks: half the
   interface here is built at runtime — the navigation rail, the
   social links, the leaderboard rows, the chat log, the lightbox —
   so a per-element addEventListener would go silent the moment
   anything re-rendered, and every new control added later would
   need remembering. Two listeners on `document` and a couple of
   MutationObservers cover everything that exists now and everything
   added afterwards, for free.

   The other rule here is that nothing gets TWO sounds. A control
   with a voice of its own — the theme dial's detent, the robot's
   clank, the sound switch's own on/off — is excluded from the
   generic click, or a single press would fire both.
   ============================================================ */
(function(){
  "use strict";
  const S = window.SFX;
  if(!S) return;

  /* ---- who owns their own sound ------------------------------------
     Matched against the event target's ancestors, so a click on the
     icon INSIDE one of these still counts as that control. */
  const OWN_VOICE = [
    "#themeLever",      // detent
    "#robotStage",      // clank / miss
    "#soundToggle",     // its own on/off
    "#robotSound"       // the old id, if it is still on the page
  ].join(",");

  /* Controls that read as navigation rather than as buttons. */
  const NAV_LIKE = ".nav-item, .nav-btn, .socials a, .chat-socials a, .board-row";

  const isControl = el =>
    el.closest("button, a[href], [role='button'], input[type='submit'], " +
               "input[type='checkbox'], input[type='radio'], select, " +
               ".nav-item, .dot, .card, .lightbox");

  /* ---- 1. presses -----------------------------------------------------
     On pointerdown, not click: a control should sound at the instant it
     is pressed, the way a physical one does. Waiting for click puts the
     noise after the finger has already lifted, which reads as lag. */
  document.addEventListener("pointerdown", e => {
    if(!e.isTrusted) return;
    const t = e.target;
    if(!(t instanceof Element)) return;
    if(t.closest(OWN_VOICE)) return;
    const el = isControl(t);
    if(!el) return;
    if(el.disabled) return;
    if(el.matches(NAV_LIKE) || el.closest(NAV_LIKE)) S.tap();
    else S.click();
  }, true);

  /* Keyboard activation makes the same sound. Without this the site is
     silent for anyone driving it from the keyboard, which is the one
     group most likely to be relying on feedback that isn't visual.
     `e.repeat` is dropped so holding the key down doesn't stutter. */
  document.addEventListener("keydown", e => {
    if(!e.isTrusted || e.repeat) return;
    if(e.key !== "Enter" && e.key !== " ") return;
    const t = document.activeElement;
    if(!(t instanceof Element)) return;
    if(t.closest(OWN_VOICE)) return;
    if(t.matches("input[type='text'], textarea")) return;   // typing, not pressing
    const el = isControl(t);
    if(!el) return;
    if(el.matches(NAV_LIKE) || el.closest(NAV_LIKE)) S.tap();
    else S.click();
  }, true);

  /* ---- 2. typing in the terminal --------------------------------------
     Only this one field. A site that clicks at you in every text box is
     unbearable, but the terminal is a terminal — a keystroke there is
     meant to feel like one. Very quiet, and gated hard enough that a
     held key or a paste doesn't turn into a drum roll. */
  const term = document.getElementById("whoamiField");
  if(term){
    term.addEventListener("keydown", e => {
      if(!e.isTrusted || e.repeat) return;
      if(e.key === "Enter"){ S.click(); return; }
      if(e.key.length === 1 || e.key === "Backspace") S.key();
    });
  }

  /* ---- 3. a section arriving ------------------------------------------
     Watched rather than hooked into activate(), so it fires however the
     view changed — the rail, a keyboard shortcut, a link, a restored
     hash. The observer only reports the class attribute changing; the
     check for `active` being newly present is what keeps it to one sound
     per navigation instead of one per attribute write. */
  const views = document.querySelectorAll(".page-view");
  if(views.length){
    const wasActive = new WeakMap();
    views.forEach(v => wasActive.set(v, v.classList.contains("active")));
    const vo = new MutationObserver(records => {
      for(const r of records){
        const v = r.target;
        const now = v.classList.contains("active");
        if(now && !wasActive.get(v)) S.reveal();
        wasActive.set(v, now);
      }
    });
    views.forEach(v => vo.observe(v, {attributes:true, attributeFilter:["class"]}));
  }

  /* ---- 4. things opening over the page --------------------------------
     The lightbox is created and destroyed on demand, so there is no
     element to listen to until it exists. The class on <body> is there
     the whole time, which makes it the thing to watch. The nav rail is
     the same story with .open. */
  const bodyFlags = [
    { cls:"lightbox-open", on:()=>S.open(), off:()=>S.close() }
  ];
  bodyFlags.forEach(f => { f.was = document.body.classList.contains(f.cls); });
  new MutationObserver(() => {
    for(const f of bodyFlags){
      const now = document.body.classList.contains(f.cls);
      if(now === f.was) continue;
      f.was = now;
      (now ? f.on : f.off)();
    }
  }).observe(document.body, {attributes:true, attributeFilter:["class"]});

  const stack = document.getElementById("stack");
  if(stack){
    let railOpen = stack.classList.contains("open");
    const so = new MutationObserver(()=>{
      const on = stack.classList.contains("open");
      if(on === railOpen) return;
      railOpen = on;
      if(on) S.open();          // closing is usually a side effect of
                                // tapping elsewhere, which already sounded
    });
    so.observe(stack, {attributes:true, attributeFilter:["class"]});
  }

  /* ---- 5. the chat ----------------------------------------------------
     Sending is a press we can hear at the source. Arriving is not — a
     message can land from the stream at any moment — so the log is
     watched for growth.

     Two guards, both learned the hard way by anyone who has shipped a
     notification sound: nothing fires while the tab is hidden (you would
     come back to a burst of chimes for messages you already missed), and
     nothing fires on the first fill, when the log paints its whole
     history at once. */
  const log = document.getElementById("chatLog");
  if(log){
    let seeded = false;
    let count = log.children.length;
    const lo = new MutationObserver(()=>{
      const n = log.children.length;
      const grew = n > count;
      count = n;
      if(!seeded){ seeded = true; return; }     // the history, not new mail
      if(!grew) return;
      if(document.hidden) return;
      S.receive();
    });
    lo.observe(log, {childList:true});
    /* The first batch lands a moment after the view opens; treat anything
       inside that window as history too. */
    setTimeout(()=>{ seeded = true; count = log.children.length; }, 1500);
  }

  for(const id of ["chatSendForm","chatNameForm"]){
    const f = document.getElementById(id);
    if(f) f.addEventListener("submit", e => { if(e.isTrusted) S.send(); });
  }

  /* ---- 6. refusals ----------------------------------------------------
     The interface already says no visually — the name gate shakes, the
     terminal flashes. Those classes are added and removed by the code
     that rejected the input, so watching for them catches every refusal
     without touching any of that code. */
  const shakers = ["robotNameGate", "chatNameForm", "chatSendForm"];
  for(const id of shakers){
    const el = document.getElementById(id);
    if(!el) continue;
    const mo = new MutationObserver(()=>{
      if(el.classList.contains("shake")) S.error();
    });
    mo.observe(el, {attributes:true, attributeFilter:["class"]});
  }

  /* ---- 7. the master switch -------------------------------------------
     One button, docked with the theme dial so it is reachable from every
     page rather than only from the one that happens to make the most
     noise. */
  const btn = document.getElementById("soundToggle");
  if(btn){
    const paint = () => {
      const off = S.muted;
      btn.classList.toggle("off", off);
      btn.setAttribute("aria-pressed", String(!off));
      btn.setAttribute("aria-label", off ? "Turn sound on" : "Turn sound off");
      btn.setAttribute("data-tooltip", off ? "Sound: off" : "Sound: on");
      btn.innerHTML = off
        ? '<i class="fa-solid fa-volume-xmark" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
    };
    btn.addEventListener("click", ()=>{
      /* Muting plays nothing — a click that says "no more clicks" and
         then clicks is a contradiction. Un-muting plays its own blip,
         which SFX does, so the visitor gets confirmation that sound is
         actually working rather than just a changed icon. */
      const nowMuted = S.toggle();
      if(nowMuted){ /* silence, by definition */ }
    });
    window.addEventListener("sfx-mute", paint);
    paint();
  }
})();
