/* Tab-only branding. CSS border-radius cannot change a browser-tab icon:
   generate a small PNG with an actual circular alpha mask instead. The upload
   remains untouched. Shared by the public portfolio and the editor. */
(() => {
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
  /* The tab icon's own <link>. Created ONLY when there is a real href to
     put in it — never in advance.

     Creating it up front was the bug behind "the tab is empty while the
     page loads". This function used to run at the top of apply(), on every
     page load, appending <link rel="icon" id="tabIcon"> with no href at
     the END of the head. A browser that takes the last declared icon then
     had an empty one to honour, and the tab went blank — permanently, if
     no custom icon was ever uploaded, because apply() returns early in
     that case and the hrefless link just stayed there.

     The page already ships real circular PNGs in its head. Those are what
     should be showing the whole time this code is thinking. */
  function ownLink(href, type, sizes){
    let link = document.getElementById(LINK_ID);
    if(!link){
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'icon';
      document.head.appendChild(link);   // last wins where a browser has a preference
    }
    link.type = type;
    if(sizes) link.sizes = sizes; else link.removeAttribute('sizes');
    link.href = href;
    return link;
  }

  /* Drop the static declarations from THIS document, so no browser can
     prefer one of them over the round one we just installed. Called only
     AFTER a replacement is live — never before, or the tab is left with
     nothing to show. Server-side HTML is untouched, which is all a crawler
     ever reads. */
  let retired = [];

  function retireStaticLinks(){
    document.querySelectorAll('link[rel="icon"]').forEach(l => {
      if(l.id === LINK_ID) return;
      retired.push(l);
      l.remove();
    });
  }

  /* Put them back. Needed for one sequence that is easy to miss and easy to
     hit: in the editor, upload an icon (the static links are retired), then
     press "Remove logo". Our generated link goes away with the icon it was
     showing, and if the static links had been thrown away for good the
     document would be left with no icon at all until a reload — a blank tab
     caused by the removal, not by the upload. Keeping the nodes means the
     bundled circular icon simply comes back. */
  function restoreStaticLinks(){
    if(!retired.length) return;
    for(const l of retired) document.head.appendChild(l);
    retired = [];
  }

  async function apply(value, {broadcast=false}={}){
    const url = String(value || '').trim();
    const current = ++revision;

    /* A deliberate change in the editor still needs telling to other tabs,
       but it no longer blanks the icon to do it. There is always a correct
       picture available — the static circular PNG in the head — so the tab
       shows that until the new one is ready, instead of showing nothing. */
    if(broadcast){
      try{ localStorage.setItem(CHANGE_KEY, JSON.stringify({url, at:Date.now()})); }catch(_){}
    }

    if(!url){
      /* No custom icon. The static circular icons in the head are the
         answer, so remove anything we installed earlier and leave them
         alone. */
      cachedUrl=''; cachedPromise=null;
      restoreStaticLinks();
      const mine = document.getElementById(LINK_ID);
      if(mine) mine.remove();
      return null;
    }

    if(cachedUrl!==url || !cachedPromise){
      cachedUrl=url;
      cachedPromise=circularImage(url);
    }
    const png = await cachedPromise;
    if(current!==revision) return null; // An older upload must not win a race.
    if(png){
      ownLink(png, 'image/png', '64x64');
      retireStaticLinks();
    }else{
      /* A temporary image failure can be retried. Nothing is installed and
         nothing is removed, so the static circular icon is still showing. */
      cachedPromise=null;
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
