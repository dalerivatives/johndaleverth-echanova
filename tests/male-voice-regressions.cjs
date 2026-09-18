const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const events=[],spoken=[],workers=[];
let voices=[{name:'Microsoft Zira Desktop - English (United States)',lang:'en-US'},{name:'Google UK English Female',lang:'en-GB'}];
const listeners={};
const synth={getVoices:()=>voices,addEventListener:(n,f)=>listeners[n]=f,cancel(){},speak:u=>spoken.push(u)};
class Worker{constructor(){this.sent=[];workers.push(this)} postMessage(v){this.sent.push(v)} terminate(){}}
class AudioContext{constructor(){this.state='running'}resume(){return Promise.resolve()}decodeAudioData(){return Promise.resolve({duration:1})}createBufferSource(){return {connect(){},disconnect(){},start(){},stop(){}}}}
const window={AudioContext,speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(t){this.text=t}},addEventListener:(n,f)=>listeners[n]=f,dispatchEvent:e=>events.push(e)};
vm.runInNewContext(fs.readFileSync('static/speech.js','utf8'),{window,Worker,AbortController,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}},document:{addEventListener(){}},fetch:async()=>({ok:true,json:async()=>({dynamic:false})}),console,setTimeout,clearTimeout,setInterval,clearInterval});
(async()=>{
 await new Promise(r=>setImmediate(r));
 const s=window.Speech;
 assert.equal(s.dynamicSupported,false);
 assert.equal(s.robot('Ana says hello',true),false,'female-only devices must not speak with a default voice');
 assert.equal(spoken.length,0);
 voices.push({name:'Unidentified English Voice',lang:'en-US'});
 assert.equal(s.robot('Hello',true),false,'unknown voice must not be assumed male');
 voices.push({name:'Microsoft David Desktop - English (United States)',lang:'en-US'});
 listeners.voiceschanged();assert(s.dynamicSupported);
 assert(s.robot('Ana says hello',true));assert.equal(spoken.length,1);
 assert.match(spoken[0].voice.name,/David/);
 let cancelled;
 assert(s.robot('Code transform.',false,ok=>cancelled=ok));
 assert.equal(workers.length,0,'static commands wait behind current browser speech');
 spoken[0].onend();assert.equal(workers.length,1);
 assert.equal(workers[0].sent[0].parts[0],'Code transform.');
 assert(s.robot('Ben says goodbye',true));assert.equal(cancelled,false,'interrupt cancels the current static command');
 assert.equal(spoken.length,2);
 s.robot('Queued',false);assert.equal(spoken.length,2,'single queue prevents simultaneous engines');
 spoken[1].onend();assert.equal(spoken.length,3);
 listeners['sfx-mute']({detail:{muted:true}});assert.equal(s.speaking,false);
 assert.equal(spoken[2].onend,null,'cancelled browser events cannot restart the queue');
 voices=[{name:'Google UK English Female',lang:'en-GB'}];listeners.voiceschanged();assert.equal(s.dynamicSupported,false);
 assert(s.isStatic('Code transform.'));
 console.log('PASS: male-only selection, missing/late voices, mixed-engine queue, interrupt, and mute');
})().catch(e=>{window.Speech.stop();console.error(e);process.exitCode=1});
