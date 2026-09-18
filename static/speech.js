/* v70: one bundled robot voice on every device; never select an OS voice. */
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
  /* An AudioContext is born SUSPENDED and resume() is asynchronous, so
     "we called resume()" and "the context is actually running" are two
     different moments. Scheduling playback in the gap between them is the
     classic "first tap does nothing, second tap works" bug — sfx.js hits
     the same issue and fixes it the same way: hold the tap's own gesture,
     poll briefly, and only bail out if the context genuinely never wakes
     up, instead of failing the instant it isn't running yet. */
  function waitRunning(maxMs){
    if(context.state === 'running') return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled = false;
      const succeed = () => { if(settled) return; settled = true; resolve(true); };
      const fail = () => { if(settled) return; settled = true; resolve(false); };
      try{
        const r = context.resume();
        // Only settle here if the state has ALREADY flipped by the time the
        // promise resolves — resolving without checking would treat "resume()
        // finished" as "still not running" and give up before the poll below
        // ever gets a chance to see the real flip, which just reintroduces
        // the same race one line down.
        if(r && typeof r.then === 'function') r.then(()=>{ if(context.state==='running') succeed(); }).catch(()=>{});
      }catch(e){}
      // Some browsers have shipped resume() that resolves late or never
      // while the state flips anyway — a short poll is the backstop.
      let tries = 0;
      const poll = setInterval(()=>{
        if(settled){ clearInterval(poll); return; }
        if(context.state === 'running'){ clearInterval(poll); succeed(); return; }
        if(++tries > Math.ceil(maxMs/25)){ clearInterval(poll); fail(); }
      }, 25);
    });
  }
  window.addEventListener('pointerdown', prime, {passive:true});
  window.addEventListener('keydown', prime);
  function prepareWorker(){
    if(worker) return;
    worker = new Worker('speech-worker.js?v=70');
    worker.onmessage = async ({data}) => {
      if(!current || data.id !== current.id) return;
      if(data.error){ finish(false); return; }
      clearTimeout(timer);
      try {
        const ready = await waitRunning(1500);
        if(!current || data.id !== current.id) return;   // cancelled/superseded while we waited
        if(!ready){ finish(false); return; }
        const decoded = await Promise.all((data.wavs || [data.wav]).map(wav=>context.decodeAudioData(wav)));
        let buffer=decoded[0];
        if(decoded.length>1){
          const rate=decoded[0].sampleRate;
          if(decoded.some(item=>item.sampleRate!==rate)) throw new Error('Inconsistent audio format');
          buffer=context.createBuffer(1,decoded.reduce((sum,item)=>sum+item.length,0),rate);
          let offset=0;
          for(const item of decoded){buffer.copyToChannel(item.getChannelData(0),0,offset);offset+=item.length;}
        }
        if(!current || data.id !== current.id) return;
        source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        const id = current.id;
        source.onended = ()=>{ if(current && current.id === id) finish(true); };
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
      worker.postMessage({id:current.id, parts:current.parts, profile:current.profile});
      timer = setTimeout(()=>{
        if(worker){worker.terminate();worker=null;}
        finish(false);
      }, current.parts.length*25000+5000);
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
