const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('static/script.js','utf8');
const slice=(from,to)=>source.slice(source.indexOf(from),source.indexOf(to,source.indexOf(from)));
const tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
  // A slow body is cancelled too, not just the initial fetch.
  const timers=[];
  const api={AbortController,Error,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:id=>timers[id-1].cleared=true,
    fetch:async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))})};
  vm.runInNewContext(slice('async function fetchContentJson','async function applySiteSettings'),api);
  const pending=api.fetchContentJson('/api/settings');
  await tick();timers[0].fn();await assert.rejects(pending,/aborted/);
  assert(timers[0].cleared);

  const retry={addEventListener:(name,fn)=>retry.click=fn};
  const container={dataset:{section:'project'},attrs:{},innerHTML:'',setAttribute(name,value){this.attrs[name]=value;},querySelector:()=>retry};
  let calls=0,resolveRequest;
  const cms={window:{PortfolioBoot:{fail(){}}},escapeHtml:x=>x,
    fetchContentJson:async()=>{calls++;if(calls===1)throw Error('offline');return new Promise(resolve=>resolveRequest=resolve);}};
  vm.runInNewContext(slice('  async function loadCmsSection','  function init(){'),cms);
  await cms.loadCmsSection(container);
  assert(container.innerHTML.includes('Retry this section'));
  assert.equal(container.attrs['aria-busy'],'false');
  const retrying=retry.click();await tick();
  await cms.loadCmsSection(container);assert.equal(calls,2,'repeated retry while loading is ignored');
  resolveRequest([]);await retrying;
  assert(container.innerHTML.includes('Nothing here yet.'));
  assert.equal(container.attrs['aria-busy'],'false');

  // Every existing dial mode still maps to the editor's original palette.
  const editor=fs.readFileSync('static/editor.js','utf8');
  const themeCode=editor.slice(editor.indexOf('const EDITOR_THEME_CLASSES'),editor.indexOf('function escapeHtml'));
  const modes={
    'mono-light':['light-mode','mono-mode'],'colour-light':['light-mode'],auto:[],
    cyber:['cyber-mode'],ocean:['ocean-mode'],violet:['violet-mode'],amber:['amber-mode'],
    'colour-dark':['dark-mode'],'mono-dark':['dark-mode','mono-mode']
  };
  for(const [mode,expected] of Object.entries(modes)){
    const classes=new Set(),body={dataset:{},classList:{add:(...xs)=>xs.forEach(x=>classes.add(x)),remove:x=>classes.delete(x)}};
    const env={localStorage:{getItem:k=>k==='portfolio-mode'?mode:null},window:{matchMedia:()=>({matches:false,addEventListener(){}}),addEventListener(){}},document:{body,addEventListener(){}}};
    vm.runInNewContext(themeCode,env);
    assert.deepEqual([...classes],expected,mode+' editor palette must be preserved');
  }
  console.log('PASS: JSON body timeout, in-place content retry, duplicate-request guard, all nine editor palettes');
})().catch(error=>{console.error(error);process.exitCode=1;});
