/* ============================================================
   EDITOR SOUND — the editor's own voices
   ------------------------------------------------------------
   sfx.js makes the noises and uisound.js already covers everything
   generic: presses, hovers, keyboard activation, typing. Both are loaded
   on this page now, so the editor gets all of that for free.

   What is left is the handful of events that only exist here — a save
   landing, an upload finishing, a deletion, a failed key — and those are
   worth hearing because they all happen at the END of something you asked
   for, when your eyes may well be somewhere else on the form.

   Everything is wired by OBSERVING the interface rather than by editing
   the twenty-odd call sites that produce these outcomes. The editor
   reports what it did by writing into a status line and by showing or
   hiding panels; watching those means a new save path added later is
   covered the day it is written, and no existing function had to grow a
   line of audio bookkeeping.
   ============================================================ */
(function () {
  "use strict";

  var S = window.SFX;
  if (!S) return;

  /* ---- 0. the quiet period -------------------------------------------
     Every observer below watches the interface for evidence that
     something happened. The trap is that RENDERING also changes the
     interface: opening the Settings tab fills three lists and writes two
     status lines, and without this the editor announced five events the
     user never caused — two saves and three rows added, just for clicking
     a tab.

     So there is a window after any render during which the observers stay
     silent. A person cannot save, add a row and delete something inside
     900ms of switching tabs; the browser can paint all of it in 20. The
     gap between those two numbers is what separates a real action from a
     repaint, and it is the only reliable signal available from out here. */
  var quietUntil = Date.now() + 1500;          // the initial page render
  function quiet() { return Date.now() < quietUntil; }
  function hush(ms) { quietUntil = Math.max(quietUntil, Date.now() + (ms || 900)); }

  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t instanceof Element && t.closest(".editor-tab")) hush(900);
  }, true);

  /* ---- 1. the status line -------------------------------------------
     Every save, upload and removal ends by writing a sentence here. The
     `error` class is how the editor already distinguishes a failure from
     a success, so it is also how the sound does.

     "Saving…" is deliberately silent: it is the START of an operation, and
     the press that began it has already made a noise. Sounding it too
     would put two sounds on one action. */
  function watchStatus(id) {
    var el = document.getElementById(id);
    if (!el) return;
    var last = "";
    new MutationObserver(function () {
      var text = (el.textContent || "").trim();
      if (!text || text === last) return;
      last = text;
      if (quiet()) return;                                        // a repaint
      if (/…$|^Saving|^Uploading|^Loading/i.test(text)) return;   // in progress
      if (el.classList.contains("error") || /^(Couldn't|Could not|Failed|Error)/i.test(text)) S.error();
      else S.save();
    }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  }

  ["settingsStatus", "faviconState", "resumeState"].forEach(watchStatus);

  /* ---- 2. getting in, and being turned away --------------------------
     Unlocking the editor is the one moment here that genuinely deserves
     its own sound: it happens once, and until it happens nothing else on
     the page works. */
  var gate = document.getElementById("loginGate");
  if (gate) {
    var wasOpen = !gate.hidden;
    new MutationObserver(function () {
      var nowOpen = !gate.hidden;
      if (nowOpen === wasOpen) return;
      wasOpen = nowOpen;
      if (!nowOpen) { hush(1600); S.join(); }   // unlocked: the editor now fills
    }).observe(gate, { attributes: true, attributeFilter: ["hidden"] });
  }

  var loginError = document.getElementById("loginError");
  if (loginError) {
    var wasHidden = loginError.hidden;
    new MutationObserver(function () {
      if (loginError.hidden === wasHidden) return;
      wasHidden = loginError.hidden;
      if (!wasHidden) S.error();       // wrong key
    }).observe(loginError, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* ---- 3. switching between the editor's panes -----------------------
     The same voice the public site uses when a section arrives, so the two
     halves of the project sound like one thing. */
  var tabs = document.querySelectorAll(".editor-tab");
  if (tabs.length) {
    var active = document.querySelector(".editor-tab.active");
    new MutationObserver(function () {
      var now = document.querySelector(".editor-tab.active");
      if (now === active) return;
      active = now;
      S.reveal();
    }).observe(document.querySelector(".editor-tabs") || document.body,
               { attributes: true, subtree: true, attributeFilter: ["class"] });
  }

  /* ---- 4. destructive presses ----------------------------------------
     A delete should not sound like a save. This fires on the press rather
     than on the result, because the confirm() dialog that follows blocks
     the thread — a sound queued after it would arrive long after the
     decision was made, which reads as lag rather than as feedback. */
  document.addEventListener("pointerdown", function (e) {
    if (!e.isTrusted) return;
    var t = e.target;
    if (!(t instanceof Element)) return;
    var el = t.closest(".danger, [data-clear], .row-remove, .item-delete");
    if (el && !el.disabled) S.error();
  }, true);

  /* ---- 5. rows appearing and disappearing ----------------------------
     Adding a social link, a discovery or a track builds a row; removing
     one takes it away. Both are structural edits with no status line of
     their own, so the list itself is what gets watched. */
  ["socialList", "discRowList", "musicRowList", "categoriesList", "chatModList"].forEach(function (id) {
    var list = document.getElementById(id);
    if (!list) return;
    var count = list.children.length;
    new MutationObserver(function () {
      var n = list.children.length;
      var grew = n > count, shrank = n < count;
      var wasEmpty = count === 0;
      count = n;
      if (quiet()) return;              // a repaint, not an edit
      /* Growing from nothing is a list being POPULATED — a pane opening,
         a fetch landing. Adding a row to a list that already had rows is
         the only growth a person can cause. */
      if (grew && wasEmpty) return;
      if (grew) S.open();
      else if (shrank) S.close();
    }).observe(list, { childList: true });
  });

  /* ---- 6. the master switch — deliberately NOT wired here -------------
     uisound.js already owns #soundToggle, and it is loaded on this page
     too. Wiring it a second time here meant one press called toggle()
     twice: muted, then immediately unmuted, so the button looked dead.
     It flipped exactly as far as it flipped back.

     Nothing to add — the handler in uisound.js paints the icon, stores
     the preference and fires `sfx-mute`, all of which work unchanged on
     the editor. This note exists so the block does not get helpfully
     re-added. */

})();
