/* ============================================================
   LIVE RELOAD  (development only)

   Polls /api/dev/version and reloads the page when the fingerprint of the
   static folder changes. The server only returns a real fingerprint when it
   was started with DEV=1, so on a deployed site the first poll comes back
   `enabled:false` and this stops for good — no timer, no traffic.

   The server's pid is watched too, so a `uvicorn --reload` restart (a Python
   edit) refreshes the tab just like an HTML or CSS edit does.
   ============================================================ */
(() => {
  const POLL_MS = 900;
  let last = null;
  let lastPid = null;
  let failures = 0;

  async function check(){
    let data;
    try{
      const res = await fetch("/api/dev/version", {cache:"no-store"});
      if(!res.ok) throw new Error("bad status");
      data = await res.json();
      failures = 0;
    }catch(e){
      /* A restart briefly refuses connections. Tolerate a few misses instead
         of giving up — otherwise editing a .py file would kill live reload
         exactly when it's most useful. */
      if(++failures > 40) return;
      return schedule();
    }

    if(!data.enabled) return;          // production: stop entirely

    if(last === null){
      last = data.version;
      lastPid = data.pid;
    }else if(data.version !== last || data.pid !== lastPid){
      // Bypass the bfcache so the new files are actually fetched.
      window.location.reload();
      return;
    }
    schedule();
  }

  function schedule(){ setTimeout(check, POLL_MS); }
  check();
})();
