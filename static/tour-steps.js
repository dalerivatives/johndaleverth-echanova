/* ============================================================
   WHAT THE TOUR ASKS YOU TO DO — the portfolio
   ------------------------------------------------------------
   Kept apart from the engine so the wording and the tasks can change
   without touching any of the positioning logic.

   Almost every step here is a TASK: the card explains a control and then
   waits for the visitor to use it. Nothing is simulated — each step
   listens for the site's own event or its own state, so the tour can only
   advance because the thing genuinely happened. That is the difference
   between a walkthrough and a slideshow.

   A few steps have no task on purpose. The welcome, the live viewer count
   and the sign-off are things to read or notice, not things to press, and
   inventing busywork for them would be worse than a Next button.
   ============================================================ */
(function () {
  "use strict";

  function W() { return window.PortfolioTour.watch; }

  /* ---- the rail has to be OPEN for its tools to exist -----------------
     `.nav-tool` is `display:none` until the rail opens, so the theme dial
     and the sound switch have no layout box at all while it is shut —
     nothing to spotlight and nothing to press. The tour opens it with the
     same `.open` class the touch path uses, which works on a pointer
     device too, and puts it back at the end so the rail behaves normally
     afterwards. */
  var railForced = false;
  function openRail() {
    var stack = document.getElementById("stack");
    if (stack && !stack.classList.contains("open")) {
      stack.classList.add("open");
      railForced = true;
    }
  }
  function releaseRail() {
    if (!railForced) return;
    railForced = false;
    var stack = document.getElementById("stack");
    /* Only on a pointer device: on touch, `.open` is how the rail is
       genuinely opened and taking it away would shut it under the user. */
    if (stack && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      stack.classList.remove("open");
    }
  }

  /* True once the rail is expanded, however it was expanded. On a desktop
     that happens through CSS :hover with no class to watch for, so the
     only honest signal is that a tool now has a box on screen. */
  function railIsOpen() {
    var el = document.getElementById("themeLever");
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  /* ---- pointing AT a position on the theme dial ----------------------
     The dial is not a button that advances a notch per press. It is a
     rotary control read by ANGLE: wherever you press on its face, the
     angle from the spindle to your finger is snapped to the nearest of
     its nine detents. The consequence that catches people out is that
     the dead centre — the obvious place to press a round thing — does
     nothing at all, by design.

     So this step cannot point at an element; it has to point at a PLACE
     on one. The finger walks the arc, detent by detent, showing both
     where the stops are and that the control turns. The geometry is read
     from the same CSS custom property the dial itself uses, so the hand
     cannot drift away from the drawn positions. */
  var DIAL_STOPS = 9;

  function dialSpot() {
    var el = document.getElementById("themeLever");
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return null;

    var span = parseFloat(getComputedStyle(el).getPropertyValue("--kb-span"));
    if (!isFinite(span) || span <= 0) span = 75;

    /* One stop every 800ms, left to right and back, so it reads as a knob
       being turned rather than a cursor jumping about. */
    var tick = Math.floor(Date.now() / 800) % (DIAL_STOPS * 2 - 2);
    var i = tick < DIAL_STOPS ? tick : (DIAL_STOPS * 2 - 2) - tick;
    var deg = -span + i * (span * 2 / (DIAL_STOPS - 1));
    var rad = deg * Math.PI / 180;

    var radius = r.width * 0.33;
    return {
      x: r.left + r.width / 2 + Math.sin(rad) * radius,
      y: r.top + r.height / 2 - Math.cos(rad) * radius
    };
  }

  function steps() {
    var w = W();
    return [
      {
        target: null,
        title: "Let's go through it together",
        body: "This isn't a slideshow — each step asks you to actually use the thing it " +
              "describes, and moves on once you have. About two minutes. " +
              "<kbd>Esc</kbd> leaves at any point, and any step can be skipped."
      },
      {
        target: "#stack",
        avoid: "#stack",
        title: "The navigation rail",
        body: "Every section opens from here. On a desktop it expands when your cursor " +
              "reaches it; on a phone you tap the circle.",
        action: {
          hint: "<b>Try it:</b> hover the rail (or tap it on a phone) to open it.",
          ok: "That's the rail — the tools live at the top of it.",
          arm: w.condition(railIsOpen)
        }
      },
      {
        target: "#themeLever",
        at: dialSpot,
        handScale: 0.58,
        avoid: "#stack",
        before: openRail,
        title: "The theme dial \u2014 turn it, don't press it",
        body: "This is a rotary dial with <b>nine</b> positions, and it is turned by " +
              "<b>where</b> you press on its face, not by how many times. Press or drag " +
              "toward the left of the knob for the light end, the right for the dark end, " +
              "and straight up for <b>Auto</b>, which follows your device. Pressing the " +
              "middle does nothing \u2014 there is no angle there to read.",
        action: {
          /* Live, because the whole point of this step is watching the
             label change as the knob turns. A fixed sentence would be
             describing something the person is looking straight at. */
          hint: function () {
            var readout = document.getElementById("leverReadout");
            var now = (readout && readout.textContent || "").trim();
            return "<b>Turn it</b> to the theme you want \u2014 follow the finger around the " +
                   "face and press where you like it" +
                   (now ? ". Currently <b>" + now + "</b>" : "") +
                   ". The tour waits until you settle.";
          },
          ok: "Good \u2014 that one is remembered for your next visit.",
          /* The dial's own position is the honest signal. A click watcher
             would have passed on a press in the dead centre, which changes
             nothing \u2014 the tour would have moved on from a step the
             visitor had not actually managed to do. And settle rather than
             first-turn, because nine stops means finding the one you like
             takes a few goes and cutting in at the first would take the
             choice away. */
          arm: w.settle(w.attr("#themeLever", "data-mode"), 1700)
        }
      },
      {
        target: "#soundToggle",
        point: "#soundToggle",
        avoid: "#stack",
        before: openRail,
        title: "Sound",
        body: "The site answers presses, hovers and typing with small sounds, and reads the " +
              "terminal out loud. This is the master switch, and it remembers your choice.",
        action: {
          /* Ending this step muted would silence the rest of the tour \u2014
             including the terminal reading itself out two steps later,
             which is one of the better things on the site. So the task is
             to flip it AND flip it back, which demonstrates the control
             and leaves the sound on. */
          hint: function () {
            var muted = window.SFX && window.SFX.muted;
            return muted
              ? "<b>Now press it again</b> to turn sound back on \u2014 the next steps have " +
                "something worth hearing."
              : "<b>Try it:</b> press it once to mute, then again to bring it back.";
          },
          ok: "Sound is on \u2014 you will hear the rest of the tour.",
          arm: function (done) {
            /* Only finish on the transition back to ON, so the step cannot
               complete with the site left silent. */
            var fn = function () { if (window.SFX && !window.SFX.muted) done(); };
            window.addEventListener("sfx-mute", fn);
            return function () { window.removeEventListener("sfx-mute", fn); };
          }
        }
      },
      {
        target: "#presence",
        title: "Who else is here",
        body: "A live count of everyone on the site right now — the face is you. Nothing to " +
              "press; it just updates by itself when someone arrives or leaves.",
        optional: true
      },
      {
        target: "#whoamiField",
        point: "#whoamiField",
        title: "The terminal — this one is real",
        body: "Not decoration. It takes commands, and the first one worth knowing reveals the " +
              "person behind the code. It reads the answer aloud too, if sound is on.",
        action: {
          hint: "<b>Try it:</b> click the field, type <kbd>whoami</kbd> and press <kbd>Enter</kbd>.",
          ok: "There he is. Type <kbd>code</kbd> to go back.",
          arm: w.hasClass(".human-backdrop", "revealed")
        }
      },
      {
        target: "#resumeBtn",
        title: "The CV",
        body: "Downloads the full résumé as a PDF. It only appears when there's a current one " +
              "uploaded, so it is never a dead link.",
        optional: true
      },
      {
        target: "#stack",
        point: '.nav-item[data-id="projects"] .nav-btn',
        avoid: "#stack",
        before: openRail,
        title: "Now open Projects",
        body: "Work grouped by what it is — computer vision, full-stack, embedded. Every card " +
              "opens for the detail: what it does, what it's built with, and a link to the " +
              "code where there is code to show.",
        action: {
          hint: "<b>Try it:</b> open <b>Projects</b> from the rail.",
          ok: "That's Projects — open any card to see inside.",
          arm: w.section("projects")
        }
      },
      {
        target: "#stack",
        point: '.nav-item[data-id="achievements"] .nav-btn',
        avoid: "#stack",
        before: openRail,
        title: "Achievements",
        body: "Education, awards, and the things founded or shipped. Same card layout as " +
              "Projects, so once you know one you know the other.",
        action: {
          hint: "<b>Try it:</b> open <b>Achievements</b> from the rail.",
          ok: "Same layout, different content.",
          arm: w.section("achievements")
        }
      },
      {
        target: "#stack",
        point: '.nav-item[data-id="tools"] .nav-btn',
        avoid: "#stack",
        before: openRail,
        title: "Tools",
        body: "The stack — languages, frameworks, hardware, and the platforms it runs on. " +
              "A quick read of what I actually work in.",
        action: {
          hint: "<b>Try it:</b> open <b>Tools</b> from the rail.",
          ok: "That's the whole stack.",
          arm: w.section("tools")
        }
      },
      {
        target: "#stack",
        point: '.nav-item[data-id="chat"] .nav-btn',
        avoid: "#stack",
        before: openRail,
        title: "Last one — the chat",
        body: "This is where the robot lives, and where the site stops being a portfolio and " +
              "starts being a toy.",
        action: {
          hint: "<b>Try it:</b> open <b>Chat</b> from the rail.",
          ok: "Meet UNIT T-700V.",
          arm: w.section("chat")
        }
      },
      {
        /* Before the robot, because the arena is inert until a name
           exists \u2014 the gate sits ON the robot and swallows every swing.
           Without this step the next one reads as broken: the card says
           "click the robot", the visitor clicks the robot, and the site
           shakes a label at them instead of taking damage. */
        target: "#chatNameForm",
        point: "#chatNameInput",
        title: "Say who you are",
        body: "The chat and the arena both need a name to put against what you do. It is " +
              "not an account and there is no password \u2014 it is only what appears beside " +
              "your messages and on the leaderboard.",
        action: {
          /* Live, because the one way this step can stall is a name
             somebody else already has. The site says so under the field;
             a fixed "type a name" sitting above that would be the tour
             telling you to do the thing you just did. */
          hint: function () {
            var err = document.getElementById("chatNameError");
            if (err && !err.hidden && (err.textContent || "").trim()) {
              return "<b>That one is taken</b> \u2014 try a different name.";
            }
            return "<b>Try it:</b> type a name and press <kbd>Enter</kbd> to join.";
          },
          ok: "You are in \u2014 now the robot can be hit.",
          /* The gate on the robot is the honest signal, and it is already
             down for anyone who joined on a previous visit, so a returning
             visitor is carried straight through instead of being asked for
             a name they have already given. */
          arm: w.condition(function () {
            var gate = document.getElementById("robotNameGate");
            return !!gate && gate.hidden;
          })
        }
      },
      {
        target: "#robotStage",
        point: "#robot3dHost",
        title: "T-700V — and the captcha joke",
        body: "A real 3D robot: its head follows your cursor, and it can be hit. This is an " +
              "inverted captcha — you prove you are <i>not</i> a robot by destroying one, and " +
              "that is what unlocks the chat composer.",
        action: {
          hint: "<b>Try it:</b> click the robot to take its health down.",
          ok: "Direct hit — keep going to destroy it and unlock the chat.",
          arm: w.event("robot-hp", function (e) {
            return e && e.detail && typeof e.detail.hp === "number" && e.detail.hp < 100;
          })
        }
      },
      {
        target: "#boardList",
        title: "The leaderboard",
        body: "Who has done the most damage to the robot standing now, and who landed the " +
              "finishing blow on the last one. It resets the moment a unit goes down.",
        optional: true
      },
      {
        target: "#tourBtn",
        title: "That's everything",
        body: "You've used every part of the site. This button, up in the corner, brings the " +
              "tour back whenever you want it — nothing here is one-time. Thanks for looking " +
              "around."
      }
    ];
  }

  function wire() {
    var btn = document.getElementById("tourBtn");
    if (!btn) return;
    if (window.PortfolioTour && !window.PortfolioTour.seen()) btn.classList.add("unseen");
    btn.addEventListener("click", function () {
      if (window.PortfolioTour) window.PortfolioTour.start(steps(), { onEnd: releaseRail });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
