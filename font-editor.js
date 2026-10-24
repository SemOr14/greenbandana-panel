'use strict';
(() => {
 const DEFAULT_ROWS={"А":[".##.","#..#","####","#..#","#..#"],"Б":["###.","#...","###.","#..#","###."],"В":["###.","#..#","###.","#..#","###."],"Г":["####","#...","#...","#...","#..."],"Д":[".##.","#..#","#..#","####","#..#"],"Е":["####","#...","###.","#...","####"],"Ж":["#.#.","#.#.",".##.","#.#.","#.#."],"З":["###.","...#",".##.","...#","###."],"И":["#..#","##.#","#.##","#..#","#..#"],"Й":[".#.#","#..#","##.#","#.##","#..#"],"К":["#..#","#.#.","##..","#.#.","#..#"],"Л":["..##",".#.#","#..#","#..#","#..#"],"М":["#..#","####","#.##","#..#","#..#"],"Н":["#..#","#..#","####","#..#","#..#"],"О":[".##.","#..#","#..#","#..#",".##."],"П":["####","#..#","#..#","#..#","#..#"],"Р":["###.","#..#","###.","#...","#..."],"С":[".###","#...","#...","#...",".###"],"Т":["####",".##.",".##.",".##.",".##."],"У":["#..#","#..#",".###","..#.",".#.."],"Ф":[".##.","#..#","####",".##.",".##."],"Х":["#..#",".##.",".##.",".##.","#..#"],"Ц":["#..#","#..#","#..#","#..#","###."],"Ч":["#..#","#..#","####","...#","...#"],"Ш":["#.#.","#.#.","#.#.","#.#.","####"],"Щ":["#.#.","#.#.","#.#.","#.##","####"],"Ъ":["##..",".#..","###.","#..#","###."],"Ы":["#..#","#..#","###.","#..#","###."],"Ь":["#...","#...","###.","#..#","###."],"Э":[".###","...#",".##.","...#",".###"],"Ю":["#.##","#..#","#..#","#..#","#.##"],"Я":[".###","#..#",".###","..#.","#..#"],"A":[".##.","#..#","####","#..#","#..#"],"B":["###.","#..#","###.","#..#","###."],"C":[".###","#...","#...","#...",".###"],"D":["###.","#..#","#..#","#..#","###."],"E":["####","#...","###.","#...","####"],"F":["####","#...","###.","#...","#..."],"G":[".###","#...","#.##","#..#",".###"],"H":["#..#","#..#","####","#..#","#..#"],"I":["####",".##.",".##.",".##.","####"],"J":["..##","...#","...#","#..#",".##."],"K":["#..#","#.#.","##..","#.#.","#..#"],"L":["#...","#...","#...","#...","####"],"M":["#..#","####","#.##","#..#","#..#"],"N":["#..#","##.#","#.##","#..#","#..#"],"O":[".##.","#..#","#..#","#..#",".##."],"P":["###.","#..#","###.","#...","#..."],"Q":[".##.","#..#","#.##","#.##",".###"],"R":["###.","#..#","###.","#.#.","#..#"],"S":[".###","#...",".##.","...#","###."],"T":["####",".##.",".##.",".##.",".##."],"U":["#..#","#..#","#..#","#..#",".##."],"V":["#..#","#..#","#..#",".##.",".##."],"W":["#..#","#..#","#.##","####","#..#"],"X":["#..#",".##.",".##.",".##.","#..#"],"Y":["#..#",".##.",".##.",".##.",".##."],"Z":["####","...#","..#.",".#..","####"],"0":[".##.","#..#","#.##","##.#",".##."],"1":["..#.",".##.","..#.","..#.",".###"],"2":[".##.","#..#","..#.",".#..","####"],"3":["###.","...#",".##.","...#","###."],"4":["#..#","#..#","####","...#","...#"],"5":["####","#...","###.","...#","###."],"6":[".##.","#...","###.","#..#",".##."],"7":["####","...#","..#.",".#..",".#.."],"8":[".##.","#..#",".##.","#..#",".##."],"9":[".##.","#..#",".###","...#",".##."]};
 const STORE_KEY='greenbandana-font-v1';
 const groups=[
  ['Кириллица','АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'],
  ['Латиница','ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ['Цифры','0123456789'],
  ['Знаки','!?.,:;+-/=#*()♥ ']
 ];
 const labels={' ':'Пробел'};
 const chars=groups.flatMap(([,s])=>Array.from(s));
 const uniqueChars=[...new Set(chars)];
 const $=id=>document.getElementById(id), ns='http://www.w3.org/2000/svg';
 const positions=[];
 for(let row=0,start=0;row<5;row++){
  const n=row===2?7:6;
  for(let j=0;j<n;j++){
   const index=start+(row%2?n-1-j:j);
   positions[index]={index,x:(j-(n-1)/2)*16.5,y:(row-2)*14.8,row};
  }
  start+=n;
 }
 const rowPoints=Array.from({length:5},(_,row)=>positions.filter(p=>p.row===row).sort((a,b)=>a.x-b.x).slice(1,6));
 function defaultBits(ch){
  const rows=DEFAULT_ROWS[ch]||({
   '!':['.#..','.#..','.#..','....','.#..'],'?':['.##.','...#','..#.','....','..#.'],
   '.':['....','....','....','....','..#.'],',':['....','....','....','..#.','.#..'],
   ':':['....','..#.','....','..#.','....'],';':['....','..#.','....','..#.','.#..'],
   '-':['....','....','####','....','....'],'+':['....','..#.','.###','..#.','....'],
   '/':['...#','..#.','..#.','.#..','#...'],'=':['....','####','....','####','....'],
   '#':['.#.#','####','.#.#','####','.#.#'],'*':['....','#.#.','.#..','#.#.','....'],
   '(':['..#.','.#..','.#..','.#..','..#.'],')':['.#..','..#.','..#.','..#.','.#..'],
   '♥':['#.#.','####','.##.','.##.','....']
  })[ch]||['....','....','....','....','....'];
  const sourceWidth=rows[0].length,left=Math.ceil((5-sourceWidth)/2);
  const bits=[];
  for(const row of rows){for(let col=0;col<5;col++){const sourceCol=col-left;bits.push(sourceCol>=0&&sourceCol<sourceWidth&&row[sourceCol]==='#'?1:0);}}
  return bits.join('');
 }
 const defaults=Object.fromEntries(uniqueChars.map(ch=>[ch,defaultBits(ch)]));
 function cleanFont(value){
  if(!value||typeof value!=='object')return {...defaults};
  const result={...defaults};
  for(const ch of uniqueChars){const bits=value[ch];if(typeof bits==='string'&&/^[01]{25}$/.test(bits))result[ch]=bits;}
  return result;
 }
 function readSaved(){try{return cleanFont(JSON.parse(localStorage.getItem(STORE_KEY))?.glyphs);}catch{return {...defaults};}}
 let glyphs=readSaved(), selectedChar=uniqueChars[0];
 const select=$('fontChar');
 for(const [groupName,text] of groups){
  const group=document.createElement('optgroup');group.label=groupName;
  for(const ch of Array.from(text)){
   const option=document.createElement('option');option.value=ch;option.textContent=labels[ch]||ch;group.append(option);
  }
  select.append(group);
 }
 // Remove repeated punctuation from the select while retaining the groups.
 const seen=new Set();for(const option of select.querySelectorAll('option')){if(seen.has(option.value))option.remove();else seen.add(option.value);}
 const svg=$('fontMatrix'), dotByLed=new Map();
 const selectedCellByLed=new Map();
 rowPoints.forEach((rowPoints,row)=>rowPoints.forEach((p,col)=>selectedCellByLed.set(p.index,row*5+col)));
 positions.forEach(p=>{
  const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',5.0);circle.classList.add('fontDot');
  const cell=selectedCellByLed.get(p.index);
  if(cell===undefined){circle.classList.add('fontDotLocked');const title=document.createElementNS(ns,'title');title.textContent='Крайний диод не входит в область символов';circle.append(title);}
  else{circle.dataset.cell=cell;circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',`Пиксель ${Math.floor(cell/5)+1}, ${cell%5+1}`);circle.addEventListener('click',()=>toggleCell(cell));circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleCell(cell);}});}
  svg.append(circle);dotByLed.set(p.index,circle);
 });
 function widthOf(bits){let lo=5,hi=-1;for(let r=0;r<5;r++)for(let c=0;c<5;c++)if(bits[r*5+c]==='1'){lo=Math.min(lo,c);hi=Math.max(hi,c);}return hi<0?0:Math.max(3,hi-lo+1);}
 function paint(){
  const bits=glyphs[selectedChar]||defaults[selectedChar];
  for(const p of positions){const circle=dotByLed.get(p.index),cell=selectedCellByLed.get(p.index);circle.setAttribute('fill',cell!==undefined&&bits[cell]==='1'?'#8ff0a0':'#17221b');circle.classList.toggle('fontDotOn',cell!==undefined&&bits[cell]==='1');}
  const width=widthOf(bits);$('fontWidth').textContent=width?`Ширина: ${width} px`:'Пустой знак';
  $('fontStatus').textContent='Изменения применяются только к предпросмотру. Сохрани шрифт в браузере, чтобы он остался на этом устройстве.';
 }
 function toggleCell(cell){const a=glyphs[selectedChar].split('');a[cell]=a[cell]==='1'?'0':'1';glyphs[selectedChar]=a.join('');paint();}
 select.value=selectedChar;select.addEventListener('change',()=>{selectedChar=select.value;paint();});paint();
 $('fontResetGlyph').addEventListener('click',()=>{glyphs[selectedChar]=defaults[selectedChar];paint();});
 $('fontResetAll').addEventListener('click',()=>{glyphs={...defaults};paint();$('fontStatus').textContent='Исходный шрифт восстановлен в редакторе. Нажми «Сохранить шрифт в браузере», чтобы закрепить.';});
 $('fontSave').addEventListener('click',()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify({version:1,glyphs}));$('fontStatus').textContent='Сохранено в этом браузере. В маску ничего не отправлялось.';}catch{$('fontStatus').textContent='Не удалось сохранить в браузере. Попробуй экспортировать JSON.';}});
 $('fontExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,glyphs},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='greenbandana-font.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
 $('fontImport').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const value=JSON.parse(await file.text());if(value.version!==1||!value.glyphs)throw Error();glyphs=cleanFont(value.glyphs);selectedChar=select.value;paint();$('fontStatus').textContent='Файл загружен в редактор. Нажми «Сохранить шрифт в браузере», чтобы закрепить.';}catch{$('fontStatus').textContent='Не удалось прочитать шрифт. Нужен JSON, ранее экспортированный этой панелью.';}finally{e.target.value='';}});
})();
