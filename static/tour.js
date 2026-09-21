/* ============================================================
   THE GUIDED TOUR
   ------------------------------------------------------------
   A step-by-step walkthrough: spotlight one control, explain it, move on.

   The engine is data-driven, so the portfolio and the editor share it and
   differ only in their list of steps. A step is:

     { target, title, body, before, arrow, optional }

   `target` is a CSS selector, or null for a step that addresses the whole
   page. `before` runs first and may return a promise — that is how a step
   that lives on another view switches to it and waits for the transition
   before the spotlight tries to find anything.

   Two rules keep it from being annoying, which is the failure mode of
   every product tour ever shipped:

     - A step whose target is not on the page is SKIPPED, not shown ringing
       empty space. The resume button is hidden until a CV is uploaded; the
       chat composer does not exist until you have a name. Neither should
       produce a step about a control the visitor cannot see.
     - The spotlight does not block clicks. The control being described
       stays usable, so the tour can be read while actually doing the thing.

   It is never shown uninvited. The help button pulses until the tour has
   been taken once; starting it is always the visitor's decision.
   ============================================================ */
(function () {
  "use strict";

  var SEEN_KEY = "portfolio-tour-seen";
  var PAD = 8;              // breathing room around a spotlit element
  var CARD_GAP = 14;        // between the ring and the card

  var overlay, spot, card, steps = [], index = 0, open = false, lastFocus = null;

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) === "1"; } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, "1"); } catch (e) {}
    document.querySelectorAll(".help-btn.unseen").forEach(function (b) {
      b.classList.remove("unseen");
    });
  }

  function sfx(name) {
    try { if (window.SFX && typeof window.SFX[name] === "function") window.SFX[name](); }
    catch (e) {}
  }

  function build() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "tourOverlay";
    overlay.innerHTML =
      '<div id="tourSpot"></div>' +
      '<div id="tourCard" role="dialog" aria-modal="false" aria-labelledby="tourTitle">' +
        '<span class="tour-step-count" id="tourCount"></span>' +
        '<h3 id="tourTitle"></h3>' +
        '<p id="tourBody"></p>' +
        '<div class="tour-pips" id="tourPips" aria-hidden="true"></div>' +
        '<div class="tour-actions">' +
          '<button type="button" class="ghost" id="tourSkip">Skip</button>' +
          '<span class="tour-spacer"></span>' +
          '<button type="button" id="tourBack">Back</button>' +
          '<button type="button" class="primary" id="tourNext">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    spot = overlay.querySelector("#tourSpot");
    card = overlay.querySelector("#tourCard");

    overlay.querySelector("#tourSkip").addEventListener("click", function () { stop(true); });
    overlay.querySelector("#tourBack").addEventListener("click", function () { go(index - 1); });
    overlay.querySelector("#tourNext").addEventListener("click", function () { go(index + 1); });

    /* The overlay itself is a backdrop: clicking the dimmed area leaves.
       Clicks on the card must not, hence the target check. */
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) stop(true);
    });

    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, { passive: true });
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); stop(true); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(index + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(index - 1); }
    else if (e.key === "Enter" && document.activeElement &&
             document.activeElement.closest && document.activeElement.closest("#tourCard")) {
      /* Enter on a focused tour button is that button's job, not ours. */
      return;
    }
  }

  /* An element counts as present only if it is actually rendered. A hidden
     resume button has a bounding box of 0x0, and ringing that is worse than
     skipping the step. */
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    var s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
  }

  function find(step) {
    if (!step || !step.target) return null;
    var el = document.querySelector(step.target);
    return visible(el) ? el : null;
  }

  function reposition() {
    if (!open) return;
    var step = steps[index];
    var el = find(step);
    if (!el) { placeCentred(); return; }

    var r = el.getBoundingClientRect();
    var top = Math.max(4, r.top - PAD);
    var left = Math.max(4, r.left - PAD);
    var w = Math.min(window.innerWidth - left - 4, r.width + PAD * 2);
    var h = Math.min(window.innerHeight - top - 4, r.height + PAD * 2);

    spot.classList.remove("no-target");
    spot.style.top = top + "px";
    spot.style.left = left + "px";
    spot.style.width = w + "px";
    spot.style.height = h + "px";
    spot.style.borderRadius = (getComputedStyle(el).borderRadius === "50%" ? "50%" : "14px");

    placeCard(top, left, w, h, step);
  }

  function placeCentred() {
    spot.classList.add("no-target");
    spot.style.width = spot.style.height = "0px";
    card.removeAttribute("data-arrow");
    var cr = card.getBoundingClientRect();
    card.style.top = Math.max(12, (window.innerHeight - cr.height) / 2) + "px";
    card.style.left = Math.max(12, (window.innerWidth - cr.width) / 2) + "px";
  }

  /* Put the card wherever there is room, preferring below the target, then
     above, then to the side. Whatever is chosen, it is then clamped inside
     the viewport — a card that is beautifully placed and half off-screen
     has still failed. */
  function placeCard(top, left, w, h, step) {
    var cr = card.getBoundingClientRect();
    var cw = cr.width, ch = cr.height;
    var vw = window.innerWidth, vh = window.innerHeight;
    var t, l, arrow;

    if (window.innerWidth <= 720) {
      /* On a phone there is no "beside": put it under the target, or over
         it when the target sits low on the screen. */
      arrow = (top + h + CARD_GAP + ch < vh) ? "up" : "down";
      t = arrow === "up" ? top + h + CARD_GAP : top - ch - CARD_GAP;
      l = 12;
    } else if (top + h + CARD_GAP + ch < vh) {
      arrow = "up";   t = top + h + CARD_GAP; l = left;
    } else if (top - CARD_GAP - ch > 0) {
      arrow = "down"; t = top - ch - CARD_GAP; l = left;
    } else if (left + w + CARD_GAP + cw < vw) {
      arrow = "left"; l = left + w + CARD_GAP; t = top;
    } else {
      arrow = "right"; l = Math.max(12, left - cw - CARD_GAP); t = top;
    }

    if (step && step.arrow === false) arrow = null;
    t = Math.max(12, Math.min(t, vh - ch - 12));
    l = Math.max(12, Math.min(l, vw - cw - 12));

    if (arrow) card.setAttribute("data-arrow", arrow); else card.removeAttribute("data-arrow");
    card.style.top = t + "px";
    card.style.left = l + "px";
  }

  function pips() {
    var wrap = overlay.querySelector("#tourPips");
    wrap.innerHTML = "";
    for (var i = 0; i < steps.length; i++) {
      var pip = document.createElement("i");
      if (i < index) pip.className = "done";
      else if (i === index) pip.className = "now";
      wrap.appendChild(pip);
    }
  }

  function paint(step) {
    overlay.querySelector("#tourCount").textContent =
      "Step " + (index + 1) + " of " + steps.length;
    overlay.querySelector("#tourTitle").textContent = step.title;
    overlay.querySelector("#tourBody").innerHTML = step.body;
    overlay.querySelector("#tourBack").style.visibility = index === 0 ? "hidden" : "visible";
    overlay.querySelector("#tourNext").textContent =
      index === steps.length - 1 ? "Done" : "Next";
    pips();
  }

  function go(next) {
    if (next < 0) return;
    if (next >= steps.length) { stop(false); return; }

    /* Skip forward (or backward, matching the direction of travel) over any
       step whose control is not on this page right now. */
    var dir = next >= index ? 1 : -1;
    var i = next;
    while (i >= 0 && i < steps.length) {
      var s = steps[i];
      if (!s.target || !s.optional) break;
      if (document.querySelector(s.target)) break;
      i += dir;
    }
    if (i < 0) return;
    if (i >= steps.length) { stop(false); return; }

    index = i;
    var step = steps[index];
    sfx("tap");

    /* Paint the words BEFORE running any navigation.
       A step that switches view waits for the transition to settle before
       it can measure where to put the spotlight — and while it waited, the
       card was still showing the previous step's title. So for about half a
       second the tour described Tools while the page had already moved to
       the chat. Text first, geometry after: the card is never out of step
       with itself, and only the ring has to catch up. */
    paint(step);

    Promise.resolve(step.before ? step.before() : null)
      .catch(function () {})
      .then(function () {
        // Give a view switch a frame to settle before measuring anything.
        return new Promise(function (r) { setTimeout(r, step.before ? 420 : 20); });
      })
      .then(function () {
        if (!open) return;
        var el = find(step);

        /* An optional step whose control never appeared is dropped rather
           than shown pointing at nothing. */
        if (!el && step.target && step.optional) { go(index + dir); return; }

        if (el) {
          var r = el.getBoundingClientRect();
          if (r.top < 60 || r.bottom > window.innerHeight - 60) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }

        setTimeout(reposition, el ? 260 : 0);
        reposition();
        overlay.querySelector("#tourNext").focus({ preventScroll: true });
      });
  }

  function start(list) {
    if (open) return;
    build();
    steps = (list || []).filter(Boolean);
    if (!steps.length) return;
    lastFocus = document.activeElement;
    index = 0;
    open = true;
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    sfx("open");
    go(0);
  }

  function stop(early) {
    if (!open) return;
    open = false;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    markSeen();
    sfx(early ? "close" : "victory");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  window.PortfolioTour = {
    start: start,
    stop: stop,
    seen: seen,
    get isOpen() { return open; }
  };
})();
