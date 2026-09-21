/* ============================================================
   WHAT THE TOUR SAYS — the editor
   ------------------------------------------------------------
   Same engine as the public site, different words. Shorter too: the
   editor has one user, who mostly needs to know where each kind of
   content lives and which button writes it to the database.

   Nothing here runs until the editor is unlocked — a tour of controls
   behind a login gate would spotlight a column of elements the visitor
   cannot see. The help button stays hidden until the gate opens.
   ============================================================ */
(function () {
  "use strict";

  function tab(section) {
    return function () {
      var el = document.querySelector('.editor-tab[data-section="' + section + '"]');
      if (el) el.click();
    };
  }

  function steps() {
    return [
      {
        target: null,
        title: "This is where the site is edited",
        body: "Everything on the public portfolio is written from here and stored in the " +
              "database — no code changes, no redeploy. " +
              "<kbd>←</kbd> <kbd>→</kbd> to move, <kbd>Esc</kbd> to leave."
      },
      {
        target: ".editor-tabs",
        title: "The five areas",
        body: "<b>Projects</b>, <b>Achievements</b> and <b>Tools</b> are the three content " +
              "sections of the site. <b>Chat</b> moderates the World Chat. <b>Settings</b> is " +
              "everything else — your name, the terminal text, links, uploads."
      },
      {
        target: "#addCategoryForm",
        title: "Headings come first",
        body: "Content is grouped under headings, and a heading has to exist before anything " +
              "can go in it. Add one here — “Embedded Systems”, say — then add items inside it.",
        before: tab("project")
      },
      {
        target: "#categoriesList",
        title: "Headings and their items",
        body: "Each heading lists its items, and each item opens for editing. This is also where " +
              "you reorder or delete — deletions are permanent and take the items inside with " +
              "them, so it asks first."
      },
      {
        target: '.editor-tab[data-section="settings"]',
        title: "Settings",
        body: "The parts of the site that aren't a list of things: who you are, the terminal " +
              "intro, social links, the background, your CV and the browser-tab icon.",
        before: tab("settings")
      },
      {
        target: '[data-upload="favicon_url"]',
        title: "The browser-tab icon",
        body: "Upload a square photo and it is cropped to a circle on the server, so the tab, " +
              "search results and a phone's home screen all get the same round icon. " +
              "Square images work best — a wide one gets centre-cropped.",
        optional: true
      },
      {
        target: "#saveSettingsBtn",
        title: "Saving",
        body: "Nothing in Settings is written until this is pressed. The line beside it confirms " +
              "the save, and you'll hear it land. Reload the site in the other tab to see the " +
              "change.",
        optional: true
      },
      {
        target: "#soundToggle",
        title: "Sound",
        body: "The editor answers presses, typing, saves and deletions. This switch is shared " +
              "with the public site — mute in one and you're muted in both."
      },
      {
        target: "#logoutBtn",
        title: "Lock when you're done",
        body: "Ends the session. Worth doing on any machine that isn't yours — the key unlocks " +
              "everything you've just seen. The help button brings this tour back any time."
      }
    ];
  }

  function wire() {
    var btn = document.getElementById("tourBtn");
    var gate = document.getElementById("loginGate");
    if (!btn) return;

    /* Hidden behind the gate: a tour of controls nobody can see yet is
       worse than no tour. It appears the moment the editor unlocks. */
    function sync() {
      var locked = gate && !gate.hidden;
      btn.hidden = !!locked;
      if (!locked && window.PortfolioTour && !window.PortfolioTour.seen()) {
        btn.classList.add("unseen");
      }
    }
    sync();
    if (gate) new MutationObserver(sync).observe(gate, { attributes: true, attributeFilter: ["hidden"] });

    btn.addEventListener("click", function () {
      if (window.PortfolioTour) window.PortfolioTour.start(steps());
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
