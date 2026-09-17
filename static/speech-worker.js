/* All devices receive identical synthesized robot audio from our own server. */
self.onmessage = async ({data}) => {
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 12000);
  try {
    const response = data.intro
      ? await fetch('assets/whoami-robot.wav?v=69', {signal:controller.signal})
      : await fetch('/api/speech', {method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({text:data.text,profile:data.profile || "robot"}), signal:controller.signal});
    if(!response.ok) throw new Error('Robot voice unavailable');
    const wav = await response.arrayBuffer();
    self.postMessage({id:data.id, wav},[wav]);
  }catch(error){self.postMessage({id:data.id, error:String(error.message || error)});}
  finally{clearTimeout(timeout);}
};
