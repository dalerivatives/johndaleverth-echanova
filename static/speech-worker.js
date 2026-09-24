/* Prepare and cache voice audio so playback can start immediately once asked. */
const cache=new Map();
const pending=new Map();

/* The default narration, the whoami welcome and "code transform" are
   pre-recorded (assets/*.mp3); only other text is synthesised on demand. */
const DEFAULT_TERMINAL = "Hello World. I'm Dale , a Computer Engineer, Full Stack Developer, Inventor, who enjoys building codes and turning out of the blue ideas into Output";
function canonical(text){
  return String(text || '').normalize('NFKC')
    .replace(/[’‘]/g,"'").replace(/[“”]/g,'').replace(/[—–]/g,', ')
    .replace(/\s+/g,' ').trim();
}

async function getWav(text, profile){
  const key=(profile || 'robot')+'|'+text;
  let wav=cache.get(key);
  if(!wav){
    if(!pending.has(key)){
      pending.set(key,loadWav(text,profile).then(buffer=>{
        cache.set(key,buffer);
        if(cache.size>12) cache.delete(cache.keys().next().value);
        return buffer;
      }).finally(()=>pending.delete(key)));
    }
    // Hover-prefetch and click can overlap; only fetch the WAV once.
    wav=await pending.get(key);
  }
  return {key,wav:wav.slice(0)};
}

async function loadWav(text,profile){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    try{
      const normalized=canonical(text);
      /* MP3, not WAV. These three are pre-rendered speech shipped with the
         site, and as WAV they were 516KB of uncompressed PCM — more than
         every script on the page combined. At 56kbps mono they are 83KB and
         measure at 0.998 correlation against the originals, which is well
         past the point where anyone could hear a difference in a robot
         voice. decodeAudioData handles MP3 in every browser that can run
         the Web Audio API at all, so nothing else had to change.

         Speech generated on demand for arbitrary text still comes back from
         /api/speech as WAV; there is nothing to gain by compressing
         something that is produced once and thrown away. */
      const staticUrl=/^code transform[.!]?$/i.test(normalized)
        ? '/assets/code-transform.mp3?v=106'
        : text==='Welcome to my world!'
        ? '/assets/whoami-robot.mp3?v=106'
        : (profile==='narration' && normalized===DEFAULT_TERMINAL
          ? '/assets/voice-preview.mp3?v=106' : '');
      const response=staticUrl
        ? await fetch(staticUrl,{signal:controller.signal})
        : await fetch('/api/speech',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({text,profile:profile || 'robot'}),
            signal:controller.signal
          });
      if(!response.ok) throw new Error('Voice temporarily unavailable');
      return await response.arrayBuffer();
    } finally { clearTimeout(timer); }
}

self.onmessage=async ({data})=>{
  try{
    if(data.prefetch){
      for(const text of data.parts || []) await getWav(text, data.profile);
      self.postMessage({id:data.id,warmed:true,key:data.key || null});
      return;
    }
    const wavs=[];
    for(const text of data.parts || []){
      const item=await getWav(text, data.profile);
      wavs.push(item.wav);
    }
    self.postMessage({id:data.id,wavs},wavs);
  }catch(error){
    self.postMessage({id:data.id,error:String(error.message || error),prefetch:!!data.prefetch,key:data.key || null});
  }
};
