const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('static/loader.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup({badImage=false}={}){
 const nodes=Object.fromEntries(['bootScreen','bootStatus','bootBar','bootActions','bootContinue','bootRetry'].map(id=>[id,{id,style:{},hidden:true}]));
 const content={id:'app',tagName:'DIV',dataset:{},inert:false,removeAttribute(){delete this.dataset.bootInert;}};
 const classes=new Set(),listeners={},timers=[];
 const doc={readyState:'complete',images:badImage?[{decode:()=>Promise.reject(Error('image'))}]:[],fonts:{ready:Promise.resolve()},
  documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},body:{children:[nodes.bootScreen,content]},
  getElementById:id=>nodes[id],querySelectorAll:()=>content.inert?[content]:[],addEventListener:(name,fn)=>listeners[name]=fn};
 const window={addEventListener(){},dispatchEvent(){}};
 vm.runInNewContext(code,{window,document:doc,Promise,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){},requestAnimationFrame:fn=>fn(),Event:class{},fetch:()=>Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve(new ArrayBuffer(8))}),location:{reload(){}}});
 return {nodes,content,classes,window,dom:()=>listeners.DOMContentLoaded(),run:()=>timers.find(t=>t.ms===0).fn(),deadline:()=>timers.find(t=>t.ms===20000).fn()};
}
(async()=>{
 let s=setup(),release;
 s.window.PortfolioBoot.track(new Promise(r=>release=r),'Content');s.dom();s.run();await tick();
 assert(s.classes.has('booting'));assert(s.content.inert);release();await tick();await tick();
 assert(!s.classes.has('booting'));assert(!s.content.inert);assert(s.nodes.bootScreen.hidden);
 s=setup();s.window.PortfolioBoot.track(Promise.reject(Error('offline')),'Settings');s.dom();s.run();await tick();await tick();
 assert(s.classes.has('booting'));assert.equal(s.nodes.bootActions.hidden,false);s.nodes.bootContinue.onclick();assert(!s.classes.has('booting'));
 s=setup({badImage:true});s.dom();s.run();await tick();await tick();assert.equal(s.nodes.bootActions.hidden,false);assert(s.classes.has('booting'));
 s=setup();s.dom();s.deadline();assert.equal(s.nodes.bootActions.hidden,false);s.nodes.bootContinue.onclick();assert(!s.classes.has('booting'));
 console.log('PASS: pending content gate, readiness release, API failure recovery, image failure recovery, timeout Continue');
})().catch(e=>{console.error(e);process.exitCode=1;});
