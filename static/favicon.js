/* The browser-tab icon.
   ------------------------------------------------------------------
   This file used to DRAW the tab icon: fetch the uploaded picture, paint it
   into a canvas with a circular mask, and hand the resulting `data:` URL to
   a <link> it created. That is why a refresh looked like three different
   icons in a row —

     1. the square original, because the page's own <link> pointed at a
        route that served the upload untouched,
     2. nothing, during the moment between the old link being replaced and
        the new one being decoded,
     3. the circle, once the canvas finally finished.

   None of those steps are needed any more. The server crops the icon now,
   on the way in AND on the way out, so every URL this page points at
   already returns a circle — the first icon the browser paints is the right
   one, and there is nothing left to swap. A crawler or a phone home screen
   gets that same circle, which the canvas approach could never give them
   because neither runs this script.

   What is still worth doing here is small: when the icon is CHANGED in the
   editor, the URL has not changed, so a browser sitting on a cached copy
   would go on showing the old picture. Bumping a version parameter makes it
   refetch. That is the whole job now.

   The public API is unchanged, because editor.js and script.js call it:
     PortfolioFavicon.apply(url, {broadcast})
     PortfolioFavicon.refresh()
*/
(() => {
  const CHANGE_KEY = 'portfolio-tab-icon-change';

  /* Every icon link the page declares. These are real files served by the
     backend — never touched, never removed, never replaced by a data URL. */
  function iconLinks(){
    return Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]'));
  }

  /* Re-point each link at the same file with a new ?v=, which is the only
     way to make a browser reload an icon whose URL has not changed.

     The href is rebuilt from the existing one rather than hard-coded, so
     this keeps working if the paths in the head are ever changed. */
  function bust(token){
    for(const link of iconLinks()){
      const href = link.getAttribute('href');
      if(!href || href.startsWith('data:')) continue;
      const base = href.split('?')[0];
      link.setAttribute('href', base + '?v=' + token);
    }
  }

  /* Called on load, and whenever the icon changes.

     On load this deliberately does nothing. The links in the head are
     already correct and already circular; touching them could only make
     the tab flicker. `value` is accepted and ignored so the callers do not
     have to know that.

     `broadcast` marks the one case that IS a change: someone pressed
     Upload or Remove in the editor. Then the links are re-pointed here, and
     the storage write tells any other open tab to do the same. */
  function apply(value, {broadcast=false}={}){
    if(!broadcast) return Promise.resolve(null);
    const token = Date.now().toString(36);
    bust(token);
    try{ localStorage.setItem(CHANGE_KEY, JSON.stringify({url:String(value||''), at:Date.now()})); }catch(_){}
    return Promise.resolve(null);
  }

  /* Kept because editor.js calls it on start-up. There is nothing to fetch
     any more — the icon the page is already showing is the current one —
     so this resolves without touching the DOM or making a request. */
  function refresh(){
    return Promise.resolve(null);
  }

  window.PortfolioFavicon = { apply, refresh };

  /* Another tab changed the icon. Refetch ours so two open tabs do not
     disagree about what the site's icon is. */
  window.addEventListener('storage', event => {
    if(event.key !== CHANGE_KEY || !event.newValue) return;
    try{
      const at = JSON.parse(event.newValue).at;
      bust(Number(at || Date.now()).toString(36));
    }catch(_){}
  });
})();
