/* Set PYTHON and optional CHROMIUM_PATH, then run from the project root.
   Uses disposable SQLite. Screenshots are written only to SCREENSHOT_DIR. */
const {chromium}=require('playwright'),sharp=require('sharp');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'portfolio-profile-'));
const server=spawn(process.env.PYTHON||'python',['-m','uvicorn','backend.main:app','--host','127.0.0.1','--port','8767'],{env:{...process.env,DATABASE_URL:'sqlite:///'+path.join(temp,'test.db'),ADMIN_KEY:crypto.randomBytes(32).toString('hex'),SPEECH_MODE:'static',DEV:'0'},stdio:'ignore'});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
(async()=>{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8767/api/health')).ok)break}catch{}await wait(100)}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({reducedMotion:'reduce',colorScheme:'dark'});
 await context.route(/^https:\/\//,r=>r.fulfill({status:200,body:''}));
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8767/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!document.documentElement.classList.contains('booting'));
 await page.evaluate(()=>{SFX.muted=true;});
 const themes=['mono-light','colour-light','auto','cyber','ocean','violet','amber','colour-dark','mono-dark'];
 if(process.env.SCREENSHOT_DIR)fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});
 for(const width of [320,390,768,1024,1440]){
  await page.setViewportSize({width,height:1000});
  for(const theme of themes){
   await page.evaluate(t=>setMode(t),theme);
   for(const revealed of [false,true]){
    const field=page.locator('#whoamiField');
    await field.fill(revealed?'whoami':'code');await field.press('Enter');
    await wait(25);
    const state=await page.evaluate(()=>{
     const $=s=>document.querySelector(s),r=s=>{const a=$(s).getBoundingClientRect();return {x:a.x,y:a.y,width:a.width,height:a.height,right:a.right,bottom:a.bottom}};
     return {code:r('#asciiArt'),photo:r('#realPortrait'),hero:r('.hero'),text:r('.identity'),
      parentOpacity:getComputedStyle($('.human-backdrop')).opacity,
      photoOpacity:getComputedStyle($('#realPortrait')).opacity,
      codeOpacity:getComputedStyle($('#asciiArt')).opacity,
      glow:getComputedStyle($('.human-backdrop'),'::before').backgroundImage,
      overflow:document.documentElement.scrollWidth>innerWidth};
    });
    assert.deepEqual(state.code,state.photo,`${width}/${theme}: identical portrait frame`);
    assert.equal(state.overflow,false,`${width}/${theme}: horizontal overflow`);
    assert.equal(state.parentOpacity,'1');
    assert.equal(state.photoOpacity,revealed?'1':'0');assert.equal(state.codeOpacity,revealed?'0':'1');
    assert.match(state.glow,/radial-gradient/);
    const faceLeft=state.photo.x+state.photo.width*.303;
    assert(state.text.right<=faceLeft,`${width}/${theme}: identity clears the face`);
    assert(state.photo.y+state.photo.height*.114>=state.hero.y,`${width}/${theme}: hair is not clipped`);
    assert(state.photo.x+state.photo.width*.91<=state.hero.right,`${width}/${theme}: shoulder stays inside hero`);
    if(process.env.SCREENSHOT_DIR && (width===390 || (width===1440 && theme==='cyber'))){
     await page.locator('.hero').screenshot({path:path.join(process.env.SCREENSHOT_DIR,`${width}-${theme}-${revealed?'photo':'code'}.png`)});
    }
    // Force deliberately bright decoration behind the subject, then switch
    // its colour. The face interior must be pixel-identical in BOTH states.
    if(width===390){
     const style=await page.addStyleTag({content:'.code-field,.graph-field{background:#ff0000!important;opacity:1!important}.code-field>*{visibility:hidden!important}.graph-field>*{visibility:hidden!important}'});
     const p=state.photo;
     const clip={x:Math.ceil(p.x+p.width*.4),y:Math.ceil(p.y+p.height*.24),width:Math.floor(p.width*.15),height:Math.floor(p.height*.17)};
     const before=await sharp(await page.screenshot({clip})).raw().toBuffer();
     await style.evaluate(el=>el.textContent=el.textContent.replaceAll('#ff0000','#0000ff'));
     const after=await sharp(await page.screenshot({clip})).raw().toBuffer();
     assert(before.equals(after),`${theme}/${revealed?'photo':'code'}: backdrop leaks through face`);
     await style.evaluate(el=>el.remove());
    }
   }
  }
  console.log(`PASS ${width}px: 9 themes, both states, alignment, head/shoulder bounds, no overflow${width===390?', pixel occlusion':''}`);
 }
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const cmd of ['code','whoami','code','whoami']){
  await page.locator('#whoamiField').fill(cmd);await page.locator('#whoamiField').press('Enter');await wait(50);
 }
 await wait(800);
 assert(await page.locator('.human-backdrop').evaluate(el=>el.classList.contains('revealed')&&!el.classList.contains('crossfade')));
 assert.deepEqual(errors,[]);
 console.log('PASS: rapid commands settle to the latest portrait; no page exceptions');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();server.kill('SIGTERM')});
