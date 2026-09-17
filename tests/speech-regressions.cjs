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
  decodeAudioData(){return Promise.resolve({duration:1});}
  createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(s);return s;}
}
const window={AudioContext,addEventListener(){},dispatchEvent(e){events.push(e);}};
const sandbox={window,Worker,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},document:{addEventListener(){}},console,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('static/speech.js','utf8'),sandbox);
(async()=>{
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
  const paragraph="Hello world. I am Dale, a computer engineer, full stack developer and inventor who enjoys building software and turning creative ideas into useful projects. This paragraph should keep its natural sentence flow.";
  speech.plain(paragraph,true);
  assert.equal(workers.at(-1).sent.at(-1).text,paragraph);
  assert.equal(workers.at(-1).sent.at(-1).profile,'narration');
  speech.stop();

  speech.robot('one',false);for(let i=0;i<8;i++)assert(speech.robot('queued',false));
  assert.equal(speech.robot('over limit',false),false);speech.stop();
  console.log('PASS: playback lifecycle, completion, cancellation, stale response, interruption, error, empty input, bounded queue');
})().catch(e=>{console.error(e);window.Speech.stop();process.exitCode=1;});
