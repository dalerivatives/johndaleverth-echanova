/* Prepare every part before playback: network delays cannot split an utterance. */
const cache=new Map();
self.onmessage=async ({data})=>{
  try{
    const wavs=[];
    for(const text of data.parts){
      const key=(data.profile || 'robot')+'|'+text;
      let wav=cache.get(key);
      if(!wav){
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),25000);
        try{
          const response=text==='Welcome to my world!'
            ? await fetch('assets/whoami-robot.wav?v=70',{signal:controller.signal})
            : await fetch('/api/speech',{method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({text,profile:data.profile || 'robot'}),signal:controller.signal});
          if(!response.ok) throw new Error('Voice temporarily unavailable');
          wav=await response.arrayBuffer();
          cache.set(key,wav.slice(0));
          if(cache.size>8) cache.delete(cache.keys().next().value);
        }finally{clearTimeout(timer);}
      }else{wav=wav.slice(0);}
      wavs.push(wav);
    }
    self.postMessage({id:data.id,wavs},wavs);
  }catch(error){self.postMessage({id:data.id,error:String(error.message || error)});}
};
