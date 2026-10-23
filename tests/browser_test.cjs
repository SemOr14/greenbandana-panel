const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765');
 assert.equal(await page.locator('#matrix circle').count(),31);
 await page.click('#demo');assert.equal(await page.locator('#controls').isEnabled(),true);
 await page.getByRole('button',{name:'Смыкание',exact:true}).click();
 await page.click('#trigger');await page.waitForTimeout(600);
 assert.equal(await page.locator('#modeName').innerText(),'Сейчас: Смыкание');
 assert.equal(await page.locator('#battery').innerText(),'73% · 3.89 В');
 await page.click('#heartButton');
 await page.locator('#showNumbers').check();
 assert.equal(await page.locator('#matrix text').first().isVisible(),true);
 for(const mode of ['Рот','Полосы ↕','Эквалайзер','Волна','Басы','Цвет','Дыхание','Басовый импульс']){
  await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForTimeout(25);
  assert.equal(await page.locator('#modeName').innerText(),'Сейчас: '+mode);
 }
 for(const summary of ['Микрофон и речь','Реакция на басы','Смыкание на ор','Аккумулятор и калибровка'])await page.getByText(summary,{exact:true}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/tmp/bandana_ui_mobile.png',fullPage:true});
 // WebCrypto protocol independently agrees with Node PBKDF2/HMAC.
 const crypto=require('node:crypto');const salt='00112233445566778899aabbccddeeff',nonce='0123456789abcdef';
 const expected=crypto.pbkdf2Sync('test-password',Buffer.from(salt,'hex'),100000,32,'sha256').toString('hex');
 const got=await page.evaluate(async({salt,nonce})=>{let k=await derive('test-password',salt);return {key:k,proof:await proof(k,nonce)};},{salt,nonce});
 assert.equal(got.key,expected);assert.equal(got.proof,crypto.createHmac('sha256',Buffer.from(expected,'hex')).update(nonce).digest('hex'));
 // Fragmented input: one-byte boundaries must reassemble a full JSON frame.
 await page.evaluate(()=>{demo=false;cancelAnimationFrame(demoFrame);const msg=JSON.stringify({type:'state',mode:2,pct:42,v:3.71,batteryValid:true,level:.5,bass:.2,db:-25,clip:true,mic:true,roar:0,pixels:'00ff00'.repeat(31)})+'\n';for(const b of new TextEncoder().encode(msg))incoming({target:{value:new DataView(Uint8Array.of(b).buffer)}});});
 assert.equal(await page.locator('#battery').innerText(),'42% · 3.71 В');assert.equal(await page.locator('#mic').innerText(),'Перегруз микрофона');
 assert.deepEqual(errors,[]);await browser.close();console.log('PASS: mobile UI, all modes, controls, layout, WebCrypto vectors, fragmented telemetry, zero JS errors');
})().catch(e=>{console.error(e);process.exit(1)});
