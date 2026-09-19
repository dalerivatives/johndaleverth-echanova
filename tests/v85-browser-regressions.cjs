const {chromium}=require('playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-v85-'));
const server=spawn(process.env.PYTHON||'python',['-m','uvicorn','backend.main:app','--port','8768'],{env:{...process.env,DATABASE_URL:'sqlite:///'+path.join(tmp,'test.db'),SPEECH_MODE:'static',ADMIN_KEY:'local-test-only'},stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8768/api/health')).ok)break}catch{}await wait(100)}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await context.route(/^https:\/\//,r=>r.fulfill({body:''}));
 await context.addInitScript(()=>{Object.defineProperty(window,'speechSynthesis',{value:{getVoices:()=>[],cancel(){},addEventListener(){}}});Object.defineProperty(navigator,'deviceMemory',{value:2});});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8768/');await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
 await page.waitForFunction(()=>Speech.backendDynamicSupported);
 await page.evaluate(()=>{window.events=[];addEventListener('portfolio-speech-start',e=>events.push(e.detail));});
 await page.locator('#whoamiField').tap();
 await page.waitForFunction(()=>Speech.primed);
 const response=page.waitForResponse(r=>r.url().endsWith('/api/speech')&&r.status()===200);
 await page.evaluate(()=>Speech.robot('Mobile chat works without installed browser voices.',true));
 await response;await page.waitForFunction(()=>events.some(e=>e.text.startsWith('Mobile chat works')));
 await page.evaluate(()=>{Speech.stop();window.commandCalls=[];Speech.robot=(text)=>{commandCalls.push(text);return true};Speech.plain=Speech.robot;SFX.muted=false;});
 const field=page.locator('#whoamiField');
 for(const cmd of ['code','code','whoami','code','code']){await field.fill(cmd);await field.press('Enter');}
 assert.equal(await page.evaluate(()=>commandCalls.filter(x=>x==='Code transform.').length),1);
 for(const theme of ['mono-light','colour-light','cyber','ocean','violet','amber','colour-dark','mono-dark']){
  await page.evaluate(t=>setMode(t),theme);
  const state=await page.evaluate(()=>{const art=document.querySelector('#asciiArt'),c=getComputedStyle(art);const probe=document.createElement('i');probe.style.color='var(--accent)';art.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return {color:c.backgroundColor,accent,mask:c.maskImage,gradients:[...document.querySelectorAll('*')].filter(el=>/gradient\(/.test(getComputedStyle(el).backgroundImage)).map(el=>el.className)}});
  assert.equal(state.color,state.accent,theme);assert(state.mask.includes('human-coded-exact-contour'));assert.deepEqual(state.gradients,[],theme);
 }
 assert(await page.evaluate(()=>PortfolioPerformance.lite));
 assert(await page.locator('.code-field .code').count()<=8);assert(await page.locator('.bg-graph').count()<=1);
 const before=await page.locator('.graph-field').innerHTML();await wait(250);assert.notEqual(await page.locator('.graph-field').innerHTML(),before);
 await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR||tmp,'v85-mobile.png')});
 await page.evaluate(()=>{
  window.renderCount=0;
  const Original=THREE.WebGLRenderer;
  THREE.WebGLRenderer=class extends Original{constructor(...args){super(...args);const render=this.render.bind(this);this.render=(...a)=>{renderCount++;return render(...a)}}};
  const host=document.createElement('div');host.id='testRobot';host.style.cssText='position:fixed;top:0;left:0;width:320px;height:240px;z-index:99999';document.body.append(host);
  if(!Robot3D.mount(host))throw Error('3D failed on low-memory mobile');
 });
 await page.waitForFunction(()=>renderCount>3);
 assert.equal(await page.locator('#testRobot canvas').count(),1);
 await page.locator('#testRobot').evaluate(el=>el.style.display='none');await wait(150);
 const stopped=await page.evaluate(()=>renderCount);await wait(250);assert.equal(await page.evaluate(()=>renderCount),stopped);
 await page.locator('#testRobot').evaluate(el=>el.style.display='block');await page.waitForFunction(n=>renderCount>n,stopped);
 console.log('PASS: real WebGL robot on low-memory mobile, off-screen pause and resume');
 assert.deepEqual(errors,[]);
 console.log('PASS: touch unlock, real server male speech with no browser voices, no repeated code speech, theme-colored mask, no gradients, animated low-end decorations, no JS errors');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.kill('SIGTERM')});
