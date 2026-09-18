/* npm install --no-save playwright; npx playwright install chromium
   Then node tests/browser-regressions.cjs from the project root.
   Starts a disposable local server. Uses local database; never points at production. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const testDir=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-browser-'));
const server=spawn(process.env.PYTHON || 'python',['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8766'],{
  env:{...process.env,DATABASE_URL:'sqlite:///'+path.join(testDir,'test.db'),SPEECH_MODE:'static',DEV:'0',ADMIN_KEY:crypto.randomBytes(32).toString('hex')},
  stdio:['ignore','pipe','pipe']});
let browser;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8766/api/health')).ok)break;}catch{} await wait(100);}
  browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
    // External fonts/icons are stubbed to isolate our startup path from internet availability.
    await context.route(/^https:\/\//,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/presence',r=>r.fulfill({json:{online:1,faces:[],named:0}}));
    await page.route('**/api/settings',async r=>{
      await wait(900);
      const result=await r.fetch();
      await r.fulfill({json:{...await result.json(),favicon_url:'/test-logo.svg'}});
    });
    await page.route('**/test-logo.svg',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><path fill="red" d="M0 0h80v80H0z"/></svg>'}));
    await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('booting')),true);
    await page.screenshot({path:process.env.SCREENSHOT_DIR?`${process.env.SCREENSHOT_DIR}/loader-${mobile?'mobile':'desktop'}.png`:`/tmp/loader-${mobile?'mobile':'desktop'}.png`});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'),{},{timeout:20000});
    assert.equal(await page.locator('#viewerCount').textContent(),'1 person viewing now');
    assert.equal(await page.locator('#presenceFaces .is-anon').count(),1);
    assert.equal(await page.locator('#presenceFaces').textContent(),'');
    assert.equal(await page.locator('.pv-more').count(),0);
    assert.equal(await page.locator('#siteLogo,#siteLogoImg').count(),0);
    await page.waitForFunction(()=>document.querySelector('link[rel="icon"]').type==='image/png');
    assert.equal(await page.evaluate(async()=>{
      const img=new Image();img.src=document.querySelector('link[rel="icon"]').href;await img.decode();
      const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      return ctx.getImageData(0,0,1,1).data[3];
    }),0,'favicon corners are transparent');
    assert.equal(await page.locator('.nav-btn[aria-current="page"]').getAttribute('aria-label'),'Profile');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.evaluate(()=>{window.speechEvents=[];window.addEventListener('portfolio-speech-start',e=>speechEvents.push(e.detail));});
    const command=page.locator('#whoamiField');
    await command.fill('whoami');await command.press('Enter');
    await page.waitForFunction(()=>window.speechEvents.length>0,{},{timeout:10000});
    assert(await page.locator('.human-backdrop').evaluate(el=>el.classList.contains('revealed')));
    assert.equal(await page.locator('#whoamiSpeech').count(),0);
    assert.equal(await page.evaluate(()=>window.speechEvents[0].text),'Welcome to my world!');
    await command.fill('code');await command.press('Enter');
    assert.equal(await page.evaluate(()=>Speech.speaking),false);
    assert.equal(await page.locator('#whoamiSpeech').count(),0);
    await page.locator('#termSpeak').click();
    await page.waitForFunction(()=>window.speechEvents.length>1,{},{timeout:10000});
    await page.evaluate(()=>{Speech.stop();Speech.robot('This should be cancelled.',true);Speech.stop();});
    await wait(800);
    assert.equal(await page.evaluate(()=>Speech.speaking),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${mobile?'mobile':'desktop'}: startup, tab-only circle, viewer count, no overflow, whoami, static narration, stop, no JS errors`);
    await context.close();
  }
  const context=await browser.newContext();
  await context.route(/^https:\/\//,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage();
  await page.route('**/api/settings',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'),{},{timeout:10000});
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('booting')),false);
  console.log('PASS API failure: readable fallback opens without manual Continue');
  await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill('SIGTERM');});
