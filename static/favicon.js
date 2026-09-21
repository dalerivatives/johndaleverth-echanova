/* Tab-only branding. CSS border-radius cannot change a browser-tab icon:
   generate a small PNG with an actual circular alpha mask instead. The upload
   remains untouched. Shared by the public portfolio and the editor. */
(() => {
  const EMPTY = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"/>');
  const CHANGE_KEY = 'portfolio-tab-icon-change';
  const LINK_ID    = 'tabIcon';
  let revision = 0, cachedUrl = '', cachedPromise = null;

  function circularImage(url){
    return new Promise(resolve => {
      const img = new Image();
      let settled = false;
      const finish = result => {
        if(settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = img.onerror = null;
        resolve(result);
      };
      const timer = setTimeout(() => finish(null), 5000);
      img.crossOrigin = 'anonymous';
      img.onerror = () => finish(null);
      img.onload = () => {
        try{
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          if(!side) return finish(null);
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 64;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.beginPath();
          ctx.arc(32, 32, 32, 0, Math.PI * 2);
          ctx.clip();
          // Centre crop: square and portrait uploads keep their proportions.
          ctx.drawImage(img, (img.naturalWidth-side)/2, (img.naturalHeight-side)/2,
            side, side, 0, 0, 64, 64);
          finish(canvas.toDataURL('image/png'));
        }catch(_){ finish(null); }
      };
      img.src = url;
    });
  }

  /* ---- swapping the tab icon ----------------------------------------
     The page now ships REAL icon files in its head (/favicon.ico and the
     PNGs), because a search crawler never runs this script and so only
     ever sees the HTML. Those static links are also what the tab shows
     for the first fraction of a second, before this runs.

     Which changes one rule here. The old version blanked the link to an
     empty SVG the moment it started, then filled it in when the canvas
     was ready — so on a slow connection, a failed /api/settings call or a
     browser that refused the canvas, the tab was left showing NOTHING
     rather than the perfectly good file already declared in the head.

     Now the static icon stays up until the circular one is actually ready
     to replace it. The blank-first behaviour is kept for exactly one case
     — an icon being CHANGED in the editor — where continuing to show the
     old picture for a second would be wrong. */
  function ownLink(){
    let link = document.getElementById(LINK_ID);
    if(!link){
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'icon';
      document.head.appendChild(link);   // last wins where a browser has a preference
    }
    return link;
  }

  /* Only once the generated icon is live: drop the static declarations from
     THIS document so no browser can prefer one of them over the round one.
     Server-side HTML is untouched, which is all a crawler ever reads. */
  function retireStaticLinks(){
    document.querySelectorAll('link[rel="icon"]').forEach(l => {
      if(l.id !== LINK_ID) l.remove();
    });
  }

  async function apply(value, {broadcast=false}={}){
    const url = String(value || '').trim();
    const current = ++revision;
    const link = ownLink();

    if(broadcast){
      // An icon deliberately changed in the editor: clear it immediately so
      // the old one cannot linger, and tell any other open tab.
      retireStaticLinks();
      link.type = 'image/svg+xml';
      link.href = EMPTY;
      link.removeAttribute('sizes');
      try{ localStorage.setItem(CHANGE_KEY, JSON.stringify({url, at:Date.now()})); }catch(_){}
    }

    if(!url){ cachedUrl=''; cachedPromise=null; return null; }
    if(cachedUrl!==url || !cachedPromise){
      cachedUrl=url;
      cachedPromise=circularImage(url);
    }
    const png = await cachedPromise;
    if(current!==revision) return null; // An older upload must not win a race.
    if(png){
      link.type = 'image/png';
      link.sizes = '64x64';
      link.href = png;
      retireStaticLinks();
    }else{
      cachedPromise=null; // A temporary image failure can be retried; the
                          // static /favicon.ico is still showing meanwhile.
    }
    return png;
  }

  async function refresh(){
    const current=revision;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch('/api/settings',{signal:controller.signal});
      if(!response.ok) return;
      const settings=await response.json();
      if(current===revision) await apply(settings.favicon_url);
    }catch(_){}finally{clearTimeout(timer);}
  }
  window.PortfolioFavicon = {apply,refresh};
  window.addEventListener('storage', event => {
    if(event.key!==CHANGE_KEY || !event.newValue) return;
    try{ apply(JSON.parse(event.newValue).url); }catch(_){}
  });
})();
