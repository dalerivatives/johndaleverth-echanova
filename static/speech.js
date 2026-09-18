/* v83: bundled male recordings; dynamic speech uses Piper or a known male voice.
   All engines share one queue so announcements never overlap narration. */
(() => {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  const supported = !!AudioEngine && typeof Worker === 'function';
  const DEFAULT_TERMINAL = "Hello World. I'm Dale , a Computer Engineer, Full Stack Developer, Inventor, who enjoys building codes and turning out of the blue ideas into Output";
  let context, worker, source, current = null, queue = [], serial = 0;
  const warmed = new Set();
  const warming = new Set();
  let unlocked = false, timer = null, dynamicAvailable = false;

  /* Low-memory hosting keeps Piper in static mode. Dynamic chat phrases may
     use an explicitly recognized male browser voice. Fixed commands are WAVs. */
  const browserSynth = window.speechSynthesis || null;
  const BrowserUtterance = window.SpeechSynthesisUtterance || null;
  const browserDynamic = !!(browserSynth && BrowserUtterance);
  let cachedBrowserVoice = null;
  let browserUtterance = null;

  function chooseBrowserVoice(){
    if(!browserDynamic) return null;
    const voices = browserSynth.getVoices ? browserSynth.getVoices() : [];
    if(!voices.length) return null;
    if(cachedBrowserVoice && voices.includes(cachedBrowserVoice)) return cachedBrowserVoice;
    // Web Speech has no gender property. Only accept names of known male
    // English voices, never the system default or an arbitrary English voice.
    const preferred = [
      /^Microsoft (Guy|David|Mark|Ryan|George|James|Christopher|Eric|Roger|Steffan)\b/i,
      /^Google UK English Male$/i,
      /^(Daniel|Alex|Fred)( \((Enhanced|Premium|English[^)]*)\))?$/i
    ];
    cachedBrowserVoice = preferred.map(rx=>voices.find(v=>
      /^en(?:-|_|$)/i.test(v.lang || '') && rx.test(v.name || '')
    )).find(Boolean) || null;
    return cachedBrowserVoice;
  }

  function stopBrowser(){
    if(browserUtterance){
      browserUtterance.onstart=browserUtterance.onend=browserUtterance.onerror=null;
      browserUtterance=null;
    }
    if(!browserDynamic) return;
    try{ browserSynth.cancel(); }catch(e){}
  }

  function speakBrowser(job){
    const voice=chooseBrowserVoice();
    if(!voice) { finish(false); return; }
    try{
      const utter = new BrowserUtterance(job.original);
      browserUtterance=utter;
      utter.voice = voice;
      utter.lang = voice.lang;
      /* One fixed tempo/pitch for the whole utterance. Keeping the sentence in
         one utterance is what prevents the word-to-word speed changes the old
         fragmented fallback could produce. */
      utter.rate = 0.96;
      utter.pitch = 0.92;
      utter.volume = 1;
      const complete=ok=>{
        if(current!==job) return;
        utter.onstart=utter.onend=utter.onerror=null;
        browserUtterance=null;
        finish(ok);
      };
      utter.onstart = ()=>{if(current===job)emit('portfolio-speech-start', {text:job.original, fallback:true});};
      utter.onend = ()=>complete(true);
      utter.onerror = ()=>complete(false);
      timer=setTimeout(()=>{if(current===job){stopBrowser();finish(false);}},
        Math.min(180000,15000+job.original.length*120));
      browserSynth.speak(utter);
    }catch(e){stopBrowser();finish(false);}
  }

  if(browserDynamic && browserSynth.addEventListener){
    browserSynth.addEventListener('voiceschanged', ()=>{
      cachedBrowserVoice = null;
      emit('portfolio-speech-capability',{dynamic:dynamicAvailable || !!chooseBrowserVoice()});
    });
  }
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
  function discardWorker(){
    if(worker) worker.terminate();
    worker=null;
    warmed.clear();
    warming.clear();
  }
  function prepareWorker(){
    if(worker) return;
    worker = new Worker('/speech-worker.js?v=83');
    worker.onmessage = async ({data}) => {
      if(data && (data.warmed || data.prefetch)){
        if(data.key && data.warmed) warmed.add(data.key);
        if(data.key) warming.delete(data.key);
        return;
      }
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
        if(!current || current.id !== data.id) return;
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
      discardWorker();
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
        discardWorker();
        finish(false);
      }, current.parts.length*25000+5000);
    } catch(e){ finish(false); }
  }
  function next(){
    if(current || !queue.length) return;
    current = queue.shift();
    if(current.browser) speakBrowser(current);
    else playPart();
  }
  function stop(){
    queue = [];
    stopBrowser();
    clearTimeout(timer);
    // Starting a new utterance calls stop(), even when idle. Preserve an
    // idle worker's prefetched/cached WAV instead of throwing that cache away.
    if(current) discardWorker();
    if(source){ source.onended=null; try{source.stop();source.disconnect();}catch(e){} source=null; }
    const job = current; current = null;
    if(job){
      emit('portfolio-speech-end', {text:job.original, ok:false});
      if(typeof job.done==='function'){try{job.done(false);}catch(e){console.warn(e);}}
    }
  }
  function normalizeText(text){
    return String(text || '').normalize('NFKC')
      .replace(/[’‘]/g,"'").replace(/[“”]/g,'').replace(/[—–]/g,', ')
      .replace(/\p{Extended_Pictographic}/gu,' ').replace(/[\u200d\ufe0f]/g,'')
      .replace(/\s+/g,' ').trim().slice(0,4000);
  }
  function isStatic(text, profile="robot"){
    const clean=normalizeText(text);
    return clean==='Welcome to my world!' || /^code transform[.!]?$/i.test(clean) ||
      (profile==='narration' && clean===DEFAULT_TERMINAL);
  }
  function splitParts(clean){
    const parts=[];
    let rest=clean;
    while(rest.length>440){
      const prefix=rest.slice(0,440);
      const endings=[...prefix.matchAll(/[.!?](?=\s)/g)];
      let cut=endings.length ? endings[endings.length-1].index+1 : -1;
      if(cut<160) cut=prefix.lastIndexOf(' ');
      if(cut<1) cut=440;
      parts.push(rest.slice(0,cut).trim());
      rest=rest.slice(cut).trim();
    }
    if(rest) parts.push(rest);
    return parts;
  }
  function warm(text, profile="robot"){
    if(!supported) return false;
    const clean = normalizeText(text);
    if(!clean) return false;
    // Background preparation is static-only, even on a dynamic deployment.
    if(!isStatic(clean, profile)) return false;
    const key = profile + '|' + clean;
    if(warmed.has(key) || warming.has(key)) return true;
    prepareWorker();
    warming.add(key);
    try{
      worker.postMessage({id:++serial, parts:splitParts(clean), profile, prefetch:true, key});
      return true;
    }catch(e){
      warming.delete(key);
      return false;
    }
  }
  function speak(text, interrupt, done, profile="robot"){
    const clean = normalizeText(text);
    if(!clean) return false;

    /* Dynamic Piper is best when the host has room for it. On the normal
       low-memory Render deployment, use the browser's one selected voice for
       dynamic text instead of returning false. Static bundled WAVs still go
       through the original AudioContext path so the signature welcome and
       terminal narration sound exactly as authored. */
    const useBrowser=!dynamicAvailable && !isStatic(clean,profile);
    if(useBrowser && !chooseBrowserVoice()) return false;
    if(!useBrowser){
      if(!supported) return false;
      prime();
      if(!context) return false;
    }
    if(interrupt) stop();
    if(queue.length >= 8) return false; // no unbounded public-chat backlog
    const parts = splitParts(clean);
    queue.push({id:++serial, original:clean, parts, done, profile, browser:useBrowser});
    // Resume in the initiating gesture; generation finishes after that resume.
    if(context) context.resume().then(()=>{unlocked=context.state==='running';}).catch(()=>{});
    next();
    return true;
  }
  window.Speech = {
    supported:supported || browserDynamic,
    robot:(text,interrupt,done)=>speak(text,interrupt,done,"robot"),
    plain:(text,interrupt,done)=>speak(text,interrupt,done,"narration"),
    warm, stop, isStatic,
    get dynamicSupported(){return (supported && dynamicAvailable) || !!chooseBrowserVoice();},
    get backendDynamicSupported(){return dynamicAvailable;},
    get browserFallbackSupported(){return !!chooseBrowserVoice();},
    get speaking(){return !!current || queue.length > 0;},
    get primed(){return unlocked;}
  };
  const statusController=new AbortController();
  const statusTimeout=setTimeout(()=>statusController.abort(),5000);
  fetch('/api/speech/status', {cache:'no-store',signal:statusController.signal})
    .then(r=>r.ok?r.json():{dynamic:false})
    .then(data=>{
      dynamicAvailable=!!data.dynamic;
      emit('portfolio-speech-capability',{dynamic:dynamicAvailable});
    })
    .catch(()=>emit('portfolio-speech-capability',{dynamic:false}))
    .finally(()=>clearTimeout(statusTimeout));
  document.addEventListener('visibilitychange', ()=>{if(document.hidden) stop();});
  window.addEventListener('sfx-mute', event=>{if(event.detail && event.detail.muted)stop();});
})();
