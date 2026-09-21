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

   A step may also require the visitor to DO the thing rather than read
   about it. `action` describes what to wait for; the Next button is
   replaced by a live "try it" prompt, and the step only advances once the
   thing has actually happened. Watching for the real event is the point —
   the tour cannot be clicked through without learning anything, and it
   cannot claim you did something you did not do.

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

  var overlay, spot, card, steps = [], index = 0, open = false, lastFocus = null, armed = null, onEnd = null, trackId = null, rafId = null;

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

  /* ---- what a step can wait for --------------------------------------
     Each returns an `arm(done)` that starts listening and hands back a
     teardown. They are deliberately built on the site's OWN events and
     state rather than on the tour simulating anything: `portfolio-section-
     change` fires because the router ran, `robot-hp` because the server
     answered. If the tour says you opened Projects, you opened Projects.

     A poll is the fallback for state with no event behind it. 220ms is
     below the threshold where a person notices a delay and far above the
     cost of a class check. */
  var watch = {
    click: function (sel) {
      return function (done) {
        var fn = function (e) {
          var t = e.target;
          if (t instanceof Element && t.closest(sel)) done();
        };
        document.addEventListener("click", fn, true);
        return function () { document.removeEventListener("click", fn, true); };
      };
    },
    event: function (name, test) {
      return function (done) {
        var fn = function (e) { if (!test || test(e)) done(); };
        window.addEventListener(name, fn);
        return function () { window.removeEventListener(name, fn); };
      };
    },
    condition: function (fn) {
      return function (done) {
        if (fn()) { done(); return function () {}; }
        var id = setInterval(function () { if (fn()) done(); }, 220);
        return function () { clearInterval(id); };
      };
    },
    hasClass: function (sel, cls) {
      return watch.condition(function () {
        var el = document.querySelector(sel);
        return !!el && el.classList.contains(cls);
      });
    },
    section: function (id) {
      return watch.event("portfolio-section-change", function (e) {
        return e && e.detail && e.detail.id === id;
      });
    }
  };

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
        '<div class="tour-try" id="tourTry" hidden>' +
          '<span class="tour-try-mark" aria-hidden="true"></span>' +
          '<span class="tour-try-text" id="tourTryText"></span>' +
        '</div>' +
        '<div class="tour-pips" id="tourPips" aria-hidden="true"></div>' +
        '<div class="tour-actions">' +
          '<button type="button" class="ghost" id="tourSkip">Skip</button>' +
          '<span class="tour-spacer"></span>' +
          '<button type="button" class="ghost" id="tourSkipStep" hidden>Skip this step</button>' +
          '<button type="button" id="tourBack">Back</button>' +
          '<button type="button" class="primary" id="tourNext">Next</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    spot = overlay.querySelector("#tourSpot");
    card = overlay.querySelector("#tourCard");

    overlay.querySelector("#tourSkip").addEventListener("click", function () { stop(true); });
    overlay.querySelector("#tourBack").addEventListener("click", function () { go(index - 1); });
    overlay.querySelector("#tourSkipStep").addEventListener("click", function () { go(index + 1); });
    overlay.querySelector("#tourNext").addEventListener("click", function () { go(index + 1); });

    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, { passive: true });
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === "Escape") { e.preventDefault(); stop(true); }
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      /* On a task step the arrow key would be a way of clicking past the
         thing the step exists to teach. Back still works. */
      if (!steps[index] || !steps[index].action) go(index + 1);
    }
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
    /* A step may name something else the card must stay clear of, beyond
       the control itself. The navigation rail is the reason: its section
       buttons only exist while it is hovered, so a card lying across it
       hides the very things a step like "open Projects from the rail" is
       asking you to click. Avoiding the whole rail costs nothing on a wide
       screen and is the difference between a workable step and a dead end. */
    if (step && step.avoid) {
      var av = document.querySelector(step.avoid);
      if (av) {
        var ar = av.getBoundingClientRect();
        if (ar.width > 2 && ar.height > 2) {
          var r1 = Math.min(top, ar.top - PAD), c1 = Math.min(left, ar.left - PAD);
          var r2 = Math.max(top + h, ar.bottom + PAD), c2 = Math.max(left + w, ar.right + PAD);
          top = Math.max(0, r1); left = Math.max(0, c1);
          h = r2 - top; w = c2 - left;
        }
      }
    }
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

    /* The card must never sit on top of the thing the step is asking you
       to press. It can happen even after choosing a side: a tall target
       like the navigation rail leaves no room above or below, and the
       clamp that keeps the card on screen can push it straight back over
       the control.

       So the placement is checked, and if it still overlaps the spotlight
       the card is moved to whichever side of the target has the most free
       space. On a task step this is not cosmetic — a covered control is a
       task that cannot be completed. */
    var overlaps = !(l + cw < left || l > left + w || t + ch < top || t > top + h);
    if (overlaps) {
      var room = { right: vw - (left + w), left: left, below: vh - (top + h), above: top };
      var best = Object.keys(room).reduce(function (a, b) { return room[a] >= room[b] ? a : b; });
      if (best === "right")      { l = Math.min(left + w + CARD_GAP, vw - cw - 12); arrow = "left"; }
      else if (best === "left")  { l = Math.max(12, left - cw - CARD_GAP);          arrow = "right"; }
      else if (best === "below") { t = Math.min(top + h + CARD_GAP, vh - ch - 12);  arrow = "up"; }
      else                       { t = Math.max(12, top - ch - CARD_GAP);           arrow = "down"; }
      t = Math.max(12, Math.min(t, vh - ch - 12));
      l = Math.max(12, Math.min(l, vw - cw - 12));
    }

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

  /* ---- keep the spotlight on its target -------------------------------
     A one-off measurement is not enough, and the navigation rail is the
     proof. Opening it animates the tools in over 300ms; then HOVERING it
     expands five section buttons from zero to sixty pixels each, which
     shoves the theme dial 258px down the screen. Anything measured before
     that is pointing at where the control used to be — and on a task step
     that means the card ends up sitting on the very button the step is
     asking you to press.

     Nothing announces these moves. The rail does not fire an event, the
     expansion is pure CSS driven by the cursor, and a transitionend would
     miss the hover case entirely. So the target's rectangle is simply
     re-read four times a second for as long as the step is on screen, and
     the tour moves if it has shifted. A getBoundingClientRect on one
     element at 4Hz is nothing; being wrong about where the button is is
     the difference between a tour that works and one that cannot be
     completed. */
  function track() {
    untrack();
    var last = null;
    var started = performance.now();

    function moved(now) {
      if (!!now !== !!last) return true;
      if (!now || !last) return false;
      return Math.abs(now.top - last.top) > 1 || Math.abs(now.left - last.left) > 1 ||
             Math.abs(now.width - last.width) > 1 || Math.abs(now.height - last.height) > 1;
    }
    function check() {
      if (!open) { untrack(); return false; }
      var el = find(steps[index]);
      var now = el ? el.getBoundingClientRect() : null;
      var did = moved(now);
      last = now;
      if (did) reposition();
      return true;
    }

    /* Every frame for the first second and a half, then four times a
       second. The opening seconds are when everything is in flight — the
       rail animating, a section fading in, the cursor arriving and
       expanding five buttons — and a 250ms poll is slow enough there that
       the card can be drawn over a control that has already moved. After
       the layout settles, per-frame measurement is pure waste. */
    function frame() {
      if (!check()) return;
      if (performance.now() - started < 1500) rafId = requestAnimationFrame(frame);
      else trackId = setInterval(check, 250);
    }
    rafId = requestAnimationFrame(frame);
  }
  function untrack() {
    if (trackId) { clearInterval(trackId); trackId = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function paint(step) {
    overlay.querySelector("#tourCount").textContent =
      "Step " + (index + 1) + " of " + steps.length;
    overlay.querySelector("#tourTitle").textContent = step.title;
    overlay.querySelector("#tourBody").innerHTML = step.body;
    overlay.querySelector("#tourBack").style.visibility = index === 0 ? "hidden" : "visible";
    pips();

    var next = overlay.querySelector("#tourNext");
    var tryStrip = overlay.querySelector("#tourTry");
    var skipStep = overlay.querySelector("#tourSkipStep");

    if (step.action) {
      /* A task, not a caption. There is no Next to press — the step is
         finished by doing the thing, and the only way past it without
         doing it is the explicit escape hatch, which exists because a
         control can always be broken, unreachable on this device, or
         already in the state being asked for. */
      next.hidden = true;
      skipStep.hidden = false;
      tryStrip.hidden = false;
      tryStrip.classList.remove("done");
      overlay.querySelector("#tourTryText").innerHTML = step.action.hint;
      card.setAttribute("data-task", "");
    } else {
      next.hidden = false;
      next.textContent = index === steps.length - 1 ? "Done" : "Next";
      skipStep.hidden = true;
      tryStrip.hidden = true;
      card.removeAttribute("data-task");
    }
  }

  /* Whatever the current step was listening for, stop listening. Called on
     every move and on exit, so a watcher can never outlive its step and
     advance a tour that has gone somewhere else. */
  function disarm() {
    if (armed) { try { armed(); } catch (e) {} armed = null; }
  }

  function armStep(step) {
    disarm();
    if (!step.action || typeof step.action.arm !== "function") return;
    var fired = false;
    var mine = index;
    armed = step.action.arm(function () {
      if (fired || !open || index !== mine) return;
      fired = true;
      disarm();
      /* Confirm it visibly and audibly before moving, so the visitor sees
         that what THEY did is what advanced the tour. Stepping instantly
         reads as the tour having moved on by itself. */
      var strip = overlay.querySelector("#tourTry");
      strip.classList.add("done");
      overlay.querySelector("#tourTryText").textContent = step.action.ok || "Nice — that's it.";
      sfx("save");
      setTimeout(function () { if (open && index === mine) go(index + 1); }, 900);
    });
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

    disarm();
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
        return new Promise(function (r) { setTimeout(r, step.before ? 460 : 20); });
      })
      .then(function () {
        if (!open) return;
        var myIndex = index;
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

        reposition();
        track();
        armStep(step);
        var next = overlay.querySelector("#tourNext");
        if (!next.hidden) next.focus({ preventScroll: true });
      });
  }

  function start(list, opts) {
    if (open) return;
    build();
    onEnd = (opts && opts.onEnd) || null;
    steps = (list || []).filter(Boolean);
    if (!steps.length) return;
    lastFocus = document.activeElement;
    index = 0;
    open = true;
    overlay.classList.add("open");
    /* The page is NOT frozen. A step can ask you to press something below
       the fold, and the spotlight already follows the page on scroll. */
    sfx("open");
    go(0);
  }

  function stop(early) {
    if (!open) return;
    disarm();
    untrack();
    open = false;
    overlay.classList.remove("open");
    markSeen();
    /* Whatever the step list changed about the page to make a control
       reachable, it gets to undo here — on every exit path, including Esc
       and Skip, not only on a tidy finish. */
    if (onEnd) { try { onEnd(); } catch (e) {} onEnd = null; }
    sfx(early ? "close" : "victory");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) {} }
  }

  window.PortfolioTour = {
    start: start,
    stop: stop,
    seen: seen,
    watch: watch,
    get isOpen() { return open; }
  };
})();
