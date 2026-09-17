/* v69: one bundled robot voice on every device; never select an OS voice. */
(() => {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  const supported = !!AudioEngine && typeof Worker === 'function';
  let context, worker, source, current = null, queue = [], serial = 0;
  let unlocked = false, timer = null;
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, {detail}));
  function finish(ok){
    if(!current) return;
    const job = current;
    current = null;
    clearTimeout(timer);
    if(source){ source.onended = null; source.disconnect(); source = null; }
    emit('portfolio-speech-end', {text:job.original, ok});
    if(typeof job.done === 'function') { try{ job.done(ok); }catch(e){ console.warn(e); } }
    next();
  }
  function prime(){
    if(!supported) return;
    try {
      context ||= new AudioEngine();
      context.resume().then(()=>{ unlocked = context.state === 'running'; }).catch(()=>{});
    } catch(e){}
  }
  window.addEventListener('pointerdown', prime, {passive:true});
  window.addEventListener('keydown', prime);
  function prepareWorker(){
    if(worker) return;
    worker = new Worker('speech-worker.js?v=69');
    worker.onmessage = async ({data}) => {
      if(!current || data.id !== current.id) return;
      if(data.error){ finish(false); return; }
      clearTimeout(timer);
      try {
        if(context.state !== 'running'){ finish(false); return; }
        const buffer = await context.decodeAudioData(data.wav);
        if(!current || data.id !== current.id) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const id = current.id;
        source.onended = ()=>{ if(current && current.id === id) playPart(); };
        emit('portfolio-speech-start', {text:current.original});
        source.start();
        timer = setTimeout(()=>{ if(source){source.onended=null; source.stop();} finish(false); }, buffer.duration*1000+5000);
      } catch(e){ if(current && current.id===data.id) finish(false); }
    };
    const ownedWorker=worker;
    worker.onerror = ()=>{
      if(worker !== ownedWorker) return;
      worker.terminate(); worker = null;
      finish(false);
    };
  }
  function playPart(){
    clearTimeout(timer);
    if(source){ source.onended = null; source.disconnect(); source = null; }
    if(!current) return;
    if(!current.parts.length){ finish(true); return; }
    try {
      prepareWorker();
      const text=current.parts.shift();
      worker.postMessage({id:current.id, text, profile:current.profile, intro:current.profile==='robot' && text === 'Welcome to my world!'});
      timer = setTimeout(()=>{
        if(worker){worker.terminate();worker=null;}
        finish(false);
      }, 15000);
    } catch(e){ finish(false); }
  }
  function next(){
    if(current || !queue.length) return;
    current = queue.shift();
    playPart();
  }
  function stop(){
    queue = [];
    clearTimeout(timer);
    if(worker){ worker.terminate(); worker=null; }
    if(source){ source.onended=null; try{source.stop();source.disconnect();}catch(e){} source=null; }
    const job = current; current = null;
    if(job){
      emit('portfolio-speech-end', {text:job.original, ok:false});
      if(typeof job.done==='function'){try{job.done(false);}catch(e){console.warn(e);}}
    }
  }
  function speak(text, interrupt, done, profile="robot"){
    if(!supported) return false;
    // Keep sentence punctuation and accented names. Remove emoji, not words.
    const clean = String(text || '').normalize('NFKC')
      .replace(/[’‘]/g,"'").replace(/[“”]/g,'').replace(/[—–]/g,', ')
      .replace(/\p{Extended_Pictographic}/gu,' ').replace(/[\u200d\ufe0f]/g,'')
      .replace(/\s+/g,' ').trim().slice(0,4000);
    if(!clean) return false;
    prime();
    if(!context) return false;
    if(interrupt) stop();
    if(queue.length >= 8) return false; // no unbounded public-chat backlog
    // Keep ordinary paragraphs together. Split long text at sentence boundaries
    // instead of resetting the voice halfway through a 120-character clause.
    const parts=[];
    let rest=clean;
    while(rest.length>440){
      const prefix=rest.slice(0,440);
      const endings=[...prefix.matchAll(/[.!?](?=\s)/g)];
      let cut=endings.length ? endings[endings.length-1].index+1 : -1;
      if(cut<160) cut=prefix.lastIndexOf(' ');
      if(cut<1) cut=440;
      parts.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trim();
    }
    if(rest) parts.push(rest);
    queue.push({id:++serial, original:clean, parts, done, profile});
    // Resume in the initiating gesture; generation finishes after that resume.
    context.resume().then(()=>{unlocked=context.state==='running';}).catch(()=>{});
    next();
    return true;
  }
  window.Speech = {
    supported, robot:(text,interrupt,done)=>speak(text,interrupt,done,"robot"),
    plain:(text,interrupt,done)=>speak(text,interrupt,done,"narration"), stop,
    get speaking(){return !!current || queue.length > 0;},
    get primed(){return unlocked;}
  };
  document.addEventListener('visibilitychange', ()=>{if(document.hidden) stop();});
})();
