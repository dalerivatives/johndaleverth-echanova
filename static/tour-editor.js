/* ============================================================
   THE EDITOR'S WALKTHROUGH — loader only
   ------------------------------------------------------------
   This file contains NO step text. It fetches the walkthrough from
   /api/editor/tutorial, which sits behind the same admin dependency as
   every other editor endpoint, and then maps what comes back onto the
   shared tour engine.

   Why the content is not simply written here, next to the portfolio's:
   the public tour describes a page anyone can already look at. The
   editor's is a labelled map of the admin interface — which control
   writes to the database, which one deletes without a second prompt,
   where the uploads live. Shipping that as a file on a public domain
   hands it to anyone who thinks to open the network tab. Fetching it with
   the session token means an anonymous request gets a 401 and this file,
   read on its own, gives up nothing.

   What arrives is treated as DATA, never as code. A step names what it
   wants to wait for — "a click on this selector", "this status line
   changed" — and the mapping below turns that name into a listener. There
   is no path by which a response can execute anything; an unrecognised
   `kind` simply produces a step with no task rather than a step that does
   something unexpected.
   ============================================================ */
(function () {
  "use strict";

  /* Each kind maps to a watcher. Anything not on this list is ignored,
     which is what keeps the response inert. */
  function toAction(step) {
    var W = window.PortfolioTour.watch;
    var spec = step.wait;
    if (!spec || !spec.kind) return null;
    var arm = null;

    if (spec.kind === "click" && spec.sel) {
      arm = W.click(spec.sel);
    } else if (spec.kind === "event" && spec.name) {
      arm = W.event(spec.name);
    } else if (spec.kind === "typed" && spec.sel) {
      var min = spec.min || 1;
      arm = W.condition(function () {
        var el = document.querySelector(spec.sel);
        return !!el && (el.value || "").trim().length >= min;
      });
    } else if (spec.kind === "status" && spec.sel) {
      /* Wait for the status line to say something that is not a
         placeholder and not an "in progress" message — i.e. for the
         operation to have actually finished. */
      var seen = null;
      arm = W.condition(function () {
        var el = document.querySelector(spec.sel);
        if (!el) return false;
        var text = (el.textContent || "").trim();
        if (seen === null) { seen = text; return false; }
        if (!text || text === seen) return false;
        return !/…$|^Saving|^Uploading|^Loading/i.test(text);
      });
    }

    if (!arm) return null;
    return {
      hint: step.hint || "<b>Try it.</b>",
      ok: step.ok || "Done.",
      arm: arm
    };
  }

  function build(payload) {
    return (payload && payload.steps || []).map(function (s) {
      return {
        target: s.target || null,
        /* Where the pointing hand goes, when that is not the same as the
           thing being outlined — a strip of tabs is outlined whole, but
           the hand has to land on one tab. */
        point: s.point || null,
        title: s.title || "",
        body: s.body || "",
        optional: !!s.optional,
        action: toAction(s)
      };
    });
  }

  function wire() {
    var btn = document.getElementById("tourBtn");
    var gate = document.getElementById("loginGate");
    if (!btn) return;

    /* Hidden behind the gate: a walkthrough of controls nobody can see yet
       is worse than none, and the fetch would 401 anyway. */
    function sync() {
      var locked = gate && !gate.hidden;
      btn.hidden = !!locked;
      if (!locked && window.PortfolioTour && !window.PortfolioTour.seen()) {
        btn.classList.add("unseen");
      }
    }
    sync();
    if (gate) new MutationObserver(sync).observe(gate, { attributes: true, attributeFilter: ["hidden"] });

    var cached = null;
    btn.addEventListener("click", function () {
      if (!window.PortfolioTour) return;
      if (cached) { window.PortfolioTour.start(cached); return; }

      btn.disabled = true;
      /* editor.js owns the session token, so its api() is what carries it.
         Falling back to a bare fetch only matters for a local file open,
         where there is no session to send anyway. */
      var get = (typeof window.editorApi === "function")
        ? window.editorApi("/api/editor/tutorial")
        : fetch("/api/editor/tutorial");

      Promise.resolve(get)
        .then(function (res) {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(function (payload) {
          cached = build(payload);
          if (cached.length) window.PortfolioTour.start(cached);
        })
        .catch(function () {
          /* Never a dead button with no explanation: say what happened in
             the place the editor already uses for status. */
          var status = document.getElementById("settingsStatus");
          if (status) status.textContent = "Couldn't load the walkthrough — try signing in again.";
        })
        .then(function () { btn.disabled = false; });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();
})();
