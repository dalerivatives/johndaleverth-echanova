/* A bounded readiness gate. Optional content cannot trap the visitor here. */
(() => {
  document.documentElement.classList.add('booting');
  const tasks=[], failures=new Set();
  let released=false, completed=0, total=1, criticalFailure=false, deadline;
  const byId=id=>document.getElementById(id);
  function progress(){
    const bar=byId('bootBar');
    if(bar) bar.style.width=Math.min(96,15+81*completed/total)+'%';
  }
  const fail=name=>failures.add(name);
  function track(promise,name){
    total++;
    /* Settings and CMS data enhance fallback HTML; they must not keep the
       whole page inert when the backend is restarting or unavailable. */
    let timer;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),3500);});
    const safe=Promise.race([Promise.resolve(promise),timeout]).catch(()=>fail(name)).finally(()=>{clearTimeout(timer);completed++;progress();});
    tasks.push(safe);
    return safe;
  }
  let departing=false, departureTimer;
  const reduced=()=>!!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function cover(animate){
    const screen=byId('bootScreen');
    if(!screen)return;
    document.documentElement.classList.remove('boot-revealing');
    screen.hidden=false;
    if(byId('bootActions'))byId('bootActions').hidden=true;
    if(byId('bootStatus'))byId('bootStatus').textContent='Loading your experience…';
    if(byId('bootBar'))byId('bootBar').style.width='4%';
    screen.style.opacity=animate?'0':'1';
    void screen.offsetWidth;
    document.documentElement.classList.add('boot-departing');
    screen.style.opacity='1';
  }
  function reload(){
    if(departing)return;
    departing=true;
    cover(!reduced());
    departureTimer=setTimeout(()=>location.reload(),reduced()?0:300);
  }
  window.PortfolioBoot={track,fail,reload};
  // Browser toolbar reloads cannot be delayed reliably by page scripts.
  // Cover immediately; in-page/keyboard reloads can finish the fade first.
  window.addEventListener('beforeunload',()=>cover(false));
  window.addEventListener('pageshow',event=>{
    if(!event.persisted)return;
    clearTimeout(departureTimer);departing=false;
    document.documentElement.classList.remove('boot-departing');
    const screen=byId('bootScreen');
    if(screen){screen.style.opacity='';if(released)screen.hidden=true;}
  });
  document.addEventListener('keydown',event=>{
    if(event.defaultPrevented || event.shiftKey || event.altKey)return;
    if(event.key==='F5' || ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='r')){
      event.preventDefault();reload();
    }
  });
  function release(){
    if(released) return;
    released=true;
    clearTimeout(deadline);
    const screen=byId('bootScreen');
    const moveFocus=!!(screen && screen.contains(document.activeElement));
    document.documentElement.classList.remove('booting');
    if(screen){
      screen.style.opacity='';
      document.documentElement.classList.add('boot-revealing');
      setTimeout(()=>{
        if(!departing)screen.hidden=true;
        document.documentElement.classList.remove('boot-revealing');
      },reduced()?0:300);
    }
    document.querySelectorAll('[data-boot-inert]').forEach(el=>{el.inert=false;el.removeAttribute('data-boot-inert');});
    if(moveFocus && byId('mainContent')) byId('mainContent').focus({preventScroll:true});
    window.dispatchEvent(new Event('portfolio-ready'));
  }
  function recovery(){
    if(released || !byId('bootStatus')) return;
    byId('bootStatus').textContent='An essential page file could not load. Retry, or continue with limited functionality.';
    byId('bootActions').hidden=false;
  }
  function finish(){
    if(released) return;
    if(criticalFailure){recovery();return;}
    if(byId('bootBar')) byId('bootBar').style.width='100%';
    if(byId('bootStatus')) byId('bootStatus').textContent='Ready. Welcome.';
    release();
  }
  window.addEventListener('error', event=>{
    const el=event.target;
    if((el && el.hasAttribute && el.hasAttribute('data-boot-critical')) ||
       (event.error && /\/script\.js(?:[?#]|$)/.test(event.filename || ''))){
      criticalFailure=true;
      if(document.readyState!=='loading') recovery();
    }
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    byId('bootScreen').hidden=false;
    for(const el of document.body.children){
      if(el.id!=='bootScreen' && !['SCRIPT','NOSCRIPT'].includes(el.tagName) && !el.inert){el.inert=true;el.dataset.bootInert='';}
    }
    byId('bootRetry').onclick=reload;
    byId('bootContinue').onclick=release;
    // One overall cap, not a full timeout for each loading phase.
    deadline=setTimeout(finish,7000);
    // Other DOMContentLoaded handlers register CMS requests in this same turn.
    setTimeout(async()=>{
      await Promise.all(tasks);
      if(released) return;
      byId('bootStatus').textContent='Finishing images and typography…';
      const assets=[];
      if(document.fonts) assets.push(track(document.fonts.ready,'Fonts'));
      for(const img of document.images){
        const view=img.closest('.page-view');
        // Keep off-screen galleries lazy instead of promoting all to eager.
        if(img.loading==='lazy' || img.closest('[hidden]') ||
           (view && !view.classList.contains('active'))) continue;
        const ready=img.decode ? img.decode() : new Promise((resolve,reject)=>{
          if(img.complete){img.naturalWidth ? resolve() : reject();return;}
          img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});
        });
        assets.push(track(ready,'Image'));
      }
      // No window.load or audio gate: embeds and narration are optional.
      await Promise.all(assets);
      finish();
    },0);
  },{once:true});
})();
