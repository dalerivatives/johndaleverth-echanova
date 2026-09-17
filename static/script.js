/* ============================================================
   SITE SETTINGS
   Every piece of wording on this site — the name, the tagline, the terminal
   lines, the footer, the social links, the GitHub username, the SEO text —
   is stored in the database and edited from the "Site settings" tab in
   /editor.html. Nothing here needs hand-editing.

   How it applies:
     [data-setting="key"]  → that element's text becomes the setting's value
     social_links (JSON)   → rebuilt into the top bar and the chat page by
                             renderSocials() below, so any number can exist

   The HTML ships with the current text already in it, so if the API is slow
   or unreachable the page still reads correctly — it just won't reflect the
   very latest edits.
   ============================================================ */
window.SITE_SETTINGS = {};

/* Social icons are built from the list in Site settings, so any number of
   them can exist — each entry is {title, icon, url}. "icon" is normally a
   Font Awesome class ("fa-brands fa-github"), but a logo the icon set
   doesn't have can be given as an image URL or as raw <svg>/<img> markup
   instead, which is why this branches on what it was handed.
   The same list feeds the top bar and the chat page. */
function socialIconMarkup(icon){
  const value = (icon || "").trim();
  if(!value) return `<i class="fa-solid fa-link" aria-hidden="true"></i>`;
  if(/^<(img|svg|i|span)\b/i.test(value)) return value;                    // raw markup
  if(/^(https?:)?\/\//.test(value) || value.startsWith("/")){              // image URL
    return `<img src="${escapeAttr(value)}" alt="" class="social-img">`;
  }
  return `<i class="${escapeAttr(value)}" aria-hidden="true"></i>`;        // icon class
}

function escapeAttr(str){
  return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}

function renderSocials(raw){
  let list = [];
  try{ list = JSON.parse(raw || "[]"); }catch(e){ list = []; }
  if(!Array.isArray(list)) list = [];

  const markup = list
    .filter(s => s && (s.url||"").trim())
    .map(s => {
      const url = s.url.trim();
      const title = (s.title||"").trim() || "Link";
      // A bare email address is turned into a mailto: link automatically.
      const href = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url) ? `mailto:${url}` : url;
      const external = !href.startsWith("mailto:");
      return `<a href="${escapeAttr(href)}" aria-label="${escapeAttr(title)}" data-tooltip="${escapeAttr(title)}"${
        external ? ' target="_blank" rel="noopener"' : ""}>${socialIconMarkup(s.icon)}</a>`;
    })
    .join("");

  ["topSocials","chatSocials"].forEach(id=>{
    const host = document.getElementById(id);
    if(!host) return;
    host.innerHTML = markup;
    host.hidden = !markup;   // an empty list leaves no empty pill behind
  });
}

async function applySiteSettings(){
  let settings;
  try{
    const res = await fetch("/api/settings");
    if(!res.ok) throw new Error("settings unavailable");
    settings = await res.json();
  }catch(err){
    return null;   // keep the fallback text that's already in the HTML
  }
  window.SITE_SETTINGS = settings;

  // 1. plain text bindings
  document.querySelectorAll("[data-setting]").forEach(el=>{
    const value = settings[el.dataset.setting];
    if(typeof value === "string" && value.trim()) el.textContent = value;
  });

  // 2. social links — any number, defined in Site settings
  renderSocials(settings.social_links);

  // 3. the music playlist, also a list defined in Site settings. The player
  //    itself is further down this file; it hides when the list is empty.
  window.__settings = settings;
  if(window.MusicPlayer) window.MusicPlayer.load(settings);
  if(window.Discoveries) window.Discoveries.load(settings);
  if(window.Background) window.Background.load(settings);

  // 4. resume button — only appears once a resume has been uploaded
  const resume = document.getElementById("resumeBtn");
  if(resume){
    const url = (settings.resume_url || "").trim();
    if(url){ resume.href = url; resume.hidden = false; }
  }

  // 5. page title + meta description
  if((settings.site_title || "").trim()) document.title = settings.site_title;
  const metaDesc = document.querySelector('meta[name="description"]');
  if(metaDesc && (settings.meta_description || "").trim()) metaDesc.content = settings.meta_description;

  /* 7. Link-preview URLs. Facebook and friends read these tags from the raw
        HTML before any JavaScript runs, so rewriting them here does NOT make
        previews work on its own — the real fix is setting the site URL in
        the editor, which also writes it into the served HTML on next load.
        Doing it here keeps the tags honest for anything that does run JS. */
  const siteUrl = (settings.site_url || "").trim().replace(/\/+$/, "");
  if(siteUrl){
    const abs = path => `${siteUrl}${path}`;
    document.querySelectorAll('meta[property="og:url"], link[rel="canonical"]')
      .forEach(el=>{ if(el.tagName==="META") el.content = abs("/"); else el.href = abs("/"); });
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]')
      .forEach(el=>{ el.content = abs("/assets/og-preview.png"); });
  }
  return settings;
}

/* Kicked off immediately; the GitHub sync below awaits it so it can use the
   configured username rather than racing it. */
const settingsReady = applySiteSettings();

const app=document.getElementById("app");
const stack=document.getElementById("stack");
const views=document.querySelectorAll(".page-view");

function updateFooterClock() {
    const dateElement = document.getElementById("footerDate");
    const clockElement = document.getElementById("footerClock");
    const zoneElement = document.getElementById("footerZone");

    if (!dateElement || !clockElement) return;

    const now = new Date();

    // Automatically detects the visitor's timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const dateFormatter = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "2-digit",
        year: "numeric"
    });

    const timeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true
    });

    dateElement.textContent = dateFormatter
        .format(now)
        .toUpperCase();

    clockElement.textContent = timeFormatter
        .format(now);

    // Update timezone
    if (zoneElement) {
        zoneElement.textContent = timezone
            .replace("_", " ")
            .toUpperCase();
    }
}

updateFooterClock();
setInterval(updateFooterClock, 1000);

const items=[
 {id:"profile",label:"Profile",icon:'<i class="fa-solid fa-circle-user"></i>'},
 {id:"projects",label:"Projects",icon:'<i class="fa-solid fa-rocket"></i>'},
 {id:"achievements",label:"Achievements",icon:'<i class="fa-solid fa-trophy"></i>'},
 {id:"tools",label:"Tools",icon:'<i class="fa-solid fa-screwdriver-wrench"></i>'},
 {id:"chat",label:"World Chat",icon:'<i class="fa-solid fa-globe"></i>'}
];

function renderStack(){
 /* Remove only the SECTION items. The theme dial and the sound switch live
    in this same rail and are not sections — `stack.innerHTML=""` would take
    them out with everything else and they would never come back, since this
    is the only place the rail is built. */
 stack.querySelectorAll(".nav-item").forEach(el => el.remove());
 items.forEach((item,index)=>{
   const wrap=document.createElement("div");
   wrap.className="nav-item"+(index===0?" active":"");
   wrap.dataset.id=item.id;
   wrap.style.order=String(index);
   const btn=document.createElement("button");
   btn.type="button"; btn.className="nav-btn"; btn.innerHTML=item.icon;
   btn.setAttribute("aria-label",item.label);
   const label=document.createElement("span");
   label.className="nav-label"; label.textContent=item.label;
   wrap.append(btn,label); stack.appendChild(wrap);
 });
}
function activate(id){
 const foundIndex=items.findIndex(x=>x.id===id);
 const found=items[foundIndex];
 if(!found)return;
 items.splice(foundIndex,1); items.unshift(found);
 /* Reorder with flex `order`, NEVER by rebuilding the DOM.
    renderStack() wipes innerHTML and creates five fresh elements. A brand-new
    .nav-item starts at height:0 / opacity:0 / translateY(8px) and plays its
    enter transition — that upward flicker on every navigation. On a pointer
    device the cursor is still over the rail afterwards, so .stack:hover holds
    the items open and the animation is never seen, which is exactly why this
    only ever appeared on a phone. Changing `order` moves nothing structurally,
    so nothing re-animates. */
 items.forEach((item,index)=>{
   const el=stack.querySelector('.nav-item[data-id="'+item.id+'"]');
   if(el) el.style.order=String(index);
 });
 document.querySelectorAll(".nav-item").forEach(x=>x.classList.remove("active"));
 document.querySelector(`.nav-item[data-id="${id}"]`).classList.add("active");
 views.forEach(view=>view.classList.toggle("active",view.dataset.view===id));
 window.scrollTo({top:0,behavior:"smooth"});
}
/* On a pointer device the rail opens on hover, so a click is always a
   navigation. Touch has no hover: the collapsed circle would otherwise be
   a dead control showing only the page you're already on. So the first tap
   opens the rail and the second one navigates — which is what hovering then
   clicking does on desktop, just split into two taps. */
const navIsTouch = () => window.matchMedia("(hover:none), (pointer:coarse)").matches;
stack.addEventListener("click",e=>{
  const item=e.target.closest(".nav-item");
  if(!item) return;
  if(navIsTouch() && !stack.classList.contains("open")){
    stack.classList.add("open");
    return;                       // reveal first; don't navigate on the opening tap
  }
  activate(item.dataset.id);
  /* On touch the rail STAYS open after navigating. Collapsing it here fired
     three motions off a single tap: the container snapped 286px -> 60px in
     one frame, the five items then animated their heights down over ~240ms
     behind it, and the page smooth-scrolled to the top at the same time.
     That is the "going down and up" — it is the rail folding itself away
     while you are still looking at it.

     Desktop never had this because the rail is held open by .stack:hover as
     long as the cursor is on it, so there is nothing to fold. Leaving it open
     on touch is the same behaviour: it stays in stack form, and tapping
     anywhere off the rail folds it back up, exactly as moving the cursor away
     does with a mouse. */
  if(!navIsTouch()) stack.classList.remove("open");
});
/* Tapping anywhere else folds it back up, the way moving the cursor away
   does on desktop. The opening tap can't trigger this: its target is inside
   the stack, so the check below is false for that event. */
document.addEventListener("click",e=>{
  if(!stack.contains(e.target)) stack.classList.remove("open");
});
/* Reordering re-renders the items, and a stale .open on a rail that has
   just navigated would leave it hanging open behind the new page. */
window.addEventListener("resize",()=>{ if(!navIsTouch()) stack.classList.remove("open"); });
renderStack();

/* ============================================================
   COLOUR MODE — a three-position lever
   ------------------------------------------------------------
   LIGHT  -  always the light (STUDIO) palette
   SYSTEM -  follows the operating system, and KEEPS following it
   DARK   -  always the dark (EMERALD) palette

   This replaced a six-theme palette menu. The four accent themes
   (CYBER, OCEAN, VIOLET, HARDWARE) were dropped on request; their CSS
   blocks are deliberately left in style.css rather than deleted,
   because one of them has two `.app.light-mode` selectors merged into
   its selector list and cutting it blind would take those with it.
   Nothing adds those classes any more, so the rules never match.

   SYSTEM is the real point of the three-position switch. The previous
   build had no such mode: it followed the OS only until you touched the
   control, then pinned whatever you picked forever. Here SYSTEM is a
   choice you can return to, and it re-follows the OS live.
   ============================================================ */
/* Five detents, ordered as a brightness ramp so turning the dial one way
   always gets lighter and the other way always gets darker. With an odd
   count AUTO lands on the exact centre of the arc, which is where the
   default belongs.

   The GREEN phosphor position was cut here. It sat between DARK and MONO
   DARK and was the second dark-with-green-accents stop on the dial; one
   is enough. */
const MODES = ["mono-light","colour-light","auto","colour-dark","mono-dark"];
const MODE_LABEL = {
  "mono-light" : {word:"MONO LIGHT",  tip:"Theme: Mono light",  aria:"Theme: monochrome light, black on white"},
  "colour-light":{word:"LIGHT",       tip:"Theme: Light",       aria:"Theme: light with matching colours"},
  "auto"       : {word:"AUTO",        tip:"Theme: Auto",        aria:"Theme: auto, following your device"},
  "colour-dark": {word:"DARK",        tip:"Theme: Dark",        aria:"Theme: dark with matching colours"},
  "mono-dark"  : {word:"MONO DARK",   tip:"Theme: Mono dark",   aria:"Theme: monochrome dark, white on black"}
};

const lever = document.getElementById("themeLever");
const osLight = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

/* ---- the readout ----------------------------------------------------
   `MODE_LABEL[mode].word` printed beside the dial for a moment after it
   turns, then faded out.

   This is not decoration. AUTO paints exactly the same page as DARK on a
   device that is already dark, and exactly the same page as LIGHT on one
   that is not — that is what "auto" MEANS. Without something that names
   the position out loud, two of the five detents look broken.

   It was missing entirely. setMode() has been calling announce() since
   the dial grew detents and nothing ever defined it, so every theme
   change threw a ReferenceError — after the repaint, so the theme still
   changed and the fault was invisible unless the console was open. The
   readout element has been sitting in the markup the whole time with
   nothing to show it. */
const readout = document.getElementById("leverReadout");
let readoutTimer = null;
function announce(mode){
  if(!readout) return;
  const label = MODE_LABEL[mode];
  readout.textContent = label ? label.word : String(mode).toUpperCase();
  readout.classList.add("show");
  clearTimeout(readoutTimer);
  readoutTimer = setTimeout(()=>readout.classList.remove("show"), 1400);
}

/* Six positions, four palette classes and one that follows the device.

     mono-light    .light-mode .mono-mode   black on white
     colour-light  .light-mode              matching colours, light ground
     auto          .light-mode | (none)     whichever the device asks for
     colour-dark   .dark-mode               matching colours, TRUE BLACK ground
     mono-dark     .dark-mode  .mono-mode   white on black

   `.dark-mode` is the pure-black ground; `.mono-mode` strips the colour off
   it. That mirrors the light side exactly, and it is what separates DARK
   from AUTO: AUTO on a dark device paints the default #05080b with its two
   green pools, while DARK is flat #000 with a cooler accent. Same family,
   visibly not the same page.

   AUTO and COLOUR-DARK paint the same page on a dark device, and AUTO and
   COLOUR-LIGHT the same on a light one. That is what "auto" means, not a
   fault — the readout names the position so the two are never ambiguous. */
function paintMode(mode){
  const osIsLight = !!(osLight && osLight.matches);
  const light = mode === "mono-light" || mode === "colour-light" ||
                (mode === "auto" && osIsLight);
  const deep  = mode === "colour-dark" || mode === "mono-dark";
  const mono  = mode === "mono-light" || mode === "mono-dark";
  app.classList.toggle("light-mode", light);
  document.body.classList.toggle("light-mode", light);
  app.classList.toggle("dark-mode", deep);
  document.body.classList.toggle("dark-mode", deep);
  app.classList.toggle("mono-mode", mono);
  document.body.classList.toggle("mono-mode", mono);
  app.dataset.theme = mono ? (light ? "mono-light" : "mono-dark")
                    : light ? "light"
                    : deep  ? "black"
                            : "dark";
  if(window.Background) window.Background.draw();
}

function setMode(mode, persist = true){
  if(MODES.indexOf(mode) === -1) mode = "auto";
  const changed = !lever || lever.dataset.mode !== mode;
  if(lever){
    lever.dataset.mode = mode;
    lever.setAttribute("aria-label", MODE_LABEL[mode].aria);
    lever.setAttribute("data-tooltip", MODE_LABEL[mode].tip);
  }
  paintMode(mode);
  if(persist){
    try{ localStorage.setItem("portfolio-mode", mode); }catch(e){}
    if(changed){
      /* Sound BEFORE the label. That ordering is the whole lesson of the
         bug above: announce() threw for months and everything downstream
         of it in this block silently stopped happening. The click is the
         feedback that matters most, so it goes first. */
      /* The detent click. Only when the dial actually LANDS somewhere new:
         a drag across the bezel calls setMode on every pointermove, and
         without this guard one turn of the knob would fire a click per
         frame instead of one per notch. `persist` is false on the restore
         at load, which is what keeps the page from clicking at you before
         you have touched anything. */
      if(window.SFX) window.SFX.detent();
      announce(mode);
    }
  }
}

/* Anyone who used the site before this change has a theme name saved, not
   a mode. Map the old values rather than ignoring them, so a returning
   visitor keeps the brightness they chose instead of being reset. */
function readSavedMode(){
  let saved = null;
  try{ saved = localStorage.getItem("portfolio-mode"); }catch(e){}
  if(MODES.indexOf(saved) !== -1) return saved;

  /* Two generations of saved value to carry forward, not one. The
     three-position dial wrote light/system/dark; before that the six-theme
     menu wrote a theme name. Both map onto the new ids rather than being
     thrown away, so nobody gets silently reset. */
  if(saved === "green")  return "colour-dark";   /* the position GREEN sat beside */
  if(saved === "light")  return "mono-light";
  if(saved === "system") return "auto";
  if(saved === "dark")   return "mono-dark";

  let legacy = null;
  try{ legacy = localStorage.getItem("portfolio-theme"); }catch(e){}
  if(legacy === "light") return "colour-light";
  if(legacy) return "colour-dark";   // dark, cyber, ocean, violet, amber
  return "auto";                     // never chose anything -> follow the device
}

setMode(readSavedMode(), false);

/* WHERE YOU AIM IS WHERE IT GOES.

   The first version stepped one detent per click and worked out the
   direction itself, bouncing back off the ends. Pressing the dial then did
   something you had not asked for: you could not say "left" or "right", the
   code decided, and clicking the body of the knob moved it just the same.

   This is a rotary control, so it is now driven by ANGLE. Wherever you press
   or drag — anywhere on the dial — the pointer is taken from the knob's
   centre to your cursor and snapped to the nearest of the three detents.
   Press on the left of the dial and you get LIGHT. There is nothing to
   guess, and dragging around the face turns it exactly like a real one. */
/* The dial's geometry, read from the CSS so the hit zones can never
   disagree with the drawn detents. Six stops across a fixed arc: the outer
   two sit at +/- span, and the step between neighbours is span*2/(n-1). */
function knobSpanDeg(){
  const v = parseFloat(getComputedStyle(lever).getPropertyValue("--kb-span"));
  return isFinite(v) && v > 0 ? v : 75;
}
function detentDeg(i){
  const span = knobSpanDeg();
  return -span + i * (span * 2 / (MODES.length - 1));
}

function modeFromPoint(clientX, clientY){
  const r  = lever.getBoundingClientRect();
  const cx = r.left + r.width  / 2;
  const cy = r.top  + r.height / 2;
  const dx = clientX - cx;
  const dy = cy - clientY;                   // screen y grows downward

  /* Dead zone: a press within a few pixels of the spindle has no meaningful
     angle, so leave the dial where it is rather than letting a rounding
     error throw it to a detent. */
  if(Math.hypot(dx, dy) < 4) return lever.dataset.mode;

  const deg = Math.atan2(dx, dy) * 180 / Math.PI;   // 0 = straight up, + = clockwise

  /* Snap to the NEAREST detent rather than slicing the circle into bands.
     With six stops the bands would be 30 degrees wide and easy to get wrong
     by one; nearest-of-six cannot be off by one by construction. */
  let best = 0, bestD = Infinity;
  for(let i = 0; i < MODES.length; i++){
    const d = Math.abs(deg - detentDeg(i));
    if(d < bestD){ bestD = d; best = i; }
  }
  return MODES[best];
}

if(lever){
  let turning = false;

  lever.addEventListener("pointerdown", e=>{
    turning = true;
    try{ lever.setPointerCapture(e.pointerId); }catch(err){}
    setMode(modeFromPoint(e.clientX, e.clientY));
  });
  lever.addEventListener("pointermove", e=>{
    if(turning) setMode(modeFromPoint(e.clientX, e.clientY));
  });
  const stopTurning = e=>{
    turning = false;
    try{ lever.releasePointerCapture(e.pointerId); }catch(err){}
  };
  lever.addEventListener("pointerup", stopTurning);
  lever.addEventListener("pointercancel", stopTurning);

  /* A <button> still fires click on Enter and Space. `detail === 0` marks a
     click the keyboard generated rather than a pointer, so this steps only
     for keyboard users and never double-fires after a press. */
  lever.addEventListener("click", e=>{
    if(e.detail !== 0) return;
    const i = MODES.indexOf(lever.dataset.mode);
    setMode(MODES[(i + 1) % MODES.length]);
  });

  /* Arrows go to a specific position, which is what a three-state control
     should do from the keyboard. */
  lever.addEventListener("keydown", e=>{
    const i = MODES.indexOf(lever.dataset.mode);
    if(e.key === "ArrowLeft" || e.key === "ArrowDown"){
      e.preventDefault(); if(i > 0) setMode(MODES[i-1]);
    }else if(e.key === "ArrowRight" || e.key === "ArrowUp"){
      e.preventDefault(); if(i < MODES.length-1) setMode(MODES[i+1]);
    }
  });
}

/* SYSTEM keeps tracking. The listener is always attached, not only while
   unpinned, because SYSTEM is now a position you can come back to. */
if(osLight){
  /* Compare against the CURRENT mode id, not a literal. The id was renamed
     "system" -> "auto" when the dial grew to six detents and this line kept
     the old string, so AUTO silently stopped following the device: the mode
     was right, the repaint never fired. */
  const onOsChange = ()=>{
    if(lever && lever.dataset.mode === "auto") paintMode("auto");
  };
  if(osLight.addEventListener) osLight.addEventListener("change", onOsChange);
  else if(osLight.addListener) osLight.addListener(onOsChange);   // older Safari
}

/* ============================================================
   LIVE VIEWER COUNT
   The top bar used to read a hardcoded "10 Viewers Online". This makes it
   real: every open tab heartbeats to /api/presence with a random id it
   generates once per tab, and the server counts the ids it heard from in
   the last 45 seconds. Falls back to hiding the counter entirely if the
   backend can't be reached, rather than showing a number that isn't true.
   ============================================================ */
(() => {
  const el=document.getElementById("viewerCount");
  if(!el) return;
  const PING_MS=20000;

  let viewerId=sessionStorage.getItem("portfolio-viewer-id");
  if(!viewerId){
    viewerId=(crypto.randomUUID?crypto.randomUUID():String(Math.random()).slice(2)+Date.now());
    try{ sessionStorage.setItem("portfolio-viewer-id", viewerId); }catch(e){}
  }

  const host = el.closest(".online");
  const stackEl = document.getElementById("presenceFaces");
  let last = null, lastFaces = [];

  /* ---- the face stack ----------------------------------------------
     ONLY people who registered a name in world chat get a face. Everyone
     else is counted in a single "+N others" chip and is never drawn.

     The silhouette that used to stand in for an anonymous visitor is
     gone. It looked like a person who was there but unidentified, which
     is a slightly different and slightly false claim — the server knows
     nothing about that visitor at all, not even that they are one person
     rather than three tabs. A count is the honest shape for them, and it
     is also what the chip already says.

     Real avatars come from the same generator the chat draws with, so a
     face here and the face on that person's messages match. Yours goes
     first when you are in the chat: the stack is a mirror of the room and
     you are in it, which is what makes the trailing count read as "and
     these others". */
  const ANON_GLYPH =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="9" r="3.4"/>' +
      '<path d="M5 20.6c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5z"/>' +
    '</svg>';

  function myName(){
    try{ return localStorage.getItem("portfolio-chat-name") || ""; }catch(e){ return ""; }
  }

  let lastSig = null;
  function paintFaces(faces, online){
    if(!stackEl) return;
    const mine = myName();
    const list = [];
    if(mine) list.push(mine);
    for(const n of (faces || [])){
      if(n && n !== mine && list.length < 3) list.push(n);
    }

    const others = Math.max(0, online - list.length);
    const sig = list.join("\u0000") + "|" + others;
    if(sig === lastSig) return;          // nothing moved; don't rebuild the SVGs
    lastSig = sig;

    /* escapeAttr, not the chat module's private escapeHtml — a name is
       user-supplied and goes straight into an attribute here. */
    const faceHtml = list.map(n =>
      '<span class="pv-face" title="' + escapeAttr(n) + '">' +
      (window.ChatAvatar ? window.ChatAvatar.svg(n) : ANON_GLYPH) + '</span>').join("");

    const chip = others > 0
      ? '<span class="pv-more" title="' + others + ' other' + (others === 1 ? '' : 's') +
        ' not in the chat">' + ANON_GLYPH + '<b>+' + others + '</b></span>'
      : '';

    stackEl.innerHTML = faceHtml + chip;
    stackEl.classList.toggle("is-empty", !list.length && !chip);
  }

  /* A name claimed mid-session should show up at once, not at the next
     20-second heartbeat. */
  window.addEventListener("chat-named", ()=>{ lastSig = null; ping(); });

  /* Does the row still sit inside the space the header gives it?
     Measured, because the label, the stack and the tail are all
     variable, and so is whatever sits on the other side of the bar. */
  function fits(){
    if(!host) return true;
    const bar = host.closest(".topbar");
    if(!bar) return true;
    const actions = bar.querySelector(".top-actions");
    const room = (actions ? actions.getBoundingClientRect().left : bar.getBoundingClientRect().right)
               - host.getBoundingClientRect().left - 14;
    return host.scrollWidth <= room;
  }

  function paint(n, faces){
    if(faces) lastFaces = faces;
    paintFaces(lastFaces, n);

    /* Longest first; the first tail that fits wins. */
    const tails = [
      n + (n === 1 ? " person viewing now" : " people viewing now"),
      n + " viewing",
      String(n)
    ];
    let chosen = tails[tails.length - 1];
    for(const t of tails){
      el.textContent = t;
      if(fits()){ chosen = t; break; }
    }
    el.textContent = chosen;

    /* The visible text abbreviates; the announced text never does. */
    host.setAttribute("aria-label",
      n === 1 ? "1 person viewing now" : n + " people viewing now");

    /* Flash only on a real change, never on the 20s heartbeat that
       returns the same figure — a light that blinks every time says
       nothing. */
    if(host && last !== null && n !== last){
      host.classList.remove("tick");
      void host.offsetWidth;            // restart the animation
      host.classList.add("tick");
    }
    last = n;
  }

  /* Re-fit when the bar changes width, so a rotation does not leave the
     long form overlapping the controls until the next heartbeat. */
  let refit = null;
  window.addEventListener("resize", ()=>{
    clearTimeout(refit);
    refit = setTimeout(()=>{ if(last !== null) paint(last); }, 150);
  });

  async function ping(){
    try{
      const res=await fetch("/api/presence",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        /* The name goes up with the heartbeat so the server can tell the
           badge WHO is here, not just how many. Empty for anyone who
           has not joined the chat — they are counted, never named. */
        body:JSON.stringify({viewer_id:viewerId, name:myName()})
      });
      if(!res.ok) throw new Error("presence unavailable");
      const data=await res.json();
      paint(Math.max(1, Number(data.online)||1), Array.isArray(data.faces) ? data.faces : []);
    }catch(err){
      // No backend (or it's down): say nothing rather than invent a number.
      if(host) host.style.display="none";
    }
  }

  ping();
  setInterval(ping, PING_MS);
  document.addEventListener("visibilitychange",()=>{ if(!document.hidden) ping(); });
})();


/* ============================================================
   HEADER RESERVATION — a number that cannot disagree with itself
   ------------------------------------------------------------
   `.topbar` is fixed and uses `min-height`, so it GROWS with its
   contents. `--header-h` is what reserves space for it at the top
   of the page. They were two hand-maintained numbers that had to
   match, and they did not: measured on a phone the bar is 75px
   against a reservation of 68px, so the fixed header had been
   covering the first 7px of every page — the top of a heading,
   the first line of the terminal — on every phone, in every
   version, for as long as the social links have been that size.

   It is not the sort of thing anyone notices directly. It looks
   like the page just starts a little tight.

   So the reservation is measured from the bar rather than typed
   next to it. A ResizeObserver keeps it true through font loading,
   a rotation, the social links arriving from the API, and anything
   added to the bar later. The CSS value stays as the pre-script
   fallback.
   ============================================================ */
(() => {
  const bar = document.querySelector(".topbar");
  if(!bar) return;

  let applied = 0;
  function sync(){
    const h = Math.ceil(bar.getBoundingClientRect().height);
    /* A tenth of a pixel of jitter must not thrash the layout. */
    if(!h || Math.abs(h - applied) < 1) return;
    applied = h;
    document.documentElement.style.setProperty("--header-h", h + "px");
  }
  sync();

  if(window.ResizeObserver){
    new ResizeObserver(sync).observe(bar);
  }else{
    window.addEventListener("resize", sync);
  }
  /* Web fonts land after first paint and change the bar's height. */
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(sync).catch(()=>{});
  window.addEventListener("load", sync);
})();

/* ============================================================
   TERMINAL GUTTER — numbers that cannot drift
   ------------------------------------------------------------
   The numbers down the left of the profile terminal were typed by
   hand and had drifted to 01, 02, 02, 03, 05: one repeated, one
   skipped. That is what hand-typed line numbers always do in the
   end, and these are worse than most, because the lines beside
   them are editable from the CMS — add a line in the editor and
   the gutter silently goes wrong again.

   So the gutter is generated from however many lines are actually
   there. Zero-padded to two digits to match the monospace column,
   and marked aria-hidden: a screen reader reading "zero one" before
   every sentence is noise, and the numbers carry no meaning beyond
   making the block look like a listing.
   ============================================================ */
(() => {
  const body = document.querySelector(".terminal-body");
  if(!body) return;

  function renumber(){
    const lines = body.querySelectorAll(".line");
    lines.forEach((line, i) => {
      const gutter = line.firstElementChild;
      if(!gutter) return;
      gutter.textContent = String(i + 1).padStart(2, "0");
      gutter.setAttribute("aria-hidden", "true");
    });
  }
  renumber();

  /* Site settings arrive after load and can add or remove lines, so
     renumber whenever the block's children change. Guarded against its
     own writes: textContent changes fire childList too, and without the
     flag this would loop. */
  let busy = false;
  const mo = new MutationObserver(() => {
    if(busy) return;
    busy = true;
    renumber();
    busy = false;
  });
  mo.observe(body, {childList:true});
})();

/* ============================================================
   WHOAMI — SAME HUMAN CONTOUR REVEAL
   ============================================================ */
(() => {
  function initWhoami(){
    const field=document.getElementById("whoamiField");
    const backdrop=document.querySelector(".human-backdrop");
    const ascii=document.getElementById("asciiArt");
    const photo=document.getElementById("realPortrait");
    if(!field||!backdrop||!ascii||!photo)return;

    const hint='Type “whoami” to see the man behind the code';
    const reverseHint='Type “code” to return behind the code';
    let revealed=false;
    let navigating=false;   // set while leaving for the editor, so the blur
                            // handler below doesn't wipe the "opening" message

    function registerPhoto(){
      const a=ascii.getBoundingClientRect();
      const b=backdrop.getBoundingClientRect();
      const gs=parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue("--human-scale"))||1;

      const localLeft=(a.left-b.left)/gs;
      const localTop=(a.top-b.top)/gs;
      const localW=a.width/gs;
      const localH=a.height/gs;

      photo.style.width=`${localW}px`;
      photo.style.height=`${localH}px`;
      photo.style.left=`${localLeft}px`;
      photo.style.top=`${localTop}px`;
      photo.style.bottom="auto";
      photo.style.transform="none";
    }

    function showPhoto(){
      registerPhoto();
      revealed=true; backdrop.classList.add("crossfade");
      backdrop.classList.add("revealed");
      window.setTimeout(()=>backdrop.classList.remove("crossfade"), 760);
      field.value="";
      field.placeholder=reverseHint;
      field.blur();
    }

    function showCode(){
      revealed=false; backdrop.classList.add("crossfade");
      backdrop.classList.remove("revealed");
      window.setTimeout(()=>backdrop.classList.remove("crossfade"), 760);
      field.value="";
      field.placeholder=hint;
      field.focus();
    }

    /* Hidden command: not mentioned in the placeholder, on purpose. Typing
       "edit portfolio" (or just "editor") anywhere in this terminal jumps
       straight to the editor UI, which then asks for the admin key. It works
       whether the photo is revealed or not, since it isn't part of the
       whoami/code toggle. */
    const EDITOR_COMMANDS=["edit portfolio","edit-portfolio","editportfolio","editor","edit"];

    function openEditor(){
      navigating=true;
      field.value="";
      field.placeholder="→ opening editor …";
      field.blur();
      window.setTimeout(()=>{window.location.href="editor.html";},420);
    }

    function handleCommand(){
      const command=field.value.trim().toLowerCase().replace(/\s+/g," ");

      if(EDITOR_COMMANDS.includes(command)){
        openEditor();
        return;
      }

      if(!revealed && command==="whoami"){
        showPhoto();
        return;
      }

      if(revealed && (command==="code" || command==="ascii")){
        showCode();
      }
    }

    field.addEventListener("focus",()=>{
      field.placeholder="";
    });

    field.addEventListener("keydown",e=>{
      if(e.key!=="Enter")return;
      e.preventDefault();
      e.stopPropagation();
      handleCommand();
    });

    field.addEventListener("blur",()=>{
      if(navigating)return;
      if(field.value.trim()===""){
        field.placeholder=revealed?reverseHint:hint;
      }
    });

    window.addEventListener("resize",()=>{if(!revealed)registerPhoto()});
    if(document.fonts&&document.fonts.ready){
      document.fonts.ready.then(()=>requestAnimationFrame(registerPhoto));
    }else requestAnimationFrame(registerPhoto);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initWhoami,{once:true});
  }else initWhoami();
})();


/* ============================================================
   GITHUB CONTRIBUTIONS SYNC
   Pulls a real GitHub contribution calendar into the Activity
   panel, client-side, with no backend and no access token.

   Data sources (both public, CORS-enabled, unauthenticated):
   - https://api.github.com/users/<username>            → profile stats
   - https://github-contributions-api.jogruber.de/v4/... → daily contribution calendar

   The username is entered once via the "Sync GitHub" control in
   the Activity panel and remembered in this browser (localStorage),
   so it re-syncs automatically on future visits. Results are also
   cached for a few hours to stay well under public rate limits.
   ============================================================ */
(() => {
  const GITHUB_STORAGE_KEY="portfolio-github-username";
  const GITHUB_CACHE_KEY="portfolio-github-cache";
  const GITHUB_CACHE_TTL=1000*60*60*6; // 6 hours
  const GITHUB_DEFAULT_USERNAME="dalerivatives"; // https://github.com/dalerivatives — change here to re-point the whole site

  const heatmapEl=document.getElementById("heatmap");
  const contribCountEl=document.getElementById("contribCount");
  const syncNoteEl=document.getElementById("syncNote");
  /* The GitHub icon is now just one entry in the Site settings social list,
     so this section no longer owns any link element — the heatmap username
     and the icon's URL are set independently, which is what you'd expect. */

  if(!heatmapEl) return;

  function renderDemoHeatmap(){
    heatmapEl.innerHTML="";
    const frag=document.createDocumentFragment();
    for(let i=0;i<364;i++){
      const cell=document.createElement("div");
      const r=Math.random();
      const level=r>0.86?4:r>0.68?3:r>0.48?2:r>0.28?1:0;
      cell.className="cell"+(level?` l${level}`:"");
      frag.appendChild(cell);
    }
    heatmapEl.appendChild(frag);
    if(contribCountEl){
      contribCountEl.innerHTML=`— <small>contributions in the last year</small>`;
    }
  }

  function renderHeatmapFromContributions(days){
    heatmapEl.innerHTML="";
    const frag=document.createDocumentFragment();
    days.forEach(day=>{
      const cell=document.createElement("div");
      const level=Math.max(0,Math.min(4, day.level ?? (day.count>0?1:0)));
      cell.className="cell"+(level?` l${level}`:"");
      cell.title=`${day.count} contribution${day.count===1?"":"s"} on ${day.date}`;
      frag.appendChild(cell);
    });
    heatmapEl.appendChild(frag);
  }

  async function fetchJSON(url, ms=8000){
    const controller=new AbortController();
    const id=setTimeout(()=>controller.abort(), ms);
    try{
      const res=await fetch(url,{signal:controller.signal});
      if(!res.ok) throw new Error("HTTP "+res.status);
      return await res.json();
    } finally { clearTimeout(id); }
  }


  function applyGithubData(data, username, fromCache){
    const days=(data.calendar && data.calendar.contributions) || [];
    const trimmed=days.slice(-364);
    if(trimmed.length){
      renderHeatmapFromContributions(trimmed);
      const total=trimmed.reduce((sum,d)=>sum+(d.count||0),0);
      if(contribCountEl){
        contribCountEl.innerHTML=`${total.toLocaleString()} <small>contributions in the last year</small>`;
      }
    } else {
      renderDemoHeatmap();
    }
    if(syncNoteEl){
      const repoCount=data.profile && typeof data.profile.public_repos==="number" ? `${data.profile.public_repos} public repos` : "";
      const followerCount=data.profile && typeof data.profile.followers==="number" ? `${data.profile.followers} followers` : "";
      const bits=[`Synced with @${username}`, repoCount, followerCount].filter(Boolean);
      syncNoteEl.textContent=bits.join(" · ")+(fromCache?" (cached)":"");
    }
  }

  async function syncGithub(username, {force=false}={}){
    if(!username) return;

    if(!force){
      try{
        const cached=JSON.parse(localStorage.getItem(GITHUB_CACHE_KEY)||"null");
        if(cached && cached.username===username && (Date.now()-cached.at)<GITHUB_CACHE_TTL){
          applyGithubData(cached.data, username, true);
          return;
        }
      }catch(e){/* ignore corrupt cache */}
    }

    if(syncNoteEl) syncNoteEl.textContent=`Syncing @${username}…`;

    try{
      const [profile, calendar]=await Promise.all([
        fetchJSON(`https://api.github.com/users/${encodeURIComponent(username)}`),
        fetchJSON(`https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`)
      ]);
      const data={profile, calendar};
      try{ localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify({username, at:Date.now(), data})); }catch(e){}
      applyGithubData(data, username, false);
    }catch(err){
      if(syncNoteEl) syncNoteEl.textContent=`Couldn't reach GitHub for @${username} right now — showing sample activity instead. Check the username and your connection, then try again.`;
      renderDemoHeatmap();
    }
  }

  async function init(){
    // GitHub is pre-connected — no manual "connect" UI. The username comes
    // from the "GitHub username" field in the editor's Site settings tab;
    // GITHUB_DEFAULT_USERNAME is only the fallback if settings can't load.
    // A per-browser override is still possible via:
    //   localStorage.setItem("portfolio-github-username", "someone-else")
    renderDemoHeatmap();
    const settings = await settingsReady;   // don't race the settings fetch
    const configured = settings && (settings.github_username||"").trim();
    const saved = localStorage.getItem(GITHUB_STORAGE_KEY) || configured || GITHUB_DEFAULT_USERNAME;
    if(saved){
      syncGithub(saved);
    }
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else init();
})();


/* ============================================================
   CMS SECTIONS — Projects / Achievements / Tools
   Each renders from the backend content API as category headings,
   each holding a horizontally swipeable strip of item cards.
   Content is managed from /editor.html (see README).
   ============================================================ */
(() => {
  function escapeHtml(str){
    return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function hostOf(url){
    try{ return new URL(url, window.location.origin).hostname.replace(/^www\./, ""); }catch(e){ return String(url||""); }
  }

  function youTubeId(url){
    const m = String(url||"").match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  /* A clickable destination card. Starts as the domain plus an icon, then
     fills in with the target site's own preview image, title and blurb once
     /api/link-preview has fetched them (the browser can't read another
     site's Open Graph tags itself — CORS — so the server does it and caches
     the result for everyone). Clicking anywhere on it opens the real site. */
  function linkCard(url){
    let host = url;
    try{ host = new URL(url, window.location.origin).hostname.replace(/^www\./, ""); }catch(e){}
    const icon = /github\.com$/.test(host) ? "fa-brands fa-github"
               : /(youtube|youtu\.be|vimeo)/.test(host) ? "fa-solid fa-play"
               : /(drive\.google|docs\.google)/.test(host) ? "fa-solid fa-folder-open"
               : "fa-solid fa-arrow-up-right-from-square";
    let hue = 0;
    for(let i=0;i<host.length;i++) hue = (hue*31 + host.charCodeAt(i)) % 360;
    return `<a class="link-preview loading" href="${escapeHtml(url)}" target="_blank" rel="noopener"
               style="--site-hue:${hue}" data-preview-url="${escapeHtml(url)}">
      <div class="link-preview-shot" aria-hidden="true"><i class="${icon}"></i><b>${escapeHtml(host.charAt(0).toUpperCase())}</b></div>
      <div class="link-preview-text">
        <span class="link-preview-host"><i class="${icon}" aria-hidden="true"></i> ${escapeHtml(host)}</span>
        <span class="link-preview-title">${escapeHtml(host)}</span>
        <span class="link-preview-desc"></span>
      </div>
      <span class="link-preview-go" aria-hidden="true"><i class="fa-solid fa-arrow-right"></i></span>
    </a>`;
  }

  /* Fills in preview cards after they're in the DOM. Each URL is fetched
     once per page even if several cards point at it, and a card that can't
     be previewed just stays as the tidy domain row it started as. */
  const previewCache = new Map();

  function hydrateLinkPreviews(scope){
    (scope || document).querySelectorAll(".link-preview[data-preview-url]").forEach(card=>{
      const url = card.dataset.previewUrl;
      delete card.dataset.previewUrl;          // only ever hydrate once
      if(!previewCache.has(url)){
        previewCache.set(url, fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
          .then(r=>r.ok ? r.json() : null)
          .catch(()=>null));
      }
      previewCache.get(url).then(data=>{
        card.classList.remove("loading");
        if(!data || !data.ok) return;
        if(data.title){
          card.querySelector(".link-preview-title").textContent = data.title;
        }
        if(data.description){
          card.querySelector(".link-preview-desc").textContent = data.description;
        }
        if(data.image){
          const shot = card.querySelector(".link-preview-shot");
          const img = document.createElement("img");
          img.alt = "";
          img.referrerPolicy = "no-referrer";   // some CDNs refuse a foreign referrer
          /* The image is put in the DOM before its src is set, on purpose.
             A detached image is never "near the viewport", so the browser is
             free to defer it forever — with lazy loading that means onload
             never fires and the picture never appears at all. In the DOM it
             loads normally; the icon stays underneath until it succeeds, and
             a broken URL removes the image and leaves the icon showing. */
          img.onload = ()=>{
            /* A site with no Open Graph image falls back to its favicon or a
               touch icon. Those are tiny and square — stretched across the
               thumbnail they look like a mistake — so a small image is shown
               as a centred badge on a tinted ground instead of a cover fill. */
            shot.classList.add(img.naturalWidth && img.naturalWidth < 200 ? "has-icon" : "has-image");
          };
          img.onerror = ()=>img.remove();
          shot.appendChild(img);
          img.src = data.image;
        }
      });
    });
  }

  function vimeoId(url){
    const m = String(url||"").match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
    return m ? m[1] : null;
  }

  /* Photos and videos NEVER navigate away — they enlarge in place.
     A picture or a video is content on this page, not a pointer to someone
     else's site, so tapping one opens the lightbox rather than throwing the
     visitor out to YouTube or an image host. Only a plain link (a repo, an
     article, a demo) is allowed to leave. */
  function renderMedia(item){
    const url = item.media_url;
    if(!url) return "";
    const title = escapeHtml(item.title || "");

    if(item.media_type==="image"){
      return `<div class="cms-card-media">
        <img src="${escapeHtml(url)}" alt="${title}" loading="lazy">
        <button type="button" class="media-zoom" data-zoom-type="image" data-zoom-src="${escapeHtml(url)}"
                data-zoom-title="${title}" aria-label="Enlarge ${title}"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
      </div>`;
    }
    if(item.media_type==="video_file"){
      return `<div class="cms-card-media">
        <video src="${escapeHtml(url)}" controls preload="metadata" playsinline></video>
        <button type="button" class="media-zoom" data-zoom-type="video_file" data-zoom-src="${escapeHtml(url)}"
                data-zoom-title="${title}" aria-label="Enlarge ${title}"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
      </div>`;
    }
    if(item.media_type==="video_link"){
      const yid = youTubeId(url);
      if(yid){
        /* modestbranding + rel=0 strip most of YouTube's own exit chrome, and
           nocookie keeps tracking off. The player still belongs to YouTube, so
           its logo remains one deliberate click away — that's the player's,
           not a link this site puts in front of you. */
        const src = `https://www.youtube-nocookie.com/embed/${escapeHtml(yid)}?rel=0&modestbranding=1&playsinline=1`;
        return `<div class="cms-card-media">
          <div class="yt-embed"><iframe src="${src}" title="${title}" loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
          <button type="button" class="media-zoom" data-zoom-type="embed" data-zoom-src="${src}"
                  data-zoom-title="${title}" aria-label="Enlarge ${title}"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
        </div>`;
      }
      const vid = vimeoId(url);
      if(vid){
        const src = `https://player.vimeo.com/video/${escapeHtml(vid)}`;
        return `<div class="cms-card-media">
          <div class="yt-embed"><iframe src="${src}" title="${title}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>
          <button type="button" class="media-zoom" data-zoom-type="embed" data-zoom-src="${src}"
                  data-zoom-title="${title}" aria-label="Enlarge ${title}"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
        </div>`;
      }
      /* A video URL we can't embed. It still must not become an escape hatch,
         so it renders as an inert tile rather than a link. */
      return `<div class="cms-card-media media-inert">
        <span class="media-inert-mark" aria-hidden="true"><i class="fa-solid fa-film"></i></span>
        <span class="media-inert-text">Video · ${escapeHtml(hostOf(url))}</span>
      </div>`;
    }
    /* Anything pasted that isn't a picture or a video — a GitHub repo, a
       live demo, an article, a Drive file — becomes a clickable row that
       opens the real destination in a new tab, labelled with its domain so
       you can see where it goes before clicking. */
    if(item.media_type==="link"){
      return linkCard(url);
    }
    return "";
  }

  function renderCard(item){
    const tags = String(item.tools||"").split(",").map(t=>t.trim()).filter(Boolean);
    const tagsHtml = tags.length ? `<div class="tags">${tags.map(t=>`<span>${escapeHtml(t)}</span>`).join("")}</div>` : "";
    const descHtml = item.description ? `<p>${escapeHtml(item.description)}</p>` : "";
    return `<article class="cms-card">${renderMedia(item)}<h4>${escapeHtml(item.title)}</h4>${descHtml}${tagsHtml}</article>`;
  }

  function wireCarousel(scopeEl, cardCount){
    const track = scopeEl.querySelector(".carousel-track");
    const prevBtn = scopeEl.querySelector(".carousel-nav.prev");
    const nextBtn = scopeEl.querySelector(".carousel-nav.next");
    const dots = Array.from(scopeEl.querySelectorAll(".carousel-dots button"));
    if(!track) return;

    function currentIndex(){
      return Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    }
    function updateNav(){
      const idx = Math.max(0, Math.min(cardCount-1, currentIndex()));
      if(prevBtn) prevBtn.disabled = idx<=0;
      if(nextBtn) nextBtn.disabled = idx>=cardCount-1;
      dots.forEach((d,i)=>d.classList.toggle("active", i===idx));
    }
    function goTo(idx){
      idx = Math.max(0, Math.min(cardCount-1, idx));
      track.scrollTo({left: idx*track.clientWidth, behavior:"smooth"});
    }
    prevBtn && prevBtn.addEventListener("click", ()=>goTo(currentIndex()-1));
    nextBtn && nextBtn.addEventListener("click", ()=>goTo(currentIndex()+1));
    dots.forEach((d,i)=>d.addEventListener("click", ()=>goTo(i)));
    track.addEventListener("scroll", ()=>{clearTimeout(track.__navT); track.__navT=setTimeout(updateNav,80);}, {passive:true});
    window.addEventListener("resize", ()=>{clearTimeout(track.__resizeT); track.__resizeT=setTimeout(()=>goTo(currentIndex()),120);});

    // Pointer-drag scrolling for desktop mice / trackpads (native touch handles swipe)
    let dragging=false, startX=0, startScroll=0, moved=false;
    /* Pointer-drag scrolling that doesn't eat clicks on links.

       The pointer is captured ONLY once the drag passes a threshold. Capturing
       it on pointerdown (the obvious way) retargets every later pointer event
       to the track, so a link inside a card never receives its own pointerup —
       and without that pair the browser never fires `click` on the link at
       all. That's why clicking a card's link did nothing however many times
       you tried it. Capturing late means a plain click is a plain click, and
       a real drag still scrolls. */
    let captured = false;
    const DRAG_THRESHOLD = 6;

    track.addEventListener("pointerdown", e=>{
      if(e.pointerType==="touch") return;
      if(e.button !== 0) return;
      dragging=true; moved=false; captured=false;
      startX=e.clientX; startScroll=track.scrollLeft;
    });
    track.addEventListener("pointermove", e=>{
      if(!dragging) return;
      const dx = e.clientX-startX;
      if(!moved && Math.abs(dx) > DRAG_THRESHOLD){
        moved = true;
        track.classList.add("dragging");
        // Now it's genuinely a drag, so take the pointer.
        try{ track.setPointerCapture(e.pointerId); captured = true; }catch(err){}
      }
      if(!moved) return;
      e.preventDefault();
      track.scrollLeft = startScroll-dx;
    });
    function endDrag(e){
      if(!dragging) return;
      dragging=false;
      if(captured && e && e.pointerId !== undefined){
        try{ track.releasePointerCapture(e.pointerId); }catch(err){}
      }
      captured=false;
      track.classList.remove("dragging");
      if(moved) goTo(currentIndex());   // only snap if it actually moved
    }
    track.addEventListener("pointerup", endDrag);
    track.addEventListener("pointercancel", endDrag);
    /* Swallow the click that ends a real drag, so releasing over a link
       doesn't also open it. A click with no drag passes straight through. */
    track.addEventListener("click", e=>{ if(moved){ e.preventDefault(); e.stopPropagation(); moved=false; } }, true);

    /* Keyboard paging. The track is focusable (tabindex set in the markup)
       and announces itself as a carousel, so someone using a keyboard or a
       screen reader can page through cards with the arrow keys / Home / End
       instead of only being able to reach the arrow buttons. */
    track.addEventListener("keydown", e=>{
      const keys={ArrowRight:1, ArrowLeft:-1, PageDown:1, PageUp:-1};
      if(e.key in keys){
        e.preventDefault();
        goTo(currentIndex()+keys[e.key]);
      }else if(e.key==="Home"){
        e.preventDefault(); goTo(0);
      }else if(e.key==="End"){
        e.preventDefault(); goTo(cardCount-1);
      }
    });

    updateNav();
  }

  function renderCategory(category){
    const wrap = document.createElement("div");
    wrap.className = "cms-category";
    const count = category.items.length;
    const dotsHtml = count>1 ? `<div class="carousel-dots">${category.items.map((it,i)=>`<button type="button" aria-label="Go to ${escapeHtml(it.title||("item "+(i+1)))}"${i===0?' class="active"':""}></button>`).join("")}</div>` : "";
    const label = escapeHtml(category.name);
    wrap.innerHTML = `
      <div class="cms-category-head">
        <h3>${label}</h3>
      </div>
      <div class="carousel">
        <button type="button" class="carousel-nav prev" aria-label="Previous item in ${label}"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
        <div class="carousel-track" tabindex="0" role="group" aria-roledescription="carousel" aria-label="${label} — ${count} item${count===1?"":"s"}, use arrow keys to browse">${category.items.map(renderCard).join("")}</div>
        <button type="button" class="carousel-nav next" aria-label="Next item in ${label}"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
      </div>
      ${dotsHtml}`;
    wireCarousel(wrap, count);
    hydrateLinkPreviews(wrap);
    return wrap;
  }

  async function loadCmsSection(container){
    const section = container.dataset.section;
    const emptyLabel = container.dataset.emptyLabel || "Nothing here yet.";
    container.innerHTML = `<p class="cms-loading">Loading…</p>`;
    try{
      const res = await fetch(`/api/content/${encodeURIComponent(section)}`);
      if(!res.ok) throw new Error("HTTP "+res.status);
      const categories = await res.json();
      const withItems = categories.filter(c=>c.items && c.items.length);
      if(!withItems.length){
        container.innerHTML = `<p class="cms-empty">${escapeHtml(emptyLabel)}</p>`;
        return;
      }
      container.innerHTML = "";
      withItems.forEach(cat => container.appendChild(renderCategory(cat)));
    }catch(err){
      container.innerHTML = `<p class="cms-empty">Couldn't load this section right now — is the backend server running? (Static previews without the FastAPI backend won't have live content.)</p>`;
    }
  }

  function init(){
    document.querySelectorAll(".cms-section[data-section]").forEach(loadCmsSection);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", init, {once:true});
  } else init();
})();


/* ============================================================
   WORLD CHAT
   A real public chat: a visitor picks a display name (kept in this browser
   so they don't retype it) and posts messages everyone can see. There are
   no accounts — names are self-assigned and unverified, which is what a
   world chat is.

   Polling, not websockets: one small GET every few seconds is far simpler
   to run on a free-tier host than a persistent socket, and this doesn't
   need sub-second delivery. It only polls while the Chat page is actually
   open and the tab is visible, so an idle tab costs nothing.
   ============================================================ */
(() => {
  const log = document.getElementById("chatLog");
  if(!log) return;

  const nameForm = document.getElementById("chatNameForm");
  const nameInput = document.getElementById("chatNameInput");
  const sendForm = document.getElementById("chatSendForm");
  const bodyInput = document.getElementById("chatBodyInput");
  const sendBtn = document.getElementById("chatSendBtn");
  const errorEl = document.getElementById("chatError");
  const whoWrap = document.getElementById("chatWho");
  const whoName = document.getElementById("chatWhoName");
  const composerAvatar = document.getElementById("chatComposerAvatar");
  const whoFace = document.getElementById("chatWhoFace");
  const lockedEl = document.getElementById("chatLocked");
  const lockedHp = document.getElementById("chatLockedHp");

  const NAME_KEY = "portfolio-chat-name";
  const DEVICE_KEY = "portfolio-device-id";

  /* The voice toggle lives in the robot-voice module; both read the same
     stored preference so the welcome respects a muted robot. */
  function voiceOn(){
    try{ return localStorage.getItem("portfolio-chat-voice") !== "off"; }catch(e){ return true; }
  }

  /* A random per-browser id. Not an account and not proof of anything — it
     only has to answer "is this the same visitor who claimed that name
     earlier today?", which is all a 24-hour room needs. */
  function deviceId(){
    let id = "";
    try{ id = localStorage.getItem(DEVICE_KEY) || ""; }catch(e){}
    if(!id){
      id = (crypto.randomUUID ? crypto.randomUUID()
                              : String(Date.now()) + Math.random().toString(36).slice(2));
      try{ localStorage.setItem(DEVICE_KEY, id); }catch(e){}
    }
    return id;
  }
  const POLL_MS = 5000;
  let displayName = "";
  let lastId = 0;
  let painted = false;
  let pollTimer = null;

  try{ displayName = localStorage.getItem(NAME_KEY) || ""; }catch(e){}

  function esc(str){
    return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function toDate(iso){
    if(!iso) return null;
    const d = new Date(iso.endsWith("Z")||iso.includes("+") ? iso : iso + "Z");
    return isNaN(d) ? null : d;
  }

  /* Clock time on the bubble, the way every modern chat does it — relative
     ages ("4m ago") go stale the moment you stop re-rendering. */
  function clock(iso){
    const d = toDate(iso);
    if(!d) return "";
    return d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});
  }

  /* Date separators between days, so a log that spans midnight reads right. */
  function dayKey(iso){
    const d = toDate(iso);
    return d ? d.toDateString() : "";
  }
  function dayLabel(iso){
    const d = toDate(iso);
    if(!d) return "";
    const today = new Date().toDateString();
    const yest = new Date(Date.now()-86400000).toDateString();
    const key = d.toDateString();
    if(key === today) return "Today";
    if(key === yest) return "Yesterday";
    return d.toLocaleDateString(undefined,{weekday:"long", month:"short", day:"numeric"});
  }

  /* A generated character head, falling back to initials if avatar.js
     somehow isn't loaded. */
  function face(name){
    if(window.ChatAvatar) return window.ChatAvatar.svg(name || "?");
    return esc(initials(name));
  }

  /* One or two letters for the avatar disc. */
  function initials(name){
    const parts = String(name||"?").trim().split(/\s+/).filter(Boolean);
    if(!parts.length) return "?";
    if(parts.length === 1) return parts[0].slice(0,2).toUpperCase();
    return (parts[0][0] + parts[parts.length-1][0]).toUpperCase();
  }

  /* A stable color per name, so the same person reads as the same person
     down the log without needing accounts. */
  function hueFor(name){
    let hash = 0;
    for(let i=0;i<name.length;i++) hash = (hash*31 + name.charCodeAt(i)) % 360;
    return hash;
  }

  /* One name per device, chosen once and kept.
     Without accounts there is nothing to tie an identity to, so a name that
     can be swapped at will means the log can't be read: the same face and
     colour would drift between people, and anyone could re-use a name that
     had just been someone else. Fixing it to the browser is the closest this
     can get to "one person, one voice" — a returning visitor is recognisably
     the same person, and a second person needs their own browser. */
  function setName(value){
    displayName = value;
    try{ localStorage.setItem(NAME_KEY, value); }catch(e){}
    const known = !!value;
    whoWrap.hidden = !known;
    whoName.textContent = value;
    if(composerAvatar){
      composerAvatar.innerHTML = known ? face(value) : "";
    }
    if(whoFace) whoFace.innerHTML = known ? face(value) : "";
    applyGate();
    // Lets the robot module unlock its stage the instant a name exists.
    window.dispatchEvent(new CustomEvent("chat-named", {detail:{name: value}}));
    if(known && !sendForm.hidden) bodyInput.focus();
  }

  /* ---- the chat gate -------------------------------------------------
     The composer only unlocks once THIS viewer has seen the robot destroyed.
     Deliberately per-browser (localStorage), not per-account: there are no
     accounts here, and the point is the ritual, not real security — anyone
     determined can clear storage, exactly as they can with a real captcha.
     window.__robotBeaten is set by the robot module the moment it explodes,
     which is what makes the unlock feel immediate rather than on reload. */
  /* Verified means "this claim has destroyed UNIT-01", and the SERVER says so.
     It used to be a localStorage flag, which outlived the thing it described:
     the 24-hour reset wiped the room and rebuilt the robot at full health, but
     the browser still said "beaten", so the composer sat open next to a robot
     nobody had touched. The flag is cleared here so an upgraded browser
     doesn't keep believing it. */
  let verified = false;
  let gateWasOpen = null;
  try{ localStorage.removeItem("portfolio-robot-beaten"); }catch(e){}
  function beaten(){ return verified; }
  function applyGate(){
    const named = !!displayName;
    const open = beaten();
    if(lockedEl) lockedEl.hidden = open || !named;
    sendForm.hidden = !named || !open;
    nameForm.hidden = named;
    if(open && named && document.getElementById("chatView").classList.contains("active")){
      // don't steal focus on page load, only when the gate actually opens
      if(lockedEl && lockedEl.dataset.wasLocked === "1"){
        lockedEl.dataset.wasLocked = "0";
        bodyInput.focus();
      }
    }
    if(lockedEl && !lockedEl.hidden) lockedEl.dataset.wasLocked = "1";

    /* The moment the chat becomes usable. Sounded once per transition,
       not on every re-check — applyGate() runs on a heartbeat and on
       every stream event, and a latch that keeps re-latching is noise.
       `gateWasOpen` starts null so arriving at an already-open chat is
       silent; nothing just happened. */
    const nowOpen = open && named;
    if(gateWasOpen !== null && nowOpen && !gateWasOpen && window.SFX) window.SFX.unlock();
    gateWasOpen = nowOpen;
  }
  /* The robot module fires this when a kill lands. It doesn't decide anything
     — it just prompts a re-check, because only the server knows whether THIS
     person landed a blow during the life that ended. */
  window.addEventListener("robot-destroyed", ()=>{ setTimeout(syncClaim, 350); });
  // ...and this on every HP change, so the locked panel shows the countdown.
  window.addEventListener("robot-hp", e=>{
    if(lockedHp) lockedHp.textContent = Math.round(e.detail && e.detail.hp || 0) + "%";
  });

  const nameErrorEl = document.getElementById("chatNameError");

  /* Errors belong next to the field that caused them: a name collision has to
     appear under the name row, not under a composer that isn't on screen. */
  function showError(text){
    const target = nameForm.hidden ? errorEl : nameErrorEl;
    const other  = nameForm.hidden ? nameErrorEl : errorEl;
    if(other){ other.textContent = ""; other.hidden = true; }
    if(!target) return;
    target.textContent = text || "";
    target.hidden = !text;
  }

  function render(messages){
    /* Before the empty-log early return, not after: on a quiet day the first
       render is an empty list, and returning early there left the voice
       module unseeded — so the very first message to arrive was treated as
       backlog and silently swallowed. */
    if(window.RobotVoice) window.RobotVoice.announce(messages);

    if(!messages.length){
      log.innerHTML = `<div class="chat-empty">
        <span class="chat-empty-mark" aria-hidden="true"><i class="fa-regular fa-comments"></i></span>
        <b>Nobody's said anything yet.</b>
        <em>Be the first — everything here clears itself after 24 hours.</em>
      </div>`;
      return;
    }
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;

    let html = "";
    let lastDay = "";
    let lastName = null;
    let lastTime = 0;

    messages.forEach(m => {
      const name = m.name || "";
      const mine = name === displayName;

      // Day separator whenever the calendar date changes.
      const key = dayKey(m.created_at);
      if(key && key !== lastDay){
        html += `<div class="chat-day"><span>${esc(dayLabel(m.created_at))}</span></div>`;
        lastDay = key;
        lastName = null;   // always re-show the header after a separator
      }

      // Group consecutive messages from the same person inside 5 minutes:
      // the avatar and name only print once at the top of a run.
      const t = (toDate(m.created_at) || new Date(0)).getTime();
      const grouped = name === lastName && (t - lastTime) < 5*60*1000;
      lastName = name;
      lastTime = t;

      const hue = hueFor(name);
      html += `<div class="chat-msg${mine?" mine":""}${grouped?" grouped":""}" style="--who-hue:${hue}">
        <span class="chat-avatar" aria-hidden="true">${face(name)}</span>
        <div class="chat-bubble-wrap">
          ${grouped ? "" : `<span class="chat-msg-name">${esc(name)}</span>`}
          <div class="chat-bubble">
            <span class="chat-msg-body">${esc(m.body)}</span>
            <time class="chat-msg-time">${esc(clock(m.created_at))}</time>
          </div>
        </div>
      </div>`;
    });

    log.innerHTML = html;
    /* New messages win. Measured BEFORE the repaint (nearBottom, above), so
       someone scrolled up reading history isn't yanked away — but their own
       message, and the common case of sitting at the bottom, always lands in
       view. */
    if(nearBottom){
      log.scrollTop = log.scrollHeight;
      // Again on the next frame: the avatars are inline SVG that lay out
      // after this assignment, and without the second pass the last bubble
      // sits just below the fold.
      requestAnimationFrame(()=>{ log.scrollTop = log.scrollHeight; });
    }
  }

  async function loadMessages(){
    try{
      const res = await fetch("/api/chat?limit=60");
      if(!res.ok) throw new Error("chat unavailable");
      const messages = await res.json();
      const newest = messages.length ? messages[messages.length-1].id : 0;
      // `newest !== lastId` alone never fires for an empty chat (0 === 0), so
      // the "Loading messages…" placeholder would sit there forever on a quiet
      // day. `painted` makes sure the first response always renders.
      if(newest !== lastId || !painted){
        lastId = newest;
        painted = true;
        render(messages);
      }
    }catch(err){
      if(!lastId) log.innerHTML = `<div class="chat-empty">
        <span class="chat-empty-mark" aria-hidden="true"><i class="fa-solid fa-plug-circle-xmark"></i></span>
        <b>Chat isn't reachable right now.</b>
        <em>It'll reconnect on its own.</em>
      </div>`;
    }
  }

  const joinBtn = document.getElementById("chatJoinBtn");

  nameForm.addEventListener("submit", async e=>{
    e.preventDefault();
    if(displayName) return;              // already claimed on this device
    const value = nameInput.value.trim().slice(0,40);
    if(!value) return;
    showError("");
    if(joinBtn) joinBtn.disabled = true;
    try{
      /* The server owns the claim. Doing this in the browser alone would be
         one devtools command away from posting as anybody, and the name is
         the only thing other viewers have to go on. */
      const res = await fetch("/api/chat/name", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name: value, device_id: deviceId()})
      });
      const data = await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.detail || "Couldn't claim that name.");
      const claimed = data.name || value;
      verified = !!data.verified;
      setName(claimed);
      // Spoken once, on the claim itself — syncClaim() calls setName too, and
      // greeting someone again on every reload would get old fast.
      if(window.Speech && window.Speech.supported && voiceOn()){
        window.Speech.robot(`Welcome to the world! ${claimed}`, true);
      }
    }catch(err){
      showError(err.message);
    }finally{
      if(joinBtn) joinBtn.disabled = false;
    }
  });

  /* The room resets every 24 hours, names included — so a stored name can
     outlive its claim. Ask the server what this device actually holds and
     believe that, not localStorage. */
  async function syncClaim(){
    try{
      const res = await fetch(`/api/chat/name?device_id=${encodeURIComponent(deviceId())}`);
      if(!res.ok) return;
      const data = await res.json();
      if(data.claimed && data.name){
        verified = !!data.verified;
        if(data.name !== displayName) setName(data.name);
        else applyGate();
      }else{
        verified = false;
        if(displayName){
          // the claim expired with the log — back to picking a name
          setName("");
          nameInput.value = "";
        }
        // Nothing else to say. Devices are independent: what another phone on
        // the same Wi-Fi is called has nothing to do with this one.
      }
    }catch(e){/* offline: keep what we have rather than locking them out */}
  }

  sendForm.addEventListener("submit", async e=>{
    e.preventDefault();
    const body = bodyInput.value.trim();
    if(!body) return;
    showError("");
    sendBtn.disabled = true;
    try{
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name: displayName, body, device_id: deviceId()})
      });
      if(!res.ok){
        const detail = await res.json().catch(()=>({}));
        // 409 here means the claim lapsed while the tab sat open.
        if(res.status === 409 || res.status === 403) syncClaim();
        throw new Error(detail.detail || "Couldn't send that.");
      }
      bodyInput.value = "";
      await loadMessages();
      log.scrollTop = log.scrollHeight;   // your own message always scrolls into view
    }catch(err){
      showError(err.message);
    }finally{
      sendBtn.disabled = false;
      bodyInput.focus();
    }
  });

  /* Poll only while the Chat page is open and the tab is visible. */
  function chatVisible(){
    const view = document.getElementById("chatView");
    return view && view.classList.contains("active") && !document.hidden;
  }

  function tick(){
    if(chatVisible()) loadMessages();
  }

  function startPolling(){
    if(pollTimer) return;
    loadMessages();
    pollTimer = setInterval(tick, POLL_MS);
  }

  document.addEventListener("visibilitychange", ()=>{ if(chatVisible()) loadMessages(); });

  // Load as soon as the Chat page is opened, and once now in case it's the
  // page being linked to directly.
  const stackEl = document.getElementById("stack");
  if(stackEl){
    stackEl.addEventListener("click", ()=>{
      setTimeout(()=>{ if(chatVisible()){ startPolling(); loadMessages(); } }, 60);
    });
  }
  setName(displayName);
  syncClaim();
  startPolling();

  // A name can expire mid-session, so re-check whenever the page is re-opened.
  document.addEventListener("visibilitychange", ()=>{ if(chatVisible()) syncClaim(); });
})();




/* ============================================================
   THE WORLD CHAT ROBOT
   One robot, shared by everyone on the site, framed as an inverted captcha.

   Two halves:
     - the 3D robot itself (robot3d.js), which owns the visuals
     - this file, which owns the state: taps go to the server, and every
       tap by ANYONE comes back over a live event stream so all viewers see
       each other's hits land at the exact spot they were made.

   Why a live stream rather than polling for the hits: a tap is a moment, and
   a 2-second poll turns someone else's tap into a number that silently
   changes. Server-Sent Events push each hit as it happens, so you see
   "Ana -3.2%" pop up on the shoulder she actually hit. State (HP, kills)
   still gets a slow poll as a safety net in case the stream drops.
   ============================================================ */
(() => {
  const arena = document.getElementById("robotArena");
  if(!arena) return;

  const stage = document.getElementById("robotStage");
  const host3d = document.getElementById("robot3dHost");
  const fallbackBody = document.getElementById("robotBody");
  const fx = document.getElementById("robotFx");
  const hpFill = document.getElementById("robotHpFill");
  const hpValue = document.getElementById("robotHpValue");
  const statusEl = document.getElementById("robotStatus");
  const killsEl = document.getElementById("robotKills");
  const lastHitEl = document.getElementById("robotLastHit");
  const respawnEl = document.getElementById("robotRespawn");
  const respawnCount = document.getElementById("robotRespawnCount");
  const attackersEl = document.getElementById("robotAttackers");
  const checkEl = document.getElementById("robotCheck");
  const captchaSub = document.getElementById("robotCaptchaSub");

  /* ---- sound ----------------------------------------------------------
     UNIT-01's clank, boom and power-up used to be synthesised right here,
     in a module that owned its own AudioContext, its own mute flag and its
     own speaker button. Then every other control on the site wanted a
     sound too, and one page's private audio engine is the wrong place to
     put the whole site's — two contexts fighting over one set of
     autoplay rules, and two mute switches that disagree.

     So the engine moved to sfx.js and this is now a thin alias. The three
     robot voices live there alongside the interface ones, behind the same
     master switch, and the first-gesture primer that makes the very first
     punch land on time is set up once for the whole page rather than once
     per module.

     The fallback object is not defensive padding: if sfx.js ever fails to
     load, the robot must still take hits silently rather than throwing on
     every tap. */
  const sfx = window.SFX || { hit(){}, farHit(){}, boom(){}, revive(){},
                              join(){}, unlock(){}, crown(){}, victory(){},
                              prime(){}, toggle(){ return true; },
                              get muted(){ return true; }, set muted(v){} };

  /* ---- the damage board ----------------------------------------------
     Refreshed after a hit rather than on a timer, and coalesced: a burst of
     taps is one request a couple of seconds later, not one per tap. The
     server owns the ranking — the client only draws it. */
  const boardEl     = document.getElementById("robotBoard");
  const boardList   = document.getElementById("boardList");
  const boardEmpty  = document.getElementById("boardEmpty");
  const boardChamp  = document.getElementById("boardChamp");
  const champFace   = document.getElementById("boardChampFace");
  const champName   = document.getElementById("boardChampName");
  const champRound  = document.getElementById("boardChampRound");
  const champDmg    = document.getElementById("boardChampDmg");
  let boardTimer = null;
  let lastChamp = null, champSeeded = false;

  function boardFace(name){
    return window.ChatAvatar ? window.ChatAvatar.svg(name || "?") : "";
  }

  async function loadBoard(){
    if(!boardEl || !boardList) return;
    try{
      const res = await fetch("/api/robot/leaderboard");
      if(!res.ok) return;
      const data = await res.json();

      /* The round table: who is damaging THIS life of the robot. It empties
         the moment UNIT-01 falls, which is the point — the board is about the
         fight in front of you, never a running total nobody can catch. */
      const round = data.round || [];
      boardList.innerHTML = round.map((row, i)=>`
        <li class="board-row rank-${i+1}">
          <span class="board-rank">${i+1}</span>
          <span class="board-face" aria-hidden="true">${boardFace(row.name)}</span>
          <span class="board-who">
            <b>${esc(row.name)}</b>
            <em>${row.blows} ${row.blows === 1 ? "hit" : "hits"}${
              row.crowns ? ` · ${row.crowns} won` : ""}</em>
          </span>
          <span class="board-damage">${row.damage.toFixed(1)}%</span>
        </li>`).join("");
      if(boardEmpty) boardEmpty.hidden = round.length > 0;

      // ...and the crown, which is the winner of the life BEFORE this one.
      const champ = data.champion;
      if(boardChamp){
        boardChamp.hidden = !champ;
        if(champ){
          champFace.innerHTML = boardFace(champ.name);
          champName.textContent = champ.name;
          champDmg.textContent = champ.damage.toFixed(1) + "%";
          champRound.textContent = data.kills || 1;
          champDmg.title = `${champ.damage.toFixed(1)}% across ${champ.blows} hits`;
        }

        /* A NEW round winner has been crowned.

           Keyed on the name AND the round number, because the same person
           can win twice running and that is still a new crown. The first
           board load only records who is already champion — arriving at a
           page should not congratulate you for something that happened
           before you got there. */
        const key = champ ? `${champ.name}#${data.kills || 0}` : "";
        if(champSeeded && key && key !== lastChamp){
          /* chatName(), not myName(): myName() falls back to the string
             "you" for a visitor who has not joined, and a champion who
             happened to be called "you" would then get the personal
             fanfare played at a stranger. */
          const me = chatName();
          const mine = !!me && champ.name === me;
          if(mine) sfx.victory(); else sfx.crown();
          if(boardChamp){
            boardChamp.classList.remove("crowned");
            void boardChamp.offsetWidth;
            boardChamp.classList.add("crowned");
          }
        }
        lastChamp = key;
        champSeeded = true;
      }
    }catch(e){/* the board is decoration; a failed poll is not worth a message */}
  }

  function refreshBoard(delay){
    clearTimeout(boardTimer);
    boardTimer = setTimeout(loadBoard, delay === undefined ? 1800 : delay);
  }

  /* The speaker button that used to sit in this HUD now governs every
     sound on the site and lives in the control dock, wired up in
     uisound.js. Nothing to paint here any more. */

  const STATE_POLL_MS = 6000;      // safety net; the stream does the real work
  let serverHp = 100, shownHp = 100;
  let dead = false, respawnAt = 0;
  let rafId = null, statePoll = null;
  let use3d = false;
  // -1 means "stream from now" — see /api/robot/events. It becomes a real
  // id after the first event, so a reconnect resumes instead of restarting.
  let stream = null, lastEventId = -1, pollFallback = null;

  /* ---- who's swinging right now -------------------------------------- */
  const attackers = new Map();     // name -> {hits, damage, until}

  function chatName(){
    try{ return localStorage.getItem("portfolio-chat-name") || ""; }catch(e){ return ""; }
  }
  function myName(){ return chatName() || "you"; }
  function myDevice(){
    try{ return localStorage.getItem("portfolio-device-id") || ""; }catch(e){ return ""; }
  }
  /* Named yet? This is the first gate: the robot is the captcha, and there is
     nothing to verify until someone has said who they are. */
  function named(){ return !!chatName(); }

  function esc(str){
    return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  /* A stable colour per name, matching the chat, so the same person is the
     same colour in the log and on the robot. */
  function hueFor(name){
    let hash = 0;
    for(let i=0;i<name.length;i++) hash = (hash*31 + name.charCodeAt(i)) % 360;
    return hash;
  }

  function noteAttacker(name, damage){
    const now = Date.now();
    const entry = attackers.get(name) || {hits:0, damage:0, until:0};
    entry.hits += 1;
    entry.damage += damage;
    entry.until = now + 4000;      // "currently attacking" lasts 4s past the last hit
    attackers.set(name, entry);
    renderAttackers();
    flagUnderAttack(name);
  }

  /* The HUD line reads live for everyone, not just whoever is tapping —
     the point of the shared robot is seeing that someone else is on it. */
  let calmTimer = null;
  function flagUnderAttack(name){
    if(dead) return;
    statusEl.textContent = `Under attack — ${name}`;
    statusEl.classList.add("live");
    clearTimeout(calmTimer);
    calmTimer = setTimeout(()=>{
      if(dead) return;
      statusEl.textContent = "Awaiting attack";
      statusEl.classList.remove("live");
    }, 2600);
  }

  function renderAttackers(){
    const now = Date.now();
    let changed = false;
    attackers.forEach((entry, name)=>{
      if(entry.until < now){ attackers.delete(name); changed = true; }
    });
    if(!attackers.size){
      attackersEl.innerHTML = "";
      return;
    }
    attackersEl.innerHTML = Array.from(attackers.entries())
      .sort((a,b)=>b[1].damage - a[1].damage)
      .slice(0, 5)
      .map(([name, entry])=>`<span class="robot-attacker" style="--who-hue:${hueFor(name)}">
        <i class="robot-attacker-dot"></i>${esc(name)}
        <b>${entry.hits}×</b>
        <em>-${entry.damage.toFixed(1)}%</em>
      </span>`).join("");
  }
  setInterval(renderAttackers, 1000);
  loadBoard();          // draw whatever the room has managed so far

  /* ---- HP bar --------------------------------------------------------- */
  function paint(){
    const pct = Math.max(0, Math.min(100, shownHp));
    window.dispatchEvent(new CustomEvent("robot-hp", {detail:{hp: pct}}));
    hpFill.style.width = pct + "%";
    hpValue.textContent = Math.round(pct) + "%";
    const hue = Math.round((pct / 100) * 130);
    hpFill.style.background = `hsl(${hue} 85% 52%)`;
    hpValue.style.color = `hsl(${hue} 85% ${pct < 50 ? 62 : 46}%)`;
    arena.classList.toggle("hurt", pct < 55 && pct > 0);
    arena.classList.toggle("critical", pct <= 25 && pct > 0);
    if(use3d && window.Robot3D) window.Robot3D.setHealth(pct);
  }

  /* The shown value eases toward the server's number so the bar glides
     instead of stepping, and so several people hitting at once still
     converges on one truth. The loop stops when the gap closes. */
  function ease(){
    const diff = serverHp - shownHp;
    if(Math.abs(diff) < 0.15){
      shownHp = serverHp; paint(); rafId = null; return;
    }
    shownHp += diff * 0.2;
    paint();
    rafId = requestAnimationFrame(ease);
  }
  function nudge(){ if(rafId === null) rafId = requestAnimationFrame(ease); }

  /* ---- hit effects ---------------------------------------------------- */
  function floatHit(name, amount, nx, ny, mine){
    const rect = stage.getBoundingClientRect();
    const x = nx * rect.width;
    const y = ny * rect.height;

    const tag = document.createElement("span");
    tag.className = "robot-hit-tag" + (mine ? " mine" : "");
    tag.style.left = x + "px";
    tag.style.top = y + "px";
    tag.style.setProperty("--who-hue", hueFor(name));
    // A little sideways drift so simultaneous hits don't stack illegibly.
    tag.style.setProperty("--drift", ((Math.random()*40)-20).toFixed(0) + "px");
    tag.innerHTML = `<b>${esc(name)}</b><em>-${amount.toFixed(1)}%</em>`;
    fx.appendChild(tag);
    setTimeout(()=>tag.remove(), 1300);

    ring(x, y);
    sparks(x, y, 8);
  }

  /* A miss gets a small neutral ripple. Doing nothing at all is worse: the
     click clearly registered somewhere, and silence reads as a broken
     button rather than as "you missed". */
  function miss(x, y){
    const r = document.createElement("i");
    r.className = "robot-ring miss";
    r.style.left = x + "px";
    r.style.top = y + "px";
    fx.appendChild(r);
    setTimeout(()=>r.remove(), 520);
  }

  /* The flat SVG fallback has no geometry to raycast, so it uses the robot
     drawing's own bounding box — close enough for a shape that simple. */
  function hitFallback(px, py){
    const svg = fallbackBody.querySelector("svg");
    if(!svg) return true;
    const stageRect = stage.getBoundingClientRect();
    const b = svg.getBoundingClientRect();
    const x = stageRect.left + px, y = stageRect.top + py;
    return x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  }

  function ring(x, y){
    const r = document.createElement("i");
    r.className = "robot-ring";
    r.style.left = x + "px";
    r.style.top = y + "px";
    fx.appendChild(r);
    setTimeout(()=>r.remove(), 620);
  }

  function sparks(x, y, count){
    for(let i=0;i<count;i++){
      const s = document.createElement("i");
      s.className = "robot-spark";
      const angle = Math.random()*Math.PI*2;
      const dist = 26 + Math.random()*52;
      s.style.left = x + "px"; s.style.top = y + "px";
      s.style.setProperty("--dx", Math.cos(angle)*dist + "px");
      s.style.setProperty("--dy", Math.sin(angle)*dist + "px");
      s.style.animationDelay = (Math.random()*60) + "ms";
      fx.appendChild(s);
      setTimeout(()=>s.remove(), 800);
    }
  }

  function reactToHit(nx, ny, mine){
    /* Your own blow lands on your hand; everyone else's lands across the
       room. Playing every visitor's tap at full strength made a busy
       arena sound like hail. `mine` defaults to true so the local call
       sites that never passed it keep the loud clank. */
    if(mine === false) sfx.farHit(); else sfx.hit();
    if(use3d && window.Robot3D){
      window.Robot3D.hit(nx, ny);
    }else if(fallbackBody){
      fallbackBody.classList.remove("hit");
      void fallbackBody.offsetWidth;
      fallbackBody.classList.add("hit");
      clearTimeout(fallbackBody.__hitT);
      fallbackBody.__hitT = setTimeout(()=>fallbackBody.classList.remove("hit"), 280);
    }
  }

  function explode(){
    dead = true;
    arena.classList.add("dead");
    if(use3d && window.Robot3D) window.Robot3D.explode();
    else if(fallbackBody){ fallbackBody.classList.remove("hit"); fallbackBody.classList.add("exploding"); }
    const rect = stage.getBoundingClientRect();
    sparks(rect.width/2, rect.height/2, 28);
    respawnEl.hidden = false;
    clearTimeout(calmTimer);
    statusEl.textContent = "Destroyed";
    statusEl.classList.remove("live");
    // The captcha "passes" — this is the joke's payoff, and the moment the
    // chat composer unlocks.
    checkEl.classList.add("checked");
    captchaSub.textContent = "Verified — the chat is unlocked.";
    window.dispatchEvent(new Event("robot-destroyed"));
    sfx.boom();
  }

  function revive(){
    dead = false;
    arena.classList.remove("dead");
    if(use3d && window.Robot3D) window.Robot3D.revive();
    else if(fallbackBody){
      fallbackBody.classList.remove("exploding");
      fallbackBody.classList.add("reviving");
      setTimeout(()=>fallbackBody.classList.remove("reviving"), 900);
    }
    respawnEl.hidden = true;
    sfx.revive();
    statusEl.textContent = "Awaiting attack";
    statusEl.classList.remove("live");
    checkEl.classList.remove("checked");
    captchaSub.textContent = "Destroy me to unlock the chat.";
  }

  /* ---- server state --------------------------------------------------- */
  function applyState(state){
    const wasDead = dead;
    serverHp = state.hp;
    respawnAt = state.dead ? Date.now() + state.respawn_in*1000 : 0;

    killsEl.textContent = `${state.kills} destroyed`;
    lastHitEl.textContent = state.last_hit_by
      ? `last hit by ${state.last_hit_by} · ${state.total_hits} hits total`
      : (state.total_hits ? `${state.total_hits} hits total` : "Nobody has touched it yet.");

    if(state.dead && !wasDead){ shownHp = 0; explode(); }
    else if(!state.dead && wasDead){ shownHp = state.hp; revive(); }
    if(!state.dead) nudge();
    paint();
  }

  async function pollState(){
    try{
      const res = await fetch("/api/robot");
      if(res.ok) applyState(await res.json());
    }catch(e){/* keep the last known state */}
  }

  /* ---- the live feed --------------------------------------------------
     Every tap by anyone arrives here, including your own — your own tap is
     already showing locally, so it's matched by id and skipped rather than
     drawn twice. */
  const myOwnHits = new Set();

  function handleEvent(event){
    if(event.id) lastEventId = Math.max(lastEventId, event.id);

    if(event.type === "hit"){
      const mine = myOwnHits.has(event.id);
      if(mine) myOwnHits.delete(event.id);
      else {
        // Someone else's tap: play it exactly where they hit.
        floatHit(event.name, event.damage, event.x, event.y, false);
        reactToHit(event.x, event.y, false);     // someone else's
      }
      noteAttacker(event.name, event.damage);
      refreshBoard();
      serverHp = event.hp;
      killsEl.textContent = `${event.kills} destroyed`;
      lastHitEl.textContent = `last hit by ${event.name} · ${event.total_hits} hits total`;
      nudge();
    }

    if(event.type === "destroyed"){
      serverHp = 0; shownHp = 0;
      respawnAt = Date.now() + (event.respawn_in||10)*1000;
      if(!dead) explode();
      refreshBoard(500);
      killsEl.textContent = `${event.kills} destroyed`;
      paint();
    }
  }

  function openStream(){
    if(stream || typeof EventSource === "undefined") return false;
    try{
      stream = new EventSource(`/api/robot/stream?since=${lastEventId}`);
    }catch(e){ return false; }

    stream.onmessage = e=>{
      try{ handleEvent(JSON.parse(e.data)); }catch(err){}
    };
    stream.onerror = ()=>{
      // EventSource reconnects on its own, but if it's properly dead fall
      // back to polling the same event buffer so the feed keeps working.
      if(stream && stream.readyState === EventSource.CLOSED){
        stream = null;
        startPollFallback();
      }
    };
    return true;
  }

  function closeStream(){
    if(stream){ stream.close(); stream = null; }
  }

  function startPollFallback(){
    if(pollFallback) return;
    pollFallback = setInterval(async ()=>{
      if(!visible()) return;
      try{
        const res = await fetch(`/api/robot/events?since=${lastEventId}`);
        if(!res.ok) return;
        const data = await res.json();
        (data.events || []).forEach(handleEvent);
      }catch(e){}
    }, 900);
  }

  /* ---- tapping -------------------------------------------------------- */
  let pending = false;

  /* The arena is inert until a name exists. Applied as a class rather than
     `disabled` so the stage still takes the click — a disabled button
     swallows the event, and then nothing can explain why nothing happened. */
  function paintLock(){
    const ok = named();
    arena.classList.toggle("needs-name", !ok);
    if(nameGate) nameGate.hidden = ok;
    stage.setAttribute("aria-label", ok
      ? "Strike the robot to damage it"
      : "Enter your name first, then strike the robot");
  }

  function nudgeForName(){
    paintLock();
    if(nameGate){
      nameGate.classList.remove("shake");
      void nameGate.offsetWidth;         // restart the animation on a re-click
      nameGate.classList.add("shake");
    }
    const input = document.getElementById("chatNameInput");
    if(input && input.offsetParent) input.focus();
  }

  const nameGate = document.getElementById("robotNameGate");
  paintLock();
  // The chat module fires this the moment a name is claimed.
  window.addEventListener("chat-named", paintLock);

  async function hit(event){
    if(dead) return;
    if(!named()){
      // Not an error state — just a nudge back to step one.
      nudgeForName();
      return;
    }
    const rect = stage.getBoundingClientRect();
    const px = (event.clientX ?? rect.left + rect.width/2) - rect.left;
    const py = (event.clientY ?? rect.top + rect.height/2) - rect.top;
    const nx = Math.max(0, Math.min(1, px / rect.width));
    const ny = Math.max(0, Math.min(1, py / rect.height));

    /* Only a click that actually lands on the robot counts. The stage is a
       rectangle; the robot is a small figure in the middle of it, so most of
       that rectangle is empty air and hitting it used to do damage anyway.
       robot3d.js answers this with a raycast against the real geometry. */
    if(use3d && window.Robot3D && window.Robot3D.pick && !window.Robot3D.pick(nx, ny)){
      miss(px, py);
      return;
    }
    if(!use3d && fallbackBody && !hitFallback(px, py)) { miss(px, py); return; }

    // React immediately — the server's number lands a moment later.
    reactToHit(nx, ny);
    ring(px, py);

    if(pending) return;
    pending = true;
    try{
      const res = await fetch("/api/robot/hit", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({name: myName(), device_id: myDevice(), x: nx, y: ny})
      });
      if(!res.ok){
        // The claim lapsed (or was never made) — send them back to step one
        // rather than leaving a robot that visibly ignores them.
        if(res.status === 403) nudgeForName();
        return;
      }
      const state = await res.json();
      if(state.damage > 0){
        floatHit(myName(), state.damage, nx, ny, true);
        noteAttacker(myName(), state.damage);
        // Mark it so the same hit arriving over the stream isn't drawn twice.
        if(state.event_id) myOwnHits.add(state.event_id);
      }
      refreshBoard();
      applyState(state);
    }catch(e){/* dropped tap */}
    finally{ pending = false; }
  }

  stage.addEventListener("click", hit);
  stage.addEventListener("keydown", e=>{
    if(e.key===" " || e.key==="Enter"){ e.preventDefault(); hit(e); }
  });

  /* Respawn countdown, ticked locally so the number moves every second. */
  setInterval(()=>{
    if(!respawnAt) return;
    const left = Math.max(0, Math.ceil((respawnAt - Date.now())/1000));
    respawnCount.textContent = left;
    if(left === 0 && dead) pollState();
  }, 250);

  /* ---- lifecycle ------------------------------------------------------ */
  function visible(){
    const view = document.getElementById("chatView");
    return view && view.classList.contains("active") && !document.hidden;
  }

  function start(){
    if(!statePoll){
      pollState();
      statePoll = setInterval(()=>{ if(visible()) pollState(); }, STATE_POLL_MS);
    }
    if(visible() && !stream && !openStream()) startPollFallback();
    if(use3d && window.Robot3D) window.Robot3D.resize();
  }

  /* The 3D robot is only mounted when the Chat page is actually opened —
     no reason to spin up WebGL for someone who never visits it. */
  function ensure3d(){
    if(use3d || !host3d) return;
    if(window.Robot3D && window.Robot3D.mount(host3d)){
      use3d = true;
      if(fallbackBody) fallbackBody.hidden = true;
      window.Robot3D.setHealth(shownHp);
    }else{
      // No WebGL (old device, disabled, software renderer refused) — show
      // the flat robot instead of an empty box.
      if(fallbackBody) fallbackBody.hidden = false;
      arena.classList.add("no-3d");
    }
  }

  document.addEventListener("visibilitychange", ()=>{
    if(visible()){ ensure3d(); start(); pollState(); }
    else closeStream();
  });

  const stackNav = document.getElementById("stack");
  if(stackNav) stackNav.addEventListener("click", ()=>setTimeout(()=>{
    if(visible()){ ensure3d(); start(); pollState(); }
  }, 80));

  paint();
  if(visible()){ ensure3d(); start(); }
  else { pollState(); }   // so the HP is right the moment the page is opened
})();

/* ============================================================
   MEDIA LIGHTBOX
   Photos and videos enlarge here instead of navigating anywhere. This is
   the whole point: a picture or a video on a card is content, and tapping
   it should never hand the visitor off to an image host or to YouTube.
   Only a plain link (a repo, an article, a demo) leaves this site.
   ============================================================ */
(() => {
  let box = null, prevFocus = null;

  function build(){
    if(box) return box;
    box = document.createElement("div");
    box.className = "lightbox";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.innerHTML = `
      <button type="button" class="lightbox-close" aria-label="Close"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      <figure class="lightbox-figure"><div class="lightbox-slot"></div><figcaption class="lightbox-cap"></figcaption></figure>`;
    document.body.appendChild(box);

    box.querySelector(".lightbox-close").addEventListener("click", close);
    // Clicking the backdrop closes; clicking the media itself must not.
    box.addEventListener("click", e=>{ if(e.target === box) close(); });
    return box;
  }

  function open(type, src, title){
    build();
    const slot = box.querySelector(".lightbox-slot");
    slot.innerHTML = "";
    if(type === "image"){
      const img = document.createElement("img");
      img.src = src; img.alt = title || "";
      slot.appendChild(img);
    }else if(type === "video_file"){
      const v = document.createElement("video");
      v.src = src; v.controls = true; v.autoplay = true; v.playsInline = true;
      slot.appendChild(v);
    }else{
      const frame = document.createElement("iframe");
      frame.src = src;
      frame.title = title || "";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      slot.appendChild(frame);
    }
    box.querySelector(".lightbox-cap").textContent = title || "";
    prevFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add("lightbox-open");
    box.querySelector(".lightbox-close").focus();
  }

  function close(){
    if(!box || box.hidden) return;
    // Emptying the slot is what actually stops a playing video or embed;
    // hiding the dialog alone would leave the audio running.
    box.querySelector(".lightbox-slot").innerHTML = "";
    box.hidden = true;
    document.body.classList.remove("lightbox-open");
    if(prevFocus && prevFocus.focus) prevFocus.focus();
  }

  document.addEventListener("keydown", e=>{ if(e.key === "Escape") close(); });

  // Delegated, so it covers cards rendered later without re-wiring anything.
  document.addEventListener("click", e=>{
    const btn = e.target.closest(".media-zoom");
    if(!btn) return;
    e.preventDefault();
    open(btn.dataset.zoomType, btn.dataset.zoomSrc, btn.dataset.zoomTitle);
  });

  // Tapping the picture itself enlarges it too — but not the video element,
  // whose own click is play/pause.
  document.addEventListener("click", e=>{
    const img = e.target.closest(".cms-card-media > img");
    if(!img) return;
    const btn = img.parentElement.querySelector(".media-zoom");
    if(btn) open(btn.dataset.zoomType, btn.dataset.zoomSrc, btn.dataset.zoomTitle);
  });
})();

/* ============================================================
   MUSIC PLAYER
   A playlist of YouTube links, kept in the `music_playlist` setting and
   edited from the editor. The tracks play INSIDE this page.

   The YouTube IFrame API is what makes it a player rather than a row of
   embeds: it reports when a track ends, so the playlist can advance on its
   own, and it exposes play/pause so one set of controls drives every track.
   That API script is the one third-party file this site loads at runtime,
   and only on the Tools page — there is no way to play a YouTube video
   without YouTube. If it fails to load (offline, blocked), the player falls
   back to a plain embed per track: you lose auto-advance, not playback.
   ============================================================ */
(() => {
  const root = document.getElementById("music");
  if(!root) return;

  const frameHost  = document.getElementById("musicFrame");
  const idleEl     = document.getElementById("musicIdle");
  const listEl     = document.getElementById("musicList");
  const nowEl      = document.getElementById("musicNow");
  const playBtn    = document.getElementById("musicPlay");
  const prevBtn    = document.getElementById("musicPrev");
  const nextBtn    = document.getElementById("musicNext");
  const shuffleBtn = document.getElementById("musicShuffle");
  const loopBtn    = document.getElementById("musicLoop");

  let tracks = [];
  let index = -1;
  let player = null, apiReady = false, pendingId = null;
  let playing = false, shuffle = false, loop = false;

  function esc(str){
    return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  /* Accepts every shape a person actually pastes: a watch URL, a share
     link, a Shorts link, an embed URL, or the bare 11-character id. */
  function videoId(raw){
    const value = String(raw||"").trim();
    if(/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    const m = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function load(settings){
    let raw = [];
    try{ raw = JSON.parse(settings.music_playlist || "[]"); }catch(e){ raw = []; }
    if(!Array.isArray(raw)) raw = [];

    tracks = raw
      .map(t => ({ title: (t && t.title || "").trim(), id: videoId(t && t.url) }))
      .filter(t => t.id);          // a row with no usable link is simply skipped

    root.hidden = tracks.length === 0;
    if(!root.hidden) render();
  }

  function render(){
    listEl.innerHTML = tracks.map((t,i)=>`
      <li class="music-track${i===index?" active":""}" data-index="${i}">
        <button type="button">
          <span class="music-track-num">${i===index && playing ? '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>' : String(i+1).padStart(2,"0")}</span>
          <span class="music-track-title">${esc(t.title || "Track " + (i+1))}</span>
        </button>
      </li>`).join("");
    listEl.querySelectorAll(".music-track button").forEach(btn=>{
      btn.addEventListener("click", ()=>select(Number(btn.parentElement.dataset.index)));
    });
    nowEl.textContent = index >= 0 ? (tracks[index].title || `Track ${index+1}`) : "—";
    playBtn.innerHTML = playing
      ? '<i class="fa-solid fa-pause" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-play" aria-hidden="true"></i>';
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
    idleEl.hidden = index >= 0;
  }

  /* ---- the YouTube API ------------------------------------------------ */
  function ensureApi(){
    if(apiReady || window.__ytApiLoading) return;
    if(window.YT && window.YT.Player){ apiReady = true; return; }
    window.__ytApiLoading = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = ()=>{
      apiReady = true;
      if(typeof prev === "function") prev();
      if(pendingId !== null){ const id = pendingId; pendingId = null; start(id); }
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.onerror = ()=>{ window.__ytApiLoading = false; fallback(); };
    document.head.appendChild(tag);
  }

  /* No API — drop in a plain embed so the track still plays. Auto-advance
     is what's lost, so the controls that depend on it are disabled rather
     than left looking broken. */
  function fallback(){
    if(index < 0) return;
    frameHost.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${esc(tracks[index].id)}?autoplay=1&rel=0&modestbranding=1"
      title="${esc(tracks[index].title || "Track")}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    playing = true;
    playBtn.disabled = true;
    render();
  }

  function start(id){
    if(!apiReady){ pendingId = id; ensureApi(); return; }
    if(player && player.loadVideoById){ player.loadVideoById(id); return; }
    frameHost.innerHTML = "<div id='musicYt'></div>";
    player = new YT.Player("musicYt", {
      videoId: id,
      playerVars: {autoplay:1, rel:0, modestbranding:1, playsinline:1},
      events: {
        onReady: e=>{ e.target.playVideo(); },
        onStateChange: e=>{
          if(e.data === YT.PlayerState.PLAYING){ playing = true; render(); }
          if(e.data === YT.PlayerState.PAUSED){ playing = false; render(); }
          if(e.data === YT.PlayerState.ENDED) advance(1, true);
        },
        onError: ()=>advance(1, true)     // a dead or blocked video shouldn't stall the queue
      }
    });
  }

  function select(i){
    if(i < 0 || i >= tracks.length) return;
    index = i;
    playing = true;
    render();
    start(tracks[i].id);
  }

  /* `auto` distinguishes a track ending on its own from someone pressing
     next: repeat-one only replays on its own, and shuffle only jumps on its
     own, so the buttons still do the obvious thing when pressed. */
  function advance(step, auto){
    if(!tracks.length) return;
    if(auto && loop){ select(index); return; }
    if(auto && shuffle && tracks.length > 1){
      let next;
      do { next = Math.floor(Math.random()*tracks.length); } while(next === index);
      select(next);
      return;
    }
    select((index + step + tracks.length) % tracks.length);
  }

  playBtn.addEventListener("click", ()=>{
    if(index < 0){ select(0); return; }
    if(!player){ start(tracks[index].id); return; }
    if(playing && player.pauseVideo) player.pauseVideo();
    else if(player.playVideo) player.playVideo();
  });
  prevBtn.addEventListener("click", ()=>{ if(index < 0) select(0); else advance(-1, false); });
  nextBtn.addEventListener("click", ()=>{ if(index < 0) select(0); else advance(1, false); });
  shuffleBtn.addEventListener("click", ()=>{
    shuffle = !shuffle;
    shuffleBtn.classList.toggle("on", shuffle);
    shuffleBtn.setAttribute("aria-pressed", String(shuffle));
  });
  loopBtn.addEventListener("click", ()=>{
    loop = !loop;
    loopBtn.classList.toggle("on", loop);
    loopBtn.setAttribute("aria-pressed", String(loop));
  });

  /* Leaving the Tools page pauses the music rather than letting it play on
     invisibly under the chat. */
  const stack = document.getElementById("stack");
  if(stack){
    stack.addEventListener("click", ()=>setTimeout(()=>{
      const view = document.getElementById("toolsView");
      if(view && !view.classList.contains("active") && player && player.pauseVideo) player.pauseVideo();
    }, 80));
  }

  window.MusicPlayer = { load };
  // If settings arrived before this module was parsed, use them now.
  if(window.__settings) load(window.__settings);
})();

/* ============================================================
   THE ROBOT'S VOICE
   UNIT-01 reads new chat messages aloud. It only ever speaks messages that
   arrive while you are watching — the backlog you get on opening the page
   is not read out, because arriving to twenty queued messages being recited
   at you is the same mistake the hit-sound backlog was.
   ============================================================ */
(() => {
  const log = document.getElementById("chatLog");
  const toggle = document.getElementById("chatVoice");
  if(!log || !toggle) return;

  const KEY = "portfolio-chat-voice";
  let on = true;
  try{ on = localStorage.getItem(KEY) !== "off"; }catch(e){}

  /* Seeded by the chat module the first time it renders, so the messages
     already on screen count as "seen" and are never spoken. */
  const spoken = new Set();
  let seeded = false;

  function paint(){
    toggle.classList.toggle("off", !on);
    toggle.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("aria-label", on ? "Turn the robot's voice off" : "Turn the robot's voice on");
    toggle.innerHTML = on
      ? '<i class="fa-solid fa-comment-dots" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-comment-slash" aria-hidden="true"></i>';
  }

  toggle.addEventListener("click", ()=>{
    on = !on;
    try{ localStorage.setItem(KEY, on ? "on" : "off"); }catch(e){}
    if(!on && window.Speech) window.Speech.stop();
    paint();
  });

  if(!window.Speech || !window.Speech.supported){
    toggle.hidden = true;                 // no engine on this device
    return;
  }
  paint();

  /* Called by the chat module for every message it renders. */
  window.RobotVoice = {
    announce(messages){
      if(!Array.isArray(messages)) return;
      if(!seeded){
        messages.forEach(m => spoken.add(m.id));
        seeded = true;
        return;
      }
      const fresh = messages.filter(m => !spoken.has(m.id));
      fresh.forEach(m => spoken.add(m.id));
      if(!on || !fresh.length) return;
      /* The master switch outranks this one. Reading arriving messages
         aloud is something the page does at you, unasked, once per
         message — which is exactly what "mute" is for. The chat's own
         voice button stays as the finer control for someone who wants
         interface sounds but not narration; muting everything silences
         both. Messages are still marked as spoken above, so un-muting
         does not trigger a backlog of everything missed. */
      if(window.SFX && window.SFX.muted) return;

      // Read at most the last few, so a burst doesn't become a monologue.
      fresh.slice(-3).forEach(m=>{
        window.Speech.robot(`${m.name} says. ${m.body}`);
      });

      // The set is per-session and only holds ids; trim it anyway so a tab
      // left open for a day doesn't accumulate forever.
      if(spoken.size > 400){
        const keep = new Set(messages.map(m=>m.id));
        spoken.forEach(id => { if(!keep.has(id)) spoken.delete(id); });
      }
    }
  };
})();


/* ============================================================
   TERMINAL READ-ALOUD
   Speaks the lines in the terminal body. Same engine as the robot, so
   pressing it stops whatever the robot was saying rather than talking over
   it — one voice at a time is the whole reason Speech is shared.
   ============================================================ */
(() => {
  const btn = document.getElementById("termSpeak");
  const body = document.querySelector(".terminal-body");
  if(!btn || !body) return;

  if(!window.Speech || !window.Speech.supported){
    btn.hidden = true;
    return;
  }

  /* Two states, and only two: a speaker at rest, and a live equaliser while
     it is reading. A stop square was the obvious thing to show and the wrong
     one — the button's job in that moment is to tell you something IS being
     said, which a static square doesn't. Bars that move do, and clicking
     still stops it. */
  function idle(spoke){
    btn.classList.remove("speaking");
    btn.innerHTML = '<i class="fa-solid fa-volume-high" aria-hidden="true"></i>';
    btn.setAttribute("aria-label", "Read this terminal aloud");
    btn.setAttribute("title", "Read aloud");
    /* If the browser's speech engine took the text and never spoke, say so.
       Silently returning to rest is indistinguishable from a broken button,
       and this is the one failure the page genuinely cannot fix — no voice
       installed, or an engine that has wedged. */
    if(spoke === false){
      btn.classList.add("failed");
      btn.setAttribute("title", "Your browser's speech engine didn't respond");
      clearTimeout(btn.__failT);
      btn.__failT = setTimeout(()=>{
        btn.classList.remove("failed");
        btn.setAttribute("title", "Read aloud");
      }, 3000);
    }
  }
  function busy(){
    btn.classList.add("speaking");
    btn.innerHTML = '<span class="term-eq" aria-hidden="true"><i></i><i></i><i></i></span>';
    btn.setAttribute("aria-label", "Reading aloud — click to stop");
    btn.setAttribute("title", "Reading aloud — click to stop");
  }

  btn.addEventListener("click", ()=>{
    if(window.Speech.speaking){
      window.Speech.stop();
      idle();
      return;
    }
    // The line-number spans would be read as "zero one, zero two…", so only
    // the text spans are collected.
    const text = Array.from(body.querySelectorAll(".line"))
      .map(line => Array.from(line.querySelectorAll("span")).slice(1).map(s=>s.textContent).join(" "))
      .filter(t => t.trim())
      .join(". ");
    if(!text.trim()) return;
    busy();
    /* Driven by the queue draining, not by polling `speaking`. The poll used
       to catch the gap between two chunks and reset the button a second in,
       while the voice kept going. */
    const queued = window.Speech.plain(text, true, idle);
    if(!queued){
      idle();
      return;
    }
    /* A last-resort guard on this side too. Speech.plain() has its own
       watchdog, but if the whole module were ever swapped out or wedged, a
       button stuck on "playing" is worse than one that gives up. */
    clearTimeout(btn.__fallback);
    btn.__fallback = setTimeout(()=>{
      if(btn.classList.contains("speaking") && !window.Speech.speaking) idle();
    }, 2500);
  });
})();

/* ============================================================
   MASTER DISCOVERIES
   A set of practice notes on the Tools page, edited from Site settings.
   Read-only on the site — these are notes, not links, so nothing here
   navigates anywhere.
   ============================================================ */
(() => {
  const root = document.getElementById("discoveries");
  const host = document.getElementById("discList");
  if(!root || !host) return;

  function esc(str){
    return String(str==null?"":str).replace(/[&<>"']/g, ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  }

  function load(settings){
    let rows = [];
    try{ rows = JSON.parse(settings.discoveries || "[]"); }catch(e){ rows = []; }
    if(!Array.isArray(rows)) rows = [];
    rows = rows.filter(r => r && (r.title || r.body));

    root.hidden = rows.length === 0;
    if(root.hidden) return;

    host.innerHTML = rows.map((r,i)=>`
      <article class="disc-card">
        <div class="disc-card-top">
          <span class="disc-num">${String(i+1).padStart(2,"0")}</span>
          ${r.tag ? `<span class="disc-tag">${esc(r.tag)}</span>` : ""}
        </div>
        <h4>${esc(r.title || "Untitled")}</h4>
        ${r.context ? `<p class="disc-context">${esc(r.context)}</p>` : ""}
        ${r.body ? `<p class="disc-body">${esc(r.body)}</p>` : ""}
      </article>`).join("");
  }

  window.Discoveries = { load };
  if(window.__settings) load(window.__settings);
})();
