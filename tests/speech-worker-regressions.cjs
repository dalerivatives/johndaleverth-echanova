const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const calls=[],messages=[];
let respond,fail=false;
const sandbox={Map,AbortController,setTimeout,clearTimeout,
  fetch:async(url,opts)=>{
    calls.push({url,opts});
    if(fail) throw new Error('offline');
    if(respond) await new Promise(resolve=>{respond=resolve;});
    return {ok:true,arrayBuffer:async()=>new ArrayBuffer(8)};
  },
  self:{postMessage:data=>messages.push(data)}
};
vm.runInNewContext(fs.readFileSync('static/speech-worker.js','utf8'),sandbox);
const send=data=>sandbox.self.onmessage({data});
(async()=>{
  const text="Hello World. I'm Dale , a Computer Engineer, Full Stack Developer, Inventor, who enjoys building codes and turning out of the blue ideas into Output";
  respond=true;
  const warm=send({id:1,parts:[text],profile:'narration',prefetch:true,key:'narration|'+text});
  const play=send({id:2,parts:[text],profile:'narration'});
  assert.equal(calls.length,1,'prefetch and click share one request');
  respond();respond=null;await warm;await play;
  assert.equal(calls[0].url,'/assets/voice-preview.wav?v=80');
  assert(messages.find(x=>x.warmed));assert(messages.find(x=>x.id===2).wavs[0].byteLength===8);
  await send({id:3,parts:[text],profile:'narration'});
  assert.equal(calls.length,1,'repeat playback uses cached WAV');
  fail=true;
  await send({id:4,parts:['Welcome to my world!'],prefetch:true,key:'welcome'});
  assert(messages.at(-1).prefetch);assert.equal(messages.at(-1).key,'welcome');
  fail=false;
  await send({id:5,parts:['Welcome to my world!']});
  assert.equal(calls.at(-1).url,'/assets/whoami-robot.wav?v=80');
  await send({id:6,parts:['Manual dynamic speech'],profile:'robot'});
  assert.equal(calls.at(-1).url,'/api/speech');
  console.log('PASS: static WAV routing, prefetch deduplication, cache, failure retry, dynamic routing');
})().catch(error=>{console.error(error);process.exitCode=1;});
