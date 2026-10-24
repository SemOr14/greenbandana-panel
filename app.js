'use strict';
const SERVICE='97bcf501-696e-4f24-9b83-16bfa764b7e1',RX='97bcf502-696e-4f24-9b83-16bfa764b7e1',TX='97bcf503-696e-4f24-9b83-16bfa764b7e1',OTA='97bcf504-696e-4f24-9b83-16bfa764b7e1';
const $=id=>document.getElementById(id),enc=new TextEncoder(),dec=new TextDecoder();
const names=['Рот','Полосы ↕','Эквалайзер','Волна','Басы','Смыкание','Цвет','Дыхание','Басовый импульс','Пламя','Светомузыка','Своя 1','Своя 2','Своя 3'];
let targetFirmwareVersion='1.2.3';
const firmwareInfo=document.createElement('p');firmwareInfo.id='firmwareVersionInfo';firmwareInfo.className='note';$('otaUpdate').before(firmwareInfo);
let cfg={mode:0,lastMode:0,primaryMask:2015,customFps:4,customCount:4,customSound:0,fireLow:0xff1800,fireHigh:0xffdc40,fireIntensity:.8,fireCooling:.15,musicLow:0xff1800,musicMid:0x00ff50,musicHigh:0x2060ff,musicGain:1.5,brightness:90,currentLimitMa:900,base:0x00ff18,loud:0xff0000,heart:0xff1680,floorDb:-65,ceilingDb:-18,loudLevel:.82,bassLow:40,bassHigh:180,bassGain:2,roarLow:100,roarHigh:1800,roarDb:-14,roarBandRatio:.35,roarTriggerMs:200,roarHoldMs:15000,roarCloseMs:350,roarOpenMs:1800,changeStableMs:1000,changeDb:7,changeSpectrum:.2,attackMs:45,releaseMs:180,speed:1,batteryCorrection:1,micSensitivity:1,voiceFocus:0};
let device,rx,tx,otaChar,hello,ready=false,demo=false,buffer='',serial=1,queue=Promise.resolve(),dirty=false,heartUntil=0,demoRoarAt=-1,demoFrame=0;
let customPixels=Array(31).fill(0),customLoaded=false,latestBatteryVoltage=NaN;
let capacityMa=storageGet('greenbandana-capacity-mah');if(!Number.isInteger(capacityMa)||capacityMa<100||capacityMa>30000)capacityMa=2500;
let powerHistory=[],lastPowerSample=0,lastPowerState=null;
const waiters=new Map(),sliders=new Map();
const positions=[];for(let row=0,start=0;row<5;row++){const n=row===2?7:6;for(let j=0;j<n;j++){const index=start+(row%2?n-1-j:j);positions[index]={x:(j-(n-1)/2)*16.5,y:(row-2)*14.8,row};}start+=n;}
function notice(text,ok=false){$('message').hidden=!text;$('message').textContent=text;$('message').className=ok?'success':'';}
function status(text,on=false){$('status').textContent=text;$('dot').className='dot'+(on?' on':'');}
function storageGet(k){try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}
function storageSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{notice('Браузер не разрешил сохранить доступ. При следующем подключении пароль потребуется снова.');return false;}}
function cacheKey(){return 'greenbandana-access-'+device.id;}
function forget(){try{localStorage.removeItem(cacheKey());}catch{}}
function hex(bytes){return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
function resetPowerHistory(){powerHistory=[];lastPowerSample=0;lastPowerState=null;$('powerCurrent').textContent='Ток —';$('powerRemaining').textContent='Осталось —';}
function formatRemaining(minutes){
 if(minutes<5)return '<5 мин';
 const rounded=Math.round(minutes/5)*5,hours=Math.floor(rounded/60),mins=rounded%60;
 return hours?`${hours} ч${mins?' '+mins+' мин':''}`:`${mins} мин`;
}
function updatePowerReadout(s,record=true){
 lastPowerState=s;
 if(!s.batteryValid||!Number.isFinite(s.v)||s.v<=0||!Number.isFinite(s.pct)||s.pixels?.length!==186){$('powerCurrent').textContent='Ток —';$('powerRemaining').textContent='Осталось —';return;}
 let channels=0;for(let i=0;i<186;i+=2){const value=parseInt(s.pixels.slice(i,i+2),16);if(!Number.isFinite(value))return;channels+=value;}
 // Same conservative LED model as the firmware: 1 mA per LED plus 20 mA per full-scale RGB channel.
 // Add a fixed board/microphone allowance and convert 5 V load into battery current through the boost converter.
 const currentMa=(31+channels*20/255+150)*5/(s.v*.85);
 const now=performance.now();
 if(record&&now-lastPowerSample>=900){if(lastPowerSample&&now-lastPowerSample>15000)powerHistory=[];lastPowerSample=now;powerHistory.push({at:now,ma:currentMa});}
 powerHistory=powerHistory.filter(sample=>now-sample.at<=600000);
 const averageMa=powerHistory.length?powerHistory.reduce((sum,sample)=>sum+sample.ma,0)/powerHistory.length:currentMa;
 $('powerCurrent').textContent=`≈ ${Math.round(currentMa/10)*10} мА`;
 $('powerRemaining').textContent=`Осталось ≈ ${formatRemaining(capacityMa*Math.max(0,Math.min(100,s.pct))/100/averageMa*60)}`;
}
function unhex(s){return new Uint8Array(s.match(/../g).map(b=>parseInt(b,16)));}
async function derive(password,salt){const k=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:unhex(salt),iterations:100000,hash:'SHA-256'},k,256)));}
async function proof(key,nonce){const k=await crypto.subtle.importKey('raw',unhex(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode(nonce))));}
function compareVersions(a,b){const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return Math.sign(d);}return 0;}
async function refreshFirmwareInfo(){
 try{const response=await fetch('./firmware.json',{cache:'no-store'});if(response.ok){const meta=await response.json();if(/^\d+\.\d+\.\d+$/.test(meta.version||''))targetFirmwareVersion=meta.version;}}
 catch{}
 const current=hello?.version,cmp=current?compareVersions(current,targetFirmwareVersion):-1;
 firmwareInfo.textContent=current?(cmp===0?`Прошивка на бандане ${current} · актуальна.`:cmp<0?`Прошивка на бандане ${current} · доступно обновление до ${targetFirmwareVersion}.`:`На бандане ${current}, это новее доступной версии ${targetFirmwareVersion}.`):`Доступна прошивка ${targetFirmwareVersion}; версию маски проверить не удалось.`;
 const button=$('otaUpdate');button.disabled=!otaChar||(current&&cmp>=0);
 button.textContent=current&&cmp===0?`Установлена актуальная ${current}`:`Обновить до ${targetFirmwareVersion}`;
}
function command(op,fields={}){
 const task=async()=>{
  if(!rx||!device?.gatt.connected)throw Error('Нет Bluetooth-соединения');
  const id=serial++,packet=enc.encode(JSON.stringify({id,op,...fields})+'\n');
  let timer;const answer=new Promise((resolve,reject)=>{timer=setTimeout(()=>{waiters.delete(id);reject(Error('Маска не ответила. Проверь соединение и разрешение Bluetooth.'));},15000);waiters.set(id,{resolve,reject});});
  // Attach a rejection handler before writing, including when a connection drops mid-write.
  answer.catch(()=>{});
  try{for(let i=0;i<packet.length;i+=18)await rx.writeValueWithResponse(packet.slice(i,i+18));return await answer;}
  finally{clearTimeout(timer);waiters.delete(id);}
 };
 const next=queue.then(task);queue=next.catch(()=>{});return next;
}
function incoming(event){
 buffer+=dec.decode(event.target.value);
 if(buffer.length>20000){buffer='';notice('Ошибка потока Bluetooth. Переподключись.');return;}
 let n;while((n=buffer.indexOf('\n'))>=0){let text=buffer.slice(0,n);buffer=buffer.slice(n+1);let p;try{p=JSON.parse(text);}catch{continue;}
  if(p.id&&waiters.has(p.id)){const w=waiters.get(p.id);waiters.delete(p.id);if(p.type==='ack'&&!p.ok)w.reject(Error(p.message));else w.resolve(p);}
  if(p.type==='state')showState(p);
 }
}
function disconnected(){
 ready=false;latestBatteryVoltage=NaN;resetPowerHistory();rx=tx=otaChar=null;buffer='';$('controls').disabled=true;$('login').hidden=true;$('disconnect').hidden=true;$('connect').hidden=false;
 for(const w of waiters.values())w.reject(Error('Соединение прервано'));waiters.clear();queue=Promise.resolve();status('Не подключено');$('hint').textContent='Эффекты продолжают работать в маске. Для настройки подключись снова.';
}
async function connect(){
 notice('');resetPowerHistory();if(!isSecureContext||!navigator.bluetooth){notice('Для Bluetooth нужна HTTPS-страница и поддерживающий браузер. Открой панель в Opera Android или Chrome Android. Локальный HTML-файл для подключения не подходит.');return;}
 demo=false;cancelAnimationFrame(demoFrame);$('demo').textContent='Демо';$('connect').disabled=true;
 try{
  if(device?.gatt.connected)device.gatt.disconnect();
  device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'GreenBandana'}],optionalServices:[SERVICE]});
  device.addEventListener('gattserverdisconnected',disconnected);
  status('Подключение…');const gatt=await device.gatt.connect(),service=await gatt.getPrimaryService(SERVICE);
  tx=await service.getCharacteristic(TX);rx=await service.getCharacteristic(RX);
  try{otaChar=await service.getCharacteristic(OTA);}catch{otaChar=null;}
  // Discard the retained characteristic fragment before attaching the stream listener.
  // This encrypted read prompts Android bonding if it was not already established.
  await tx.readValue();buffer='';
  await tx.startNotifications();tx.addEventListener('characteristicvaluechanged',incoming);
  $('connect').hidden=true;$('disconnect').hidden=false;await getHello();
 }catch(e){if(device?.gatt.connected)device.gatt.disconnect();disconnected();notice(e.name==='NotFoundError'?'Устройство не выбрано. Если GreenBandana нет в списке, проверь питание маски и Bluetooth телефона, затем попробуй ещё раз.':'Подключение: '+e.message);}
 finally{$('connect').disabled=false;}
}
async function getHello(){
 hello=await command('hello');await refreshFirmwareInfo();ready=false;$('controls').disabled=true;
 if(hello.unlocked){if(hello.rememberKey&&$('remember').checked)storageSet(cacheKey(),{salt:hello.salt,key:hello.rememberKey});await authenticated();return;}
 const saved=storageGet(cacheKey());
 if(hello.configured&&saved?.salt===hello.salt&&saved?.key){try{await command('auth',{proof:await proof(saved.key,hello.nonce)});await authenticated();return;}catch{forget();hello=await command('hello');}}
 $('login').hidden=false;$('loginTitle').textContent=hello.configured?'Пароль маски':'Первое подключение';
 $('authForm').hidden=hello.version==='1.2.1';
 $('loginTitle').textContent=hello.version==='1.2.1'?'Доступ к бандане':$('loginTitle').textContent;
 $('loginHint').textContent=hello.version==='1.2.1'?'Удерживайте обе кнопки 3 секунды до красной вспышки и нажмите «Проверить окно настройки».':hello.configured?'Введите свой пароль или удерживайте обе кнопки 3 секунды до красной вспышки. Затем нажмите «Проверить окно настройки».':'Удерживайте обе кнопки маски 3 секунды, дождитесь красной вспышки и нажмите «Проверить окно настройки». Окно входа открыто 60 секунд.';
 $('password').autocomplete=hello.configured?'current-password':'new-password';status('Нужен пароль');
}
async function authenticated(){
 const p=await command('config');Object.assign(cfg,p.config);ready=true;latestBatteryVoltage=NaN;dirty=false;buildControls();$('currentLimitStatus').textContent='';$('batteryCalibrationStatus').textContent='';$('controls').disabled=false;$('login').hidden=true;$('password').value='';
 status('Маска подключена',true);$('hint').textContent='Управление по BLE · сеть и VPN остаются прежними';$('dirty').textContent='Настройки загружены из маски';
  refreshFirmwareInfo();
 loadCustomFrame().catch(e=>notice('Редактор анимации: '+e.message));
}
$('otaUpdate').onclick=async()=>{
 if(!ready||!otaChar)return;
 const button=$('otaUpdate'),progress=$('otaProgress');button.disabled=true;let started=false;
 try{
  progress.textContent='Загрузка образа с сайта…';
  const response=await fetch('./firmware.bin',{cache:'no-store'});if(!response.ok)throw Error('Файл прошивки недоступен на сайте');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length<100000||bytes.length>1300000)throw Error('Неверный размер файла прошивки');
  progress.textContent='Начало передачи…';await command('otaBegin',{size:bytes.length});started=true;
  let chunkSize=128;
  for(let i=0;i<bytes.length;){
   const chunk=bytes.slice(i,i+chunkSize);
   try{await otaChar.writeValueWithResponse(chunk);}catch(e){if(i===0&&chunkSize!==18){chunkSize=18;continue;}throw e;}
   i+=chunk.length;
   if(i===bytes.length||i%4096<chunkSize){const s=await command('otaStatus');if(s.error||s.written!==i)throw Error('Передача прервана на '+i+' байтах');progress.textContent='Передано '+Math.round(i*100/bytes.length)+'%';}
  }
  await command('otaEnd');started=false;progress.textContent='Обновление записано. Бандана перезагружается.';
 }catch(e){progress.textContent='Обновление не завершено: '+e.message;if(started)try{await command('otaAbort');}catch{}}
 finally{button.disabled=!ready||!otaChar;}
};
$('authForm').addEventListener('submit',async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;notice('');
 try{hello=await command('hello');if(!hello.configured&&!hello.pairing)throw Error('Открой окно настройки обеими кнопками на 3 секунды.');
  const key=await derive($('password').value,hello.salt);
  await command(hello.configured?'auth':'enroll',hello.configured?{proof:await proof(key,hello.nonce)}:{key});
  if($('remember').checked)storageSet(cacheKey(),{salt:hello.salt,key});else forget();
  await authenticated();
 }catch(e){const errors={wrong_password:'Неверный пароль',try_later:'Подожди 2 секунды и повтори',pairing_required:'Окно настройки закрыто. Удерживай обе кнопки 3 секунды.'};notice(errors[e.message]||e.message);}
 finally{button.disabled=false;}
});
$('connect').onclick=connect;$('disconnect').onclick=()=>device?.gatt.disconnect();$('refreshHello').onclick=()=>getHello().catch(e=>notice(e.message));
function markDirty(){dirty=true;$('dirty').textContent=demo?'Демонстрация · изменения не передаются':'Есть несохранённые изменения';}
async function setting(name,value){
 if(!ready&&!demo)return false;
 if(!demo){try{await command('set',{name,value});}catch(e){notice('Настройка не передана: '+e.message);return false;}}
 if(name==='mode'){if(value===5){if(cfg.mode!==5)cfg.lastMode=cfg.mode;}else cfg.lastMode=value;}
 cfg[name]=value;markDirty();updateModes();if(name==='primaryMask')buildPrimaryModes();return true;
}
const sections={
 light:[['brightness','Яркость',0,255,1,''],['speed','Скорость эффектов',.1,5,.1,'×']],
 colors:[['base','Основной цвет','color'],['loud','Цвет громкого звука / смыкания','color'],['heart','Цвет сердечка','color']],
 audio:[['floorDb','Нижний уровень',-100,-25,1,'dBFS'],['ceilingDb','Уровень полного открытия',-24,-1,1,'dBFS'],['loudLevel','Порог громкого цвета',.1,.99,.01,''],['attackMs','Скорость нарастания',5,500,5,'мс'],['releaseMs','Плавность затухания',20,2000,10,'мс']],
 bassSettings:[['bassLow','Басы от',32,150,1,'Гц'],['bassHigh','Басы до',160,500,1,'Гц'],['bassGain','Усиление реакции',.1,6,.1,'×']],
 roarSettings:[['roarDb','Порог громкости ора',-80,-1,1,'dBFS'],['roarLow','Диапазон ора от',32,1500,10,'Гц'],['roarHigh','Диапазон ора до',1600,7000,50,'Гц'],['roarBandRatio','Доля энергии в диапазоне',.01,.99,.01,''],['roarTriggerMs','Длительность до срабатывания',50,2000,50,'мс'],['roarCloseMs','Время смыкания',100,3000,50,'мс'],['roarHoldMs','Минимум красного состояния',12000,15000,500,'мс'],['changeDb','Изменение громкости для раскрытия',1,30,.5,'дБ'],['changeSpectrum','Изменение спектра для раскрытия',.01,.95,.01,''],['changeStableMs','Подтверждение изменения',250,5000,250,'мс'],['roarOpenMs','Время раскрытия',300,8000,100,'мс']],
 effectsSettings:[['fireLow','Пламя: цвет углей','color'],['fireHigh','Пламя: цвет языков','color'],['fireIntensity','Интенсивность пламени',.1,1,.05,''],['fireCooling','Затухание пламени',.02,.5,.01,''],['musicLow','Светомузыка: низкие','color'],['musicMid','Светомузыка: средние','color'],['musicHigh','Светомузыка: высокие','color'],['musicGain','Светомузыка: чувствительность',.2,4,.1,'×']],
 customSettings:[['customFps','Кадров в секунду',1,20,1,''],['customCount','Число кадров',1,8,1,''],['customSound','Реакция: 0 нет, 1 громкость, 2 басы',0,2,1,'']]
};
function buildControls(){
 for(const [parent,fields]of Object.entries(sections)){
  $(parent).replaceChildren();
  for(const [name,label,min,max,step,unit]of fields){
   const l=document.createElement('label');l.className='setting';l.textContent=label;
   const output=document.createElement('output'),input=document.createElement('input');input.id='setting-'+name;input.type=min==='color'?'color':'range';
   if(min==='color')input.value='#'+cfg[name].toString(16).padStart(6,'0');else{input.min=min;input.max=max;input.step=step;input.value=cfg[name];}
   const exact=['speed','customFps'].includes(name);
   const number=exact?document.createElement('input'):null;
   if(number){number.type='number';number.min=min;number.max=max;number.step=name==='speed'?'0.01':'1';number.inputMode=name==='speed'?'decimal':'numeric';number.value=cfg[name];number.setAttribute('aria-label',label+' — точное значение');}
   const display=(value=number?number.value:input.value)=>{output.value=min==='color'?input.value:name==='brightness'?Math.round(+input.value/255*100)+' %':value+(unit?' '+unit:'');};display();
   input.oninput=()=>{if(number)number.value=input.value;display();clearTimeout(sliders.get(name));sliders.set(name,setTimeout(async()=>{sliders.delete(name);if(!await setting(name,min==='color'?parseInt(input.value.slice(1),16):+input.value)){input.value=cfg[name];if(number)number.value=cfg[name];display();}},180));};
   l.append(output);
   if(number){
    const row=document.createElement('div');row.className='rangeRow';row.append(input,number);l.append(row);
    number.onchange=async()=>{
     clearTimeout(sliders.get(name));sliders.delete(name);
     const value=Number(number.value);
     if(number.value.trim()===''||!Number.isFinite(value)||value<min||value>max||(name!=='speed'&&!Number.isInteger(value))){notice(`Введите ${label.toLowerCase()}: от ${min} до ${max}.`);number.value=cfg[name];input.value=cfg[name];display();return;}
     if(await setting(name,value)){input.value=value;number.value=value;display();}else{number.value=cfg[name];input.value=cfg[name];display();}
    };
   }else l.append(input);
   $(parent).append(l);
  }
 }
 const focus=document.createElement('label');focus.className='setting';focus.textContent='Фокус на речи · ослабление басовой музыки';
 const focusOut=document.createElement('output'),focusSelect=document.createElement('select');focusSelect.id='setting-voiceFocus';
 for(const [value,label] of [[0,'Выключен'],[1,'Включён · эвристика']]){const option=document.createElement('option');option.value=value;option.textContent=label;focusSelect.append(option);}
 focusSelect.value=cfg.voiceFocus;focusOut.value=focusSelect.options[focusSelect.selectedIndex].text;focus.append(focusOut,focusSelect);
 focusSelect.onchange=async()=>{if(await setting('voiceFocus',+focusSelect.value))focusOut.value=focusSelect.options[focusSelect.selectedIndex].text;else focusSelect.value=cfg.voiceFocus;};$('audio').prepend(focus);
 const sens=document.createElement('label');sens.className='setting';sens.textContent='Общая чувствительность';
 const sensOut=document.createElement('output'),sensSelect=document.createElement('select');sensSelect.id='setting-micSensitivity';
 for(const [value,label] of [[1,'×1 · без снижения'],[2,'×½'],[3,'×⅓'],[4,'×¼'],[5,'×⅕']]){const option=document.createElement('option');option.value=value;option.textContent=label;sensSelect.append(option);}
 sensSelect.value=cfg.micSensitivity;sensOut.value=sensSelect.options[sensSelect.selectedIndex].text;sens.append(sensOut,sensSelect);
 sensSelect.onchange=async()=>{if(await setting('micSensitivity',+sensSelect.value))sensOut.value=sensSelect.options[sensSelect.selectedIndex].text;else sensSelect.value=cfg.micSensitivity;};$('quickMicSensitivity').append(sens);
 $('currentLimitInput').value=cfg.currentLimitMa;
 updateModes();buildPrimaryModes();
}
$('currentLimitInput').onchange=async()=>{
 const input=$('currentLimitInput'),value=Number(input.value),message=$('currentLimitStatus');
 if(input.value.trim()===''||!Number.isInteger(value)||value<100||value>1800){message.textContent='Введите целое число от 100 до 1800 мА.';input.value=cfg.currentLimitMa;return;}
 if(await setting('currentLimitMa',value)){message.textContent='Лимит передан бандане. Нажмите «Сохранить в маске».';}else{input.value=cfg.currentLimitMa;message.textContent='Лимит не изменён.';}
};
$('batteryCapacity').value=capacityMa;
$('batteryCapacity').onchange=()=>{
 const field=$('batteryCapacity'),value=Number(field.value),message=$('batteryCapacityStatus');
 if(field.value.trim()===''||!Number.isInteger(value)||value<100||value>30000){message.textContent='Введите ёмкость от 100 до 30000 мА·ч.';field.value=capacityMa;return;}
 capacityMa=value;storageSet('greenbandana-capacity-mah',value);message.textContent='Ёмкость сохранена для этого браузера.';
 if(lastPowerState)updatePowerReadout(lastPowerState,false);
};
$('calibrateBattery').onclick=async()=>{
 const field=$('measuredVoltage'),message=$('batteryCalibrationStatus'),measured=Number(field.value);
 if(!ready||!Number.isFinite(latestBatteryVoltage)){message.textContent='Подождите показания аккумулятора после подключения.';return;}
 if(field.value.trim()===''||!Number.isFinite(measured)||measured<2.5||measured>4.4){message.textContent='Введите измеренное напряжение от 2,50 до 4,40 В.';return;}
 const correction=cfg.batteryCorrection*measured/latestBatteryVoltage;
 if(correction<.8||correction>1.2){message.textContent='Разница слишком велика для калибровки. Проверьте измерение и подключение аккумулятора.';return;}
 const button=$('calibrateBattery');button.disabled=true;
 try{
  if(!await setting('batteryCorrection',Math.round(correction*100000)/100000))throw Error('Не удалось передать поправку');
  await command('save');dirty=false;$('dirty').textContent='Настройки сохранены в бандане';
  message.textContent='Калибровка сохранена. Показание обновится через несколько секунд.';
 }catch(e){message.textContent='Калибровка не сохранена: '+e.message;}
 finally{button.disabled=false;}
};
function updateModes(){
 for(const b of $('modes').children)b.classList.toggle('active',+b.dataset.mode===cfg.mode);
 $('modeName').textContent='Сейчас: '+names[cfg.mode];
 $('toggleCollapse').textContent=cfg.mode===5?'Выйти из смыкания':'Включить смыкание';
 $('returnMode').textContent='Возврат из смыкания: '+names[cfg.lastMode];
}
function buildPrimaryModes(){
 $('primaryModes').replaceChildren();
 names.forEach((name,i)=>{
  if(i===5)return;const label=document.createElement('label');label.className='check';
  const input=document.createElement('input');input.type='checkbox';input.dataset.primary=i;input.checked=!!(cfg.primaryMask&(1<<i));
  input.onchange=async()=>{
   const mask=Array.from($('primaryModes').querySelectorAll('input:checked')).reduce((mask,node)=>mask|(1<<+node.dataset.primary),0);
   if(!mask){input.checked=true;notice('В основном круге должен остаться хотя бы один режим.');return;}
   const old=cfg.primaryMask;if(!await setting('primaryMask',mask)){cfg.primaryMask=old;buildPrimaryModes();}
  };
  label.append(input,document.createTextNode(name));$('primaryModes').append(label);
 });
}
function localChoose(mode){if(mode===5){if(cfg.mode!==5)cfg.lastMode=cfg.mode;}else cfg.lastMode=mode;cfg.mode=mode;updateModes();}
$('toggleCollapse').onclick=async()=>{
 try{if(demo)localChoose(cfg.mode===5?cfg.lastMode:5);else await command('toggleCollapse');}catch(e){notice(e.message);}
};
$('nextPrimary').onclick=async()=>{
 try{if(demo){const start=cfg.mode===5?cfg.lastMode:cfg.mode;for(let step=1;step<=names.length;step++){const target=(start+step)%names.length;if(cfg.primaryMask&(1<<target)){localChoose(target);break;}}}else await command('nextPrimary');}catch(e){notice(e.message);}
};
for(let i=0;i<names.length;i++){const b=document.createElement('button');b.textContent=names[i];b.className='mode';b.dataset.mode=i;b.onclick=()=>setting('mode',i);$('modes').append(b);}
$('save').onclick=async()=>{try{if(demo){notice('Это демо: настройки не сохраняются в маске.');return;}if(sliders.size){notice('Подожди завершения изменения ползунков и нажми сохранить ещё раз.');return;}await queue;await command('save');dirty=false;$('dirty').textContent='Сохранено в маске';notice('Настройки сохранятся после выключения.',true);}catch(e){notice(e.message);}};
$('heartButton').onclick=async()=>{try{if(demo)heartUntil=performance.now()+4000;else await command('heart');}catch(e){notice(e.message);}};
$('trigger').onclick=async()=>{try{if(demo){localChoose(5);demoRoarAt=performance.now();}else{await command('trigger');localChoose(5);}}catch(e){notice(e.message);}};
const ns='http://www.w3.org/2000/svg';
positions.forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.id='led-'+i;c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',4.7);c.setAttribute('fill','#142019');c.classList.add('led');const title=document.createElementNS(ns,'title');title.textContent='LED '+i;c.append(title);c.addEventListener('click',async()=>{if(!ready||demo)return;try{await command('test',{index:i});notice('Проверка: LED '+i+' горит 1,5 секунды.',true);}catch(e){notice(e.message);}});$('matrix').append(c);const t=document.createElementNS(ns,'text');t.setAttribute('x',p.x);t.setAttribute('y',p.y+1.3);t.setAttribute('text-anchor','middle');t.textContent=i;t.style.display='none';$('matrix').append(t);});
$('showNumbers').onchange=e=>document.querySelectorAll('#matrix text').forEach(t=>t.style.display=e.target.checked?'':'none');
const editor=$('customMatrix');
positions.forEach((p,i)=>{const c=document.createElementNS(ns,'circle');c.setAttribute('cx',p.x);c.setAttribute('cy',p.y);c.setAttribute('r',5.5);c.dataset.index=i;c.classList.add('led');c.onclick=()=>{if(!customLoaded)return;customPixels[i]=parseInt($('customColor').value.slice(1),16);renderCustomEditor();};editor.append(c);});
function renderCustomEditor(){editor.querySelectorAll('circle').forEach(c=>c.setAttribute('fill','#'+customPixels[+c.dataset.index].toString(16).padStart(6,'0')));}
async function loadCustomFrame(){
 if(!ready)return;customLoaded=false;$('customStatus').textContent='Загрузка кадра…';
 const slot=+$('customSlot').value,frame=+$('customFrame').value,r=await command('customGet',{slot,frame});
 if(r.pixels?.length!==186)throw Error('Маска не поддерживает редактор анимаций');
 customPixels=Array.from({length:31},(_,i)=>parseInt(r.pixels.slice(i*6,i*6+6),16));customLoaded=true;renderCustomEditor();$('customStatus').textContent='Кадр загружен. Коснитесь светодиодов и сохраните.';
}
$('customSlot').onchange=$('customFrame').onchange=()=>loadCustomFrame().catch(e=>notice(e.message));
$('customErase').onclick=()=>{$('customColor').value='#000000';};
$('customClear').onclick=()=>{if(customLoaded){customPixels.fill(0);renderCustomEditor();}};
$('customCopy').onclick=async()=>{if(!ready)return;const slot=+$('customSlot').value,frame=(+$('customFrame').value+7)%8,r=await command('customGet',{slot,frame});customPixels=Array.from({length:31},(_,i)=>parseInt(r.pixels.slice(i*6,i*6+6),16));customLoaded=true;renderCustomEditor();$('customStatus').textContent='Предыдущий кадр скопирован. Сохраните изменения.';};
$('customSave').onclick=async()=>{if(!ready||!customLoaded)return;const button=$('customSave');button.disabled=true;try{await command('customSet',{slot:+$('customSlot').value,frame:+$('customFrame').value,pixels:customPixels.map(v=>v.toString(16).padStart(6,'0')).join('')});$('customStatus').textContent='Кадр сохранён в бандане.';}catch(e){$('customStatus').textContent='Ошибка сохранения: '+e.message;}finally{button.disabled=false;}};
function showState(s){
 if(ready&&s.batteryValid&&Number.isFinite(s.v))latestBatteryVoltage=s.v;
 if(Number.isInteger(s.lastMode))cfg.lastMode=s.lastMode;
 if(Number.isInteger(s.primaryMask)&&s.primaryMask!==cfg.primaryMask){cfg.primaryMask=s.primaryMask;buildPrimaryModes();}
 cfg.mode=s.mode;updateModes();
 $('battery').textContent=s.batteryValid?`${s.pct}% · ${s.v.toFixed(2)} В`:'АКБ: нет измерения';$('battery').classList.toggle('low',s.batteryValid&&s.pct<15);
 updatePowerReadout(s);
 $('level').value=s.level;$('bass').value=s.bass;$('db').textContent=s.db+' dBFS';$('mic').textContent=s.clip?'Перегруз микрофона':s.mic?'Микрофон работает':'Нет данных микрофона';$('mic').className=s.clip?'clip':'';
 $('roarState').textContent=demo?'Демонстрация: звук и заряд смоделированы':cfg.mode===5?['Зелёное поле · ожидание ора','Смыкание','Красное · ожидание изменения звука','Плавное раскрытие'][s.roar]:'Данные от маски · примерно 1 обновление/с';
 if(s.pixels?.length===186)for(let i=0;i<31;i++)$('led-'+i).setAttribute('fill','#'+s.pixels.slice(i*6,i*6+6));
}
function demoLoop(now){
 if(!demo)return;const a=.15+.8*Math.pow(.5+.5*Math.sin(now/430),2),t=now*.001*cfg.speed;
 let amount=0,state=0;if(demoRoarAt>=0){const elapsed=now-demoRoarAt;if(elapsed<cfg.roarCloseMs){amount=elapsed/cfg.roarCloseMs;state=1;}else if(elapsed<cfg.roarCloseMs+cfg.roarHoldMs){amount=1;state=2;}else{amount=1-Math.min(1,(elapsed-cfg.roarCloseMs-cfg.roarHoldMs)/cfg.roarOpenMs);state=amount>0?3:0;}}
 let pixels='';for(const p of positions){const x=p.x/49.5,y=p.y/29.6,ax=Math.abs(x),ay=Math.abs(y);let v=0,col=cfg.base;
  if(now<heartUntil){v=p.row===0?ax>.3&&ax<.72:p.row===1?ax<.9:p.row===2?ax<.8:p.row===3?ax<.53:ax<.18;col=cfg.heart;}
  else switch(cfg.mode){case 0:v=Math.max(0,1-Math.abs(Math.hypot(x/.85,y/(.06+.94*a))-1)/.65);break;case 1:v=Math.max(0,1-Math.abs(ay-(.12+.88*a))/.5);break;case 2:v=y>1-2*(.2+.8*Math.abs(Math.sin(t*2+x*2)))?1:0;break;case 3:v=Math.max(0,1-Math.abs(y-Math.sin(x*3.5-t*3)*a*.85)/.5);break;case 4:v=Math.max(0,Math.min(1,(.1+a*1.25-Math.hypot(x,y*.775))/.35))*(.12+.88*a);break;case 5:v=Math.max(0,Math.min(1,(1.18-1.06*amount-ax)/.16));col=blendHex(cfg.base,cfg.loud,amount);break;case 6:v=1;break;case 7:v=.1+.9*(.5-.5*Math.cos(t*2));break;case 8:v=Math.max(0,1-Math.abs(Math.hypot(x,y*.775)-(t%1.2)*1.8)/.45);break;
   case 9:{const height=.65+.25*Math.sin(t*2+x*4)+.1*Math.sin(t*7-x*8);const h=Math.max(0,Math.min(1,(height-(1-y)*.5)*1.6*cfg.fireIntensity-cfg.fireCooling*.5));v=h;col=blendHex(cfg.fireLow,cfg.fireHigh,h);break;}
   case 10:{const lo=a,mid=.5+.5*Math.sin(t*2.5),hi=.5+.5*Math.sin(t*4.7);const wl=Math.max(0,Math.min(1,.5+y*.75))*lo*cfg.musicGain,wm=(1-ay*.7)*mid*cfg.musicGain,wh=Math.max(0,Math.min(1,.5-y*.75))*hi*cfg.musicGain;col=[16,8,0].reduce((c,s)=>c|(Math.min(255,Math.round(((cfg.musicLow>>s)&255)*wl+((cfg.musicMid>>s)&255)*wm+((cfg.musicHigh>>s)&255)*wh))<<s),0);v=a;break;}}
  const rgb=[col>>16&255,col>>8&255,col&255].map(c=>Math.round(c*v*cfg.brightness/255));pixels+=hex(rgb);
 }
 showState({mode:cfg.mode,lastMode:cfg.lastMode,primaryMask:cfg.primaryMask,pct:73,v:3.89,batteryValid:true,level:a,bass:a,db:Math.round(-50+a*35),clip:false,mic:true,roar:state,pixels});demoFrame=requestAnimationFrame(demoLoop);
}
function blendHex(a,b,t){return [16,8,0].reduce((r,s)=>r|(Math.round(((a>>s)&255)*(1-t)+((b>>s)&255)*t)<<s),0);}
$('demo').onclick=()=>{
 if(demo){demo=false;cancelAnimationFrame(demoFrame);$('demo').textContent='Демо';disconnected();return;}
 if(device?.gatt.connected){device.gatt.disconnect();setTimeout(startDemo,100);}else startDemo();
};
function startDemo(){resetPowerHistory();demo=true;ready=false;$('login').hidden=true;$('controls').disabled=false;$('demo').textContent='Выйти из демо';status('Демо · без подключения');$('hint').textContent='Анимация интерфейса. Датчики и заряд смоделированы.';notice('');buildControls();demoFrame=requestAnimationFrame(demoLoop);}
if('serviceWorker'in navigator&&isSecureContext)navigator.serviceWorker.register('./sw.js').catch(()=>{});
buildControls();
if(!isSecureContext)$('hint').textContent='Для подключения размести папку web на HTTPS. Демо работает и локально.';
