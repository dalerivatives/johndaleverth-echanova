const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync('static/loader.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function setup({badImage=false,hiddenImage=false,slowFonts=false}={}){
 const nodes=Object.fromEntries(['bootScreen','bootStatus','bootBar','bootActions','bootContinue','bootRetry'].map(id=>[id,{id,style:{},hidden:true,contains:()=>false}]));
 const content={id:'app',tagName:'DIV',dataset:{},inert:false,removeAttribute(){delete this.dataset.bootInert;}};
 const classes=new Set(),listeners={},timers=[],events=[];
 let imageDecodes=0;
 const img={loading:hiddenImage?'lazy':'auto',closest:()=>null,decode:()=>{imageDecodes++;return badImage?Promise.reject(Error('image')):new Promise(()=>{});}};
 const doc={readyState:'complete',images:badImage||hiddenImage?[img]:[],fonts:{ready:slowFonts?new Promise(()=>{}):Promise.resolve()},
  documentElement:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},body:{children:[nodes.bootScreen,content]},
  getElementById:id=>nodes[id],querySelectorAll:()=>content.inert?[content]:[],addEventListener:(name,fn)=>listeners[name]=fn};
 const window={addEventListener:(n,fn)=>listeners[n]=fn,dispatchEvent:e=>events.push(e)};
 vm.runInNewContext(code,{window,document:doc,Promise,setTimeout:(fn,ms)=>{if(ms===300){fn();return 0;}timers.push({fn,ms});return timers.length;},clearTimeout:id=>{if(timers[id-1])timers[id-1].cleared=true;},Event:class{constructor(type){this.type=type;}},location:{reload(){}}});
 return {nodes,content,classes,window,events,img,timers,decodes:()=>imageDecodes,dom:()=>listeners.DOMContentLoaded(),run:()=>timers.find(t=>t.ms===0).fn(),deadline:()=>timers.find(t=>t.ms===7000).fn(),critical:()=>listeners.error({target:{hasAttribute:()=>true}})};
}
(async()=>{
 let s=setup(),release;
 s.window.PortfolioBoot.track(new Promise(r=>release=r),'Content');s.dom();s.run();await tick();
 assert(s.classes.has('booting'));assert(s.content.inert);release();await tick();await tick();
 assert(!s.classes.has('booting'));assert(!s.content.inert);assert(s.nodes.bootScreen.hidden);
 s=setup();s.window.PortfolioBoot.track(Promise.reject(Error('offline')),'Settings');s.dom();s.run();await tick();await tick();await tick();
 assert(!s.classes.has('booting'));assert(s.nodes.bootScreen.hidden);
 s=setup({badImage:true});s.dom();s.run();await tick();await tick();await tick();assert(!s.classes.has('booting'));assert(s.nodes.bootScreen.hidden);
 s=setup({hiddenImage:true});s.dom();s.run();await tick();await tick();
 assert(!s.classes.has('booting'));assert.equal(s.decodes(),0);assert.equal(s.img.loading,'lazy');
 s=setup({slowFonts:true});s.window.PortfolioBoot.track(new Promise(()=>{}),'offline');s.dom();s.run();
 s.deadline();assert(!s.classes.has('booting'));assert(!s.content.inert);
 s.nodes.bootContinue.onclick();assert.equal(s.events.length,1,'release event fires once');
 s=setup();s.dom();s.critical();s.run();await tick();await tick();
 assert(s.classes.has('booting'));assert.equal(s.nodes.bootActions.hidden,false);
 s.nodes.bootContinue.onclick();assert(!s.classes.has('booting'));
 s=setup();s.dom();s.run();await tick();await tick();
 assert(s.timers.filter(t=>t.ms===3500||t.ms===7000).every(t=>t.cleared),'completed timers cleaned up');
 console.log('PASS: readiness, offline fallback, lazy images, global deadline, critical recovery, timer cleanup, one release');
})().catch(e=>{console.error(e);process.exitCode=1;});
