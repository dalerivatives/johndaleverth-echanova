/* ============================================================
   WHAT THE TOUR SAYS — the portfolio
   ------------------------------------------------------------
   The step list, kept apart from the engine so the wording can be edited
   without touching any of the positioning logic.

   Steps that live on another view carry a `before` that navigates there
   and lets the transition finish. Steps whose control only exists in some
   states — the resume button appears once a CV is uploaded, the chat
   composer only after you have claimed a name — are marked `optional` and
   quietly drop out when they are not on the page.
   ============================================================ */
(function () {
  "use strict";

  /* Navigate by clicking the real nav item, so the site's own routing,
     history and animations run exactly as they would for a visitor. If the
     rail has not rendered yet, fall back to the router directly. */
  function goTo(view) {
    return function () {
      var item = document.querySelector('.nav-item[data-id="' + view + '"] a, .nav-item[data-id="' + view + '"] button, .nav-item[data-id="' + view + '"]');
      if (item && item.click) { item.click(); return; }
      if (window.PortfolioNav && window.PortfolioNav.activate) window.PortfolioNav.activate(view);
    };
  }

  function steps() {
    return [
      {
        target: null,
        title: "Welcome — here's the two-minute version",
        body: "I'll walk you through every part of this site: how to move between sections, " +
              "the controls in the corner, the terminal, and the chat. " +
              "Use <kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Esc</kbd> to leave at any point. " +
              "Everything stays clickable while we go."
      },
      {
        target: "#stack",
        title: "The navigation rail",
        body: "Every section of the site opens from here. On a desktop it expands when you " +
              "hover; on a phone, tap the circle to open it. The section you're reading " +
              "moves to the top, so the rail reorders itself around where you've been."
      },
      {
        target: "#themeLever",
        title: "The theme dial",
        body: "A rotary switch with five stops, not a toggle. It steps through the palettes — " +
              "<b>Auto</b> follows your device's dark or light setting, and the label under it " +
              "names whichever stop you've landed on."
      },
      {
        target: "#soundToggle",
        title: "Sound",
        body: "The site answers presses, hovers and typing with small sounds. This is the " +
              "master switch for all of them, and it remembers your choice on your next visit."
      },
      {
        target: "#presence",
        title: "Who else is here",
        body: "A live count of people on the site right now — the face is you. It updates by " +
              "itself, so you can watch it move when someone else arrives.",
        optional: true
      },
      {
        target: "#whoamiField",
        title: "The terminal — try typing in it",
        body: "This one is real, not decoration. Type <kbd>whoami</kbd> and press " +
              "<kbd>Enter</kbd> to reveal the person behind the code. It reads the answer aloud, " +
              "if sound is on."
      },
      {
        target: "#resumeBtn",
        title: "The CV",
        body: "Downloads the full résumé as a PDF. It only appears when there's a current one " +
              "uploaded, so it's never a dead link.",
        optional: true
      },
      {
        target: "#projectsView",
        title: "Projects",
        body: "Work grouped by what it is — computer vision, full-stack, embedded. Open any card " +
              "for the detail: what it does, what it's built with, and links to the code where " +
              "there is code to show.",
        before: goTo("projects")
      },
      {
        target: "#achievementsView",
        title: "Achievements",
        body: "Education, awards and the things founded or shipped. Same card layout as Projects, " +
              "so once you know one you know the other.",
        before: goTo("achievements")
      },
      {
        target: "#toolsView",
        title: "Tools",
        body: "The stack — languages, frameworks, hardware and the platforms it all runs on. " +
              "A quick read of what I actually work in day to day.",
        before: goTo("tools")
      },
      {
        target: "#robotStage",
        title: "T-700V — and the captcha joke",
        body: "A real 3D robot. Its head follows your cursor, and you can hit it: click anywhere " +
              "on the unit to take its health down. It's an inverted captcha — you prove you're " +
              "<i>not</i> a robot by destroying one.",
        before: goTo("chat")
      },
      {
        target: "#chatLog",
        title: "World Chat",
        body: "Genuinely public — pick a name, destroy the robot to unlock the composer, and " +
              "anyone else on the site sees what you post. Everything clears itself after " +
              "24 hours.",
        optional: true
      },
      {
        target: "#boardList",
        title: "The leaderboard",
        body: "Who has done the most damage to the current robot, and who landed the finishing " +
              "blow on the last one. It resets the moment a unit goes down.",
        optional: true
      },
      {
        target: ".nav-tool-help",
        title: "That's the whole site",
        body: "This button brings the tour back any time — nothing here is one-time. " +
              "Thanks for taking the time to look around.",
        before: goTo("profile")
      }
    ];
  }

  function wire() {
    var btn = document.getElementById("tourBtn");
    if (!btn) return;
    if (window.PortfolioTour && !window.PortfolioTour.seen()) btn.classList.add("unseen");
    btn.addEventListener("click", function () {
      if (window.PortfolioTour) window.PortfolioTour.start(steps());
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
