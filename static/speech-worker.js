/* Prepare and cache voice audio so playback can start immediately once asked. */
const cache=new Map();

async function getWav(text, profile){
  const key=(profile || 'robot')+'|'+text;
  let wav=cache.get(key);
  if(!wav){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=text==='Welcome to my world!'
        ? await fetch('assets/whoami-robot.wav?v=70',{signal:controller.signal})
        : await fetch('/api/speech',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({text,profile:profile || 'robot'}),
            signal:controller.signal
          });
      if(!response.ok) throw new Error('Voice temporarily unavailable');
      wav=await response.arrayBuffer();
      cache.set(key,wav.slice(0));
      if(cache.size>12) cache.delete(cache.keys().next().value);
    } finally { clearTimeout(timer); }
  }
  return {key,wav:wav.slice(0)};
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
    self.postMessage({id:data.id,error:String(error.message || error)});
  }
};
