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
        avoid: "#stack",
        before: openRail,
        title: "The theme dial",
        body: "A rotary switch with five stops rather than a light/dark toggle. Each press " +
              "steps to the next palette, and the label underneath names where you landed. " +
              "<b>Auto</b> follows whatever your device is set to.",
        action: {
          hint: "<b>Try it:</b> press the dial and watch the page change.",
          ok: "The whole site repaints — including this card.",
          arm: w.click("#themeLever")
        }
      },
      {
        target: "#soundToggle",
        avoid: "#stack",
        before: openRail,
        title: "Sound",
        body: "The site answers presses, hovers and typing with small sounds. This is the " +
              "master switch, and it remembers your choice for next time.",
        action: {
          hint: "<b>Try it:</b> press it once to hear it flip. Press again to put it back.",
          ok: "Flipped — your choice is saved.",
          arm: w.event("sfx-mute")
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
        target: "#robotStage",
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
