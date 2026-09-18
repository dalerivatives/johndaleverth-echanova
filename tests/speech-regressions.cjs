const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const workers=[],events=[];
class Worker {
  constructor(){workers.push(this);this.sent=[];}
  postMessage(data){this.sent.push(data);}
  terminate(){this.terminated=true;}
}
let sources=[];
class AudioContext {
  constructor(){this.state='running';}
  resume(){return Promise.resolve();}
  decodeAudioData(){return Promise.resolve({duration:1,length:22050,sampleRate:22050,getChannelData:()=>new Float32Array(22050)});}
  createBuffer(channels,length,rate){return {duration:length/rate,copyToChannel(){}};}
  createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(s);return s;}
}
const window={AudioContext,addEventListener(){},dispatchEvent(e){events.push(e);}};
const dynamicStatus=()=>Promise.resolve({ok:true,json:()=>Promise.resolve({dynamic:true})});
const sandbox={window,Worker,AbortController,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},document:{addEventListener(){}},console,setTimeout,clearTimeout,fetch:dynamicStatus};
vm.runInNewContext(fs.readFileSync('static/speech.js','utf8'),sandbox);
(async()=>{
  await new Promise(r=>setImmediate(r));
  const speech=window.Speech;let done=[];
  assert(speech.robot('Hello.',true,ok=>done.push(ok)));
  let w=workers.at(-1),id=w.sent[0].id;
  await w.onmessage({data:{id,wav:new ArrayBuffer(8)}});
  assert(sources.at(-1).started);assert(speech.speaking);
  sources.at(-1).onended();assert.equal(speech.speaking,false);assert.deepEqual(done,[true]);
  speech.robot('Stop this.',true);w=workers.at(-1);id=w.sent.at(-1).id;
  speech.stop();const before=sources.length;
  await w.onmessage({data:{id,wav:new ArrayBuffer(8)}});
  assert.equal(sources.length,before);assert(!speech.speaking);
  speech.robot('Old message.',true,ok=>done.push(ok));const old=workers.at(-1),oldId=old.sent.at(-1).id;
  speech.robot('Replacement.',true);const latest=workers.at(-1),newId=latest.sent.at(-1).id;
  await old.onmessage({data:{id:oldId,wav:new ArrayBuffer(8)}});assert.equal(sources.length,before);
  await latest.onmessage({data:{id:newId,wav:new ArrayBuffer(8)}});assert(sources.at(-1).started);
  speech.stop();
  speech.robot('Unavailable.',true,ok=>done.push(ok));w=workers.at(-1);id=w.sent.at(-1).id;
  await w.onmessage({data:{id,error:'Offline'}});assert(!speech.speaking);assert.equal(done.at(-1),false);
  assert.equal(speech.robot(' ',true),false);
  speech.robot('A long buffered utterance.',true);
  w=workers.at(-1);id=w.sent.at(-1).id;
  const countBefore=sources.length;
  await w.onmessage({data:{id,wavs:[new ArrayBuffer(8),new ArrayBuffer(8)]}});
  assert.equal(sources.length,countBefore+1);
  assert.equal(sources.at(-1).buffer.duration,2);
  sources.at(-1).onended();assert(!speech.speaking);

  const paragraph="Hello world. I am Dale, a computer engineer, full stack developer and inventor who enjoys building software and turning creative ideas into useful projects. This paragraph should keep its natural sentence flow.";
  speech.plain(paragraph,true);
  assert.equal(workers.at(-1).sent.at(-1).parts.join(""),paragraph);
  assert.equal(workers.at(-1).sent.at(-1).profile,'narration');
  speech.stop();

  speech.robot('one',false);for(let i=0;i<8;i++)assert(speech.robot('queued',false));
  assert.equal(speech.robot('over limit',false),false);speech.stop();

  // --- Regression: "first tap does nothing" ---------------------------
  // An AudioContext is born suspended and resume() is asynchronous, so the
  // worker's audio can come back before the context has actually flipped to
  // 'running' — exactly the class of bug sfx.js documents fixing for UI
  // sound. This must still play on the ONE call, with no second tap needed.
  // A fresh vm context is used because the module-level `context` variable
  // is created once and reused for the rest of this file's tests.
  await (async()=>{
    const workers2=[],sources2=[];
    class Worker2 {
      constructor(){workers2.push(this);this.sent=[];}
      postMessage(data){this.sent.push(data);}
      terminate(){this.terminated=true;}
    }
    class SlowAudioContext {
      constructor(){this.state='suspended';}
      resume(){
        // The promise can resolve well before the state actually flips —
        // real browsers do this — so it must never be treated as "final".
        setTimeout(()=>{this.state='running';},10);
        return Promise.resolve();
      }
      decodeAudioData(){return Promise.resolve({duration:1,length:22050,sampleRate:22050,getChannelData:()=>new Float32Array(22050)});}
      createBuffer(channels,length,rate){return {duration:length/rate,copyToChannel(){}};}
      createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources2.push(s);return s;}
    }
    const window2={AudioContext:SlowAudioContext,addEventListener(){},dispatchEvent(){}};
    const sandbox2={window:window2,Worker:Worker2,AbortController,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},document:{addEventListener(){}},console,setTimeout,clearTimeout,setInterval,clearInterval,fetch:dynamicStatus};
    vm.runInNewContext(fs.readFileSync('static/speech.js','utf8'),sandbox2);
    await new Promise(r=>setImmediate(r));
    const speech2=window2.Speech;
    let result;
    assert(speech2.robot('One tap.',true,ok=>{result=ok;}));
    const w2=workers2.at(-1),id2=w2.sent[0].id;
    await w2.onmessage({data:{id:id2,wav:new ArrayBuffer(8)}});
    assert(sources2.at(-1) && sources2.at(-1).started,'audio must start on the first call even though the context was still suspended when the response arrived');
    sources2.at(-1).onended();
    assert.equal(result,true);
  })();

  assert.equal(speech.warm('Never synthesize this automatically'),false);
  assert(speech.warm('Welcome to my world!'));
  const prefetched=workers.at(-1);
  const prefetch=prefetched.sent.at(-1);
  await prefetched.onmessage({data:{id:prefetch.id,warmed:true,key:prefetch.key}});
  speech.robot('Welcome to my world!',true);
  assert.equal(workers.at(-1),prefetched,'starting idle playback must preserve the cached worker');
  assert(!prefetched.terminated);
  speech.stop();
  assert(speech.warm('Welcome to my world!'));
  assert.notEqual(workers.at(-1),prefetched,'cancellation must clear the old warmed bookkeeping');
  const failed=workers.at(-1), warmRequest=failed.sent.at(-1);
  await failed.onmessage({data:{id:warmRequest.id,prefetch:true,key:warmRequest.key,error:'offline'}});
  const beforeRetry=failed.sent.length;
  speech.warm('Welcome to my world!');
  assert.equal(failed.sent.length,beforeRetry+1,'failed prefetch is retryable');
  console.log('PASS: playback lifecycle, cancellation, queue, first tap, cache reuse, safe prefetch, and retry');
})().catch(e=>{console.error(e);window.Speech.stop();process.exitCode=1;});
