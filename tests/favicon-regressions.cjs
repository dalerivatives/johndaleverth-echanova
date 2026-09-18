// Real PNG/alpha checks using the same Canvas API as the browser.
// Development dependency: npm install --no-save @napi-rs/canvas
const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
let canvas;
try{canvas=require('@napi-rs/canvas');}catch(error){
  if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES) throw error;
  canvas=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');
}
const {createCanvas,Image,loadImage}=canvas;
const link={removeAttribute(name){delete this[name];}};
const events={},changes=[];
const document={querySelector:()=>link,createElement:tag=>{
  assert.equal(tag,'canvas');return createCanvas(64,64);
}};
const window={addEventListener:(name,fn)=>events[name]=fn};
vm.runInNewContext(fs.readFileSync('static/favicon.js','utf8'),{
  window,document,Image,encodeURIComponent,setTimeout,clearTimeout,AbortController,
  localStorage:{setItem:(key,value)=>changes.push({key,value})},
  fetch:async()=>({ok:true,json:async()=>({favicon_url:''})})
});
const icon=window.PortfolioFavicon;
function fixture(){
  const c=createCanvas(120,80),ctx=c.getContext('2d');
  ctx.fillStyle='blue';ctx.fillRect(0,0,120,80);
  ctx.fillStyle='red';ctx.fillRect(20,0,80,80);
  return c.toDataURL('image/png');
}
(async()=>{
  const source=fixture();
  const png=await icon.apply(source,{broadcast:true});
  assert(png.startsWith('data:image/png;'));
  assert.equal(link.type,'image/png');assert.equal(link.sizes,'64x64');
  const c=createCanvas(64,64),ctx=c.getContext('2d');
  ctx.drawImage(await loadImage(png),0,0);
  const pixel=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
  for(const [x,y] of [[0,0],[63,0],[0,63],[63,63]]) assert.equal(pixel(x,y)[3],0);
  assert.deepEqual(pixel(32,32),[255,0,0,255]);
  assert.deepEqual(pixel(5,32),[255,0,0,255],'centre crop excludes blue side edges');
  assert.equal(changes.length,1);
  assert.equal(await icon.apply(source),png,'repeated icon uses cached conversion');
  const stale=icon.apply(source);
  await icon.apply('');await stale;
  assert.equal(link.type,'image/svg+xml','old image cannot undo a removal');
  assert(!decodeURIComponent(link.href).includes('<rect'),'no default square icon');
  assert.equal(await icon.apply('data:image/png;base64,invalid'),null);
  events.storage({key:'portfolio-tab-icon-change',newValue:JSON.stringify({url:source})});
  for(let i=0;i<30&&link.type!=='image/png';i++) await new Promise(r=>setTimeout(r,10));
  assert.equal(link.type,'image/png','saved icon updates other tabs');
  for(const page of ['static/index.html','static/editor.html']){
    const html=fs.readFileSync(page,'utf8');
    assert(html.includes('favicon.js?v=80'));
    assert(!html.includes('id="siteLogo"'));assert(!html.includes('id="siteLogoImg"'));
  }
  assert(!fs.readFileSync('static/script.js','utf8').includes('siteLogo'));
  console.log('PASS: circular PNG, transparent corners, centre crop, clear/race/error, cross-tab update, tab-only markup');
})().catch(error=>{console.error(error);process.exitCode=1;});
