/* Readiness gate, not a pretend time-based percentage. */
(() => {
  document.documentElement.classList.add('booting');
  const tasks=[], failures=new Set();
  let released=false, completed=0, total=1;
  const byId=id=>document.getElementById(id);
  function progress(){
    const bar=byId('bootBar');
    if(bar) bar.style.width=Math.min(96,15+81*completed/total)+'%';
  }
  const fail=name=>failures.add(name);
  function track(promise,name){
    total++;
    const safe=Promise.resolve(promise).catch(()=>fail(name)).finally(()=>{completed++;progress();});
    tasks.push(safe);
    return safe;
  }
  window.PortfolioBoot={track,fail};
  function release(){
    released=true;
    clearTimeout(deadline);
    document.documentElement.classList.remove('booting');
    if(byId('bootScreen')) byId('bootScreen').hidden=true;
    document.querySelectorAll('[data-boot-inert]').forEach(el=>{el.inert=false;el.removeAttribute('data-boot-inert');});
    window.dispatchEvent(new Event('portfolio-ready'));
  }
  function recovery(){
    if(released || !byId('bootStatus')) return;
    byId('bootStatus').textContent='Some content is taking longer or could not load. Retry, or continue with what is ready.';
    byId('bootActions').hidden=false;
  }
  const deadline=setTimeout(recovery,20000);
  window.addEventListener('error', event=>{
    if(event.error) fail('Application script');
    const el=event.target;
    if(el && (el.tagName==='SCRIPT' || el.tagName==='LINK')) fail(el.src || el.href);
  },true);
  document.addEventListener('DOMContentLoaded',()=>{
    byId('bootScreen').hidden=false;
    for(const el of document.body.children){
      if(el.id!=='bootScreen' && !['SCRIPT','NOSCRIPT'].includes(el.tagName) && !el.inert){el.inert=true;el.dataset.bootInert='';}
    }
    byId('bootRetry').onclick=()=>location.reload();
    byId('bootContinue').onclick=release;
    // Other DOMContentLoaded handlers register CMS requests in this same turn.
    setTimeout(async()=>{
      await Promise.all(tasks);
      if(released) return;
      byId('bootStatus').textContent='Finishing images and typography…';
      const assets=[];
      assets.push(track(fetch('assets/whoami-robot.wav?v=70').then(r=>{if(!r.ok) throw new Error('Voice unavailable');return r.arrayBuffer();}),'Welcome voice'));
      if(document.fonts) assets.push(track(document.fonts.ready,'Fonts'));
      for(const img of document.images){
        img.loading='eager';
        const ready=img.decode ? img.decode() : new Promise((resolve,reject)=>{
          if(img.complete){img.naturalWidth ? resolve() : reject();return;}
          img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true});
        });
        assets.push(track(ready,'Image'));
      }
      assets.push(track(document.readyState==='complete' ? Promise.resolve() : new Promise(resolve=>window.addEventListener('load',resolve,{once:true})),'Page assets'));
      await Promise.all(assets);
      if(released) return;
      if(failures.size){recovery();return;}
      byId('bootBar').style.width='100%';
      byId('bootStatus').textContent='Ready. Welcome.';
      requestAnimationFrame(()=>requestAnimationFrame(release));
    },0);
  },{once:true});
})();
