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

  /* Fields where a keystroke is typing rather than a press. Declared up
     here with the other selectors because BOTH the press handler and the
     typing handler below consult it. */
  const TYPEABLE = "input[type='text'], input[type='search'], input[type='email'], " +
                   "input[type='url'], input[type='number'], input:not([type]), textarea, " +
                   "[contenteditable='true'], [contenteditable='']";

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

  /* ---- 1b. arriving on a control --------------------------------------
     A cursor landing on something that can be pressed.

     Driven by `pointermove`, NOT by `pointerover`, and that is the whole
     design. A hover is caused by the pointer moving onto a control; it is
     not caused by a control moving under a stationary pointer — and
     `pointerover` cannot tell those apart. The navigation rail expands
     over 350ms and drops seven controls under a cursor that has not moved
     a pixel; watching `pointerover` meant resting the mouse there played
     the open sound and then chattered three times.

     Tracking the control under each real move gets it right by
     construction: no move, no sound, however much the page rearranges
     itself. Moving WITHIN one control is silent because the control has
     not changed; moving from one to the next fires exactly once.

     Touch is separate. A finger produces `pointerover` immediately before
     its `pointerdown`, so treating that as a hover would make every tap
     play hover-then-click — two sounds for one action. The real touch
     equivalent is dragging a finger ACROSS controls while already down,
     which is how people scan a rail before committing; that case gets the
     sound, a plain tap does not. */
  let hoveredEl = null;
  let pointerDown = false;
  let lastTarget = null;
  let dwellTimer = null;

  /* ---- a hover is a DWELL, not an arrival --------------------------
     Moving the mouse to a button and clicking it used to play hover and
     then click: two sounds for one action, which is exactly the "there
     are 2 sounds when I click" report — the soft one arriving a tenth of
     a second before the press.

     The cause is that arriving on a control and passing through it on the
     way to pressing it look identical at the moment of arrival. They are
     only told apart by what happens NEXT. So the hover waits: if a press
     lands on the same control first, the visit was never a hover at all
     and the sound is cancelled before it is made.

     140ms is the whole trick. It is long enough that a deliberate move-
     and-click never triggers it, and short enough that resting on a
     control still feels immediate. A sweep across a row of icons now
     sounds only where the cursor actually pauses, which is also more
     honest than ticking once per icon crossed. */
  const DWELL_MS = 140;

  function cancelDwell(){
    if(dwellTimer){ clearTimeout(dwellTimer); dwellTimer = null; }
  }

  document.addEventListener("pointerdown", e => {
    if(!e.isTrusted) return;
    pointerDown = true;
    cancelDwell();              // this was a press, not a hover
  }, true);

  for(const ev of ["pointerup","pointercancel"])
    document.addEventListener(ev, () => { pointerDown = false; }, true);

  function arrive(el, viaTouch){
    if(el === hoveredEl) return;
    cancelDwell();
    hoveredEl = el;
    if(!el || el.disabled) return;
    if(el.closest(OWN_VOICE)) return;      // the dial owns its sound, and is dragged
    if(viaTouch && !pointerDown) return;   // that is a tap, not a hover
    dwellTimer = setTimeout(() => {
      dwellTimer = null;
      /* Still on the same control, and no button is down. */
      if(hoveredEl === el && !pointerDown) S.hover();
    }, DWELL_MS);
  }

  document.addEventListener("pointermove", e => {
    if(!e.isTrusted || e.pointerType === "touch") return;
    const t = e.target;
    if(t === lastTarget) return;           // cheap early-out: most moves stay put
    lastTarget = t;
    arrive(t instanceof Element ? isControl(t) : null, false);
  }, true);

  /* Touch only: a finger already down, dragged onto a different control. */
  document.addEventListener("pointerover", e => {
    if(!e.isTrusted || e.pointerType !== "touch" || !pointerDown) return;
    const t = e.target;
    if(!(t instanceof Element)) return;
    arrive(isControl(t), true);
  }, true);

  document.addEventListener("pointerleave", () => { cancelDwell(); hoveredEl = null; lastTarget = null; }, true);

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
    if(t.matches(TYPEABLE)) return;                        // typing, not pressing
    const el = isControl(t);
    if(!el) return;
    if(el.matches(NAV_LIKE) || el.closest(NAV_LIKE)) S.tap();
    else S.click();
  }, true);

  /* ---- 2. typing ------------------------------------------------------
     Every text field on the site, not just the terminal.

     The original rule here was "only the terminal, because a site that
     clicks at you in every text box is unbearable" — and that is true of
     a click. It is not true of a keystroke, and the two are different
     voices: S.click() is a button bottoming out, S.key() is a keycap,
     already a third of the level and a fifth of the length. What makes
     typing feedback unbearable is a LOUD sound per character, not the
     presence of one; every mechanical keyboard ever sold is the proof.

     Three rules keep it on the right side of that line:

       - Delegated at the document, so fields built at runtime (the chat
         composer, the editor, anything added later) are covered without
         being wired up one at a time.
       - `e.repeat` is dropped, so holding a key down does not turn into a
         drum roll, and a paste makes no sound at all — it is one action,
         not forty characters.
       - Space and Enter get their own slightly lower voices, because they
         are the big keys and hearing the same tick for every one of them
         is what makes fake typing sound fake.

     Any field can opt out with data-no-sound, and password fields opt out
     on their own — nobody wants their passphrase audible as a rhythm. */
  document.addEventListener("keydown", e => {
    if(!e.isTrusted || e.repeat) return;
    const t = e.target;
    if(!(t instanceof Element)) return;
    if(!t.matches(TYPEABLE)) return;
    if(t.closest("[data-no-sound]")) return;
    if(e.ctrlKey || e.metaKey || e.altKey) return;     // a shortcut, not typing

    if(e.key === "Enter"){ S.click(); return; }
    if(e.key === " "){ S.tap(); return; }
    if(e.key === "Backspace" || e.key === "Delete"){ S.key(); return; }
    if(e.key.length === 1) S.key();
  }, true);

  /* The terminal keeps its own handler. It is the one field where a
     keystroke is the point rather than a side effect, so it answers on
     every key including the ones the generic rule above skips. */
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

  /* Joining the chat. The name form's submit is the send sound above, but
     actually being LET IN is a different event and deserves to be heard:
     it happens once, and until it happens nothing else in the chat works.
     The chat module fires this when a name is accepted. */
  window.addEventListener("chat-named", () => S.join());

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
