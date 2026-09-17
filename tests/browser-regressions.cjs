/* npm install --no-save playwright; npx playwright install chromium
   Then node tests/browser-regressions.cjs from the project root.
   Starts a disposable local server. Uses local database; never points at production. */
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const server=spawn(process.env.PYTHON || 'python',['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8766'],{stdio:['ignore','pipe','pipe']});
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
    await page.route('**/api/settings',async r=>{await wait(900);await r.continue();});
    await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('booting')),true);
    await page.screenshot({path:process.env.SCREENSHOT_DIR?`${process.env.SCREENSHOT_DIR}/loader-${mobile?'mobile':'desktop'}.png`:`/tmp/loader-${mobile?'mobile':'desktop'}.png`});
    await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'),{},{timeout:20000});
    assert.equal(await page.locator('#viewerCount').textContent(),'1 person viewing now');
    assert.equal(await page.locator('#presenceFaces .is-anon').count(),1);
    assert.equal(await page.locator('#presenceFaces').textContent(),'');
    assert.equal(await page.locator('.pv-more').count(),0);
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
    await page.evaluate(()=>Speech.plain('Robot voice testing.',true));
    await page.waitForFunction(()=>window.speechEvents.length>1,{},{timeout:10000});
    await page.evaluate(()=>{Speech.stop();Speech.robot('This should be cancelled.',true);Speech.stop();});
    await wait(800);
    assert.equal(await page.evaluate(()=>Speech.speaking),false);
    assert.deepEqual(errors,[]);
    console.log(`PASS ${mobile?'mobile':'desktop'}: gated startup, circle/count, no overflow, whoami, dynamic speech, stop, no JS errors`);
    await context.close();
  }
  const context=await browser.newContext();
  await context.route(/^https:\/\//,r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const page=await context.newPage();
  await page.route('**/api/settings',r=>r.fulfill({status:503,body:'Unavailable'}));
  await page.goto('http://127.0.0.1:8766/',{waitUntil:'domcontentloaded'});
  await page.locator('#bootContinue').waitFor({state:'visible',timeout:25000});
  assert(await page.locator('html').evaluate(el=>el.classList.contains('booting')));
  await page.locator('#bootContinue').click();
  assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('booting')),false);
  console.log('PASS API failure: loader retains gate and Continue releases it');
  await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.kill('SIGTERM');});
