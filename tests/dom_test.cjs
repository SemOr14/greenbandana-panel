const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),errors=[];
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://bandana.test/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(e.message))});
const w=dom.window;w.TextEncoder=TextEncoder;w.TextDecoder=TextDecoder;w.isSecureContext=true;Object.defineProperty(w,'crypto',{value:crypto.webcrypto});
 w.fetch=async()=>({ok:true,json:async()=>({version:'1.2.3'})});
const ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx),$=id=>w.document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const server={configured:false,salt:'00112233445566778899aabbccddeeff',nonce:'abc123',key:'',settings:{},saved:false};
let wire='',fragments=0;
class Characteristic extends w.EventTarget{
 async startNotifications(){return this;}async readValue(){return new DataView(new ArrayBuffer(0));}
 async writeValueWithResponse(bytes){assert(bytes.byteLength<=18);wire+=new TextDecoder().decode(bytes);fragments++;if(!wire.endsWith('\n'))return;
  const p=JSON.parse(wire);wire='';let r={id:p.id,type:'ack',ok:true};
  if(p.op==='hello')r={id:p.id,type:'hello',version:'1.2.2',configured:server.configured,pairing:true,salt:server.salt,nonce:server.nonce,rounds:100000};
  else if(p.op==='enroll'){server.key=p.key;server.configured=true;}
  else if(p.op==='auth')r.ok=p.proof===crypto.createHmac('sha256',Buffer.from(server.key,'hex')).update(server.nonce).digest('hex');
  else if(p.op==='config')r={id:p.id,type:'config',config:server.settings};
  else if(p.op==='customGet')r={id:p.id,type:'customFrame',slot:p.slot,frame:p.frame,pixels:'000000'.repeat(31)};
  else if(p.op==='set')server.settings[p.name]=p.value;
  else if(p.op==='save')server.saved=true;
  const b=new TextEncoder().encode(JSON.stringify(r)+'\n');
  queueMicrotask(()=>{for(let i=0;i<b.length;i+=7){tx.value=new DataView(b.slice(i,i+7).buffer);tx.dispatchEvent(new w.Event('characteristicvaluechanged'));}});
 }
}
const tx=new Characteristic(),rx=new Characteristic();
class Device extends w.EventTarget{constructor(){super();this.id='test-mask';this.gatt={connected:false,connect:async()=>{this.gatt.connected=true;return{getPrimaryService:async()=>({getCharacteristic:async id=>id.includes('f502')?rx:tx})};},disconnect:()=>{this.gatt.connected=false;this.dispatchEvent(new w.Event('gattserverdisconnected'));}};}}
const device=new Device();Object.defineProperty(w.navigator,'bluetooth',{value:{requestDevice:async()=>device}});
run(fs.readFileSync(path.join(root,'app.js'),'utf8'));
w.localStorage.setItem('greenbandana-font-v1',JSON.stringify({version:1,glyphs:{А:'1'.repeat(25)}}));
run(fs.readFileSync(path.join(root,'font-editor.js'),'utf8'));
async function until(predicate){for(let i=0;i<300;i++){if(predicate())return;await sleep(10);}throw Error('Timeout');}
(async()=>{
 assert.equal(w.document.querySelectorAll('#matrix circle').length,31);
 assert.equal($('fontEditor').open,false);
 assert.match(w.document.querySelector('script[src^="font-editor.js"]').getAttribute('src'),/v=1\.3\.1/);
 assert.equal($('fontEditor').closest('fieldset'),null,'font editor stays available without connecting');
 assert($('otaUpdate').compareDocumentPosition($('fontEditor'))&w.Node.DOCUMENT_POSITION_FOLLOWING,'font editor stays at the bottom after firmware update');
 assert.equal($('modePanel').nextElementSibling.id,'quickSettings','always-visible quick controls follow the mode panel');
 assert.equal($('quickSettings').nextElementSibling.id,'primaryModeSettings','mode selection comes after the non-collapsible panels');
 assert.equal($('primaryModeSettings').open,false);
 assert.equal($('quickSettings').querySelector('#setting-brightness')!==null,true);
 assert.equal($('quickSettings').querySelector('#setting-speed')!==null,true);
 assert.equal($('quickSettings').querySelector('#setting-micSensitivity')!==null,true);
 assert.equal(w.document.querySelectorAll('#fontMatrix circle').length,31);
 assert.equal(w.document.querySelectorAll('#fontMatrix circle[data-cell]').length,31);
 assert.equal($('fontCharInput').type,'text');
 assert.equal(w.document.querySelectorAll('#fontEditor select').length,0,'character selection uses text input, not a dropdown');
 assert.equal($('firmwareSection').open,false,'firmware update is a collapsed settings item');
 const input=$('fontCharInput'),matrix=$('fontMatrix');
 const aPattern=Array.from(matrix.querySelectorAll('circle[data-cell]'),node=>node.getAttribute('fill')).join(',');
 input.value='Б';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const bPattern=Array.from(matrix.querySelectorAll('circle[data-cell]'),node=>node.getAttribute('fill')).join(',');assert.notEqual(aPattern,bPattern,'typing a symbol changes the editable glyph');
 input.value='Ё';input.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match($('fontStatus').textContent,/нет в наборе/);
 input.value='А';input.dispatchEvent(new w.Event('input',{bubbles:true}));
 const fontPixel=$('fontMatrix').querySelector('circle[data-cell="0"]'),fontBefore=fontPixel.getAttribute('fill');
 fontPixel.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));assert.notEqual(fontPixel.getAttribute('fill'),fontBefore);
 matrix.querySelector('circle[data-cell="12"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 matrix.querySelector('circle[data-cell="18"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
 assert.equal($('fontWidth').textContent,'Ширина: 7 px','the full center row is editable at 7 pixels wide');
 $('fontSave').click();assert(JSON.parse(w.localStorage.getItem('greenbandana-font-v1')).glyphs.А);
 assert.equal(JSON.parse(w.localStorage.getItem('greenbandana-font-v1')).glyphs.А.length,31,'legacy 5x5 font is migrated to all 31 LEDs');
 assert.equal(fragments,0,'font editing must not send BLE commands');
 $('demo').click();assert(!$('controls').disabled);
 for(let i=0;i<11;i++){await run(`setting('mode',${i})`);assert.equal(run('cfg.mode'),i);}
 // Choose a two-mode primary cycle in the phone panel and test both hardware-equivalent controls.
 await run("setting('primaryMask',(1<<9)|(1<<10))");
 assert.equal(w.document.querySelectorAll('#primaryModes input:checked').length,2);
 await run("setting('mode',9)");$('nextPrimary').click();assert.equal(run('cfg.mode'),10);
 $('nextPrimary').click();assert.equal(run('cfg.mode'),9);
 $('toggleCollapse').click();assert.equal(run('cfg.mode'),5);assert.equal(run('cfg.lastMode'),9);
 $('toggleCollapse').click();assert.equal(run('cfg.mode'),9);
 // Do not allow a zero-length cycle.
 await run("setting('primaryMask',1<<9)");
 w.document.querySelector('#primaryModes input[data-primary="9"]').click();
 assert.equal(w.document.querySelectorAll('#primaryModes input:checked').length,1);
 $('trigger').click();await sleep(100);$('heartButton').click();assert(run('heartUntil')>0);
 run('demo=false;cancelAnimationFrame(demoFrame)');
 const pass='test-password',expected=crypto.pbkdf2Sync(pass,Buffer.from(server.salt,'hex'),100000,32,'sha256').toString('hex');
 assert.equal(await run(`derive('${pass}','${server.salt}')`),expected);
 assert.equal(await run(`proof('${expected}','abc123')`),crypto.createHmac('sha256',Buffer.from(expected,'hex')).update('abc123').digest('hex'));
 await run('connect()');assert(!$('login').hidden);
 $('password').value=pass;$('authForm').requestSubmit($('authForm').querySelector('button'));
 await until(()=>run('ready'));await until(()=>run('customLoaded'));assert.equal(server.key,expected);assert(server.configured);assert(!$('controls').disabled);assert.match($('firmwareVersionInfo').textContent,/доступно обновление до 1\.2\.3/);assert(!$('otaUpdate').disabled);
 await run("setting('mode',5)");assert.equal(server.settings.mode,5);await run("setting('primaryMask',1<<10)");assert.equal(server.settings.primaryMask,1<<10);
 $('setting-voiceFocus').value='1';$('setting-voiceFocus').dispatchEvent(new w.Event('change'));await until(()=>server.settings.voiceFocus===1);
 $('setting-micSensitivity').value='5';$('setting-micSensitivity').dispatchEvent(new w.Event('change'));await until(()=>server.settings.micSensitivity===5);
 $('save').click();await until(()=>server.saved);
 // Read/write fragmentation and reconnect with remembered access, no second password entry.
 assert(fragments>10);device.gatt.disconnect();assert($('controls').disabled);
 await run('connect()');assert(run('ready'));assert($('login').hidden);await until(()=>run('customLoaded'));
 run(`incoming({target:{value:new DataView(new TextEncoder().encode(JSON.stringify({type:'state',mode:10,lastMode:10,primaryMask:1024,pct:42,v:3.71,batteryValid:true,level:.5,bass:.2,db:-25,clip:true,mic:true,roar:2,pixels:'00ff00'.repeat(31)})+'\\n').buffer)}})`);
 assert.equal($('battery').textContent,'42% · 3.71 В');assert.equal($('mic').textContent,'Перегруз микрофона');
 assert.equal($('led-15').getAttribute('fill'),'#00ff00');assert.equal($('modeName').textContent,'Сейчас: Светомузыка');assert.equal(w.document.querySelectorAll('#primaryModes input:checked').length,1);
 assert.deepEqual(errors,[]);dom.window.close();console.log('PASS: collapsed local font editor, 31 editable dots, 7-LED glyph width, legacy font migration, local save without BLE writes; UI modes, BLE auth/fragmentation, settings, reconnect, battery and clipping telemetry');
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
