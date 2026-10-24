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
 function expandLegacyBits(bits){const full=Array(31).fill('0');rowPoints.forEach((row,r)=>row.forEach((p,c)=>full[p.index]=bits[r*5+c]));return full.join('');}
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
  return expandLegacyBits(bits.join(''));
 }
 const defaults=Object.fromEntries(uniqueChars.map(ch=>[ch,defaultBits(ch)]));
 function cleanFont(value){
  if(!value||typeof value!=='object')return {...defaults};
  const result={...defaults};
  for(const ch of uniqueChars){const bits=value[ch];if(typeof bits==='string'&&/^[01]{31}$/.test(bits))result[ch]=bits;else if(typeof bits==='string'&&/^[01]{25}$/.test(bits))result[ch]=expandLegacyBits(bits);}
  return result;
 }
 function readSaved(){try{return cleanFont(JSON.parse(localStorage.getItem(STORE_KEY))?.glyphs);}catch{return {...defaults};}}
 let glyphs=readSaved(), selectedChar=uniqueChars[0];
 const charInput=$('fontCharInput'), svg=$('fontMatrix'), dotByLed=new Map();
 const selectedCellByLed=new Map(positions.map(p=>[p.index,p.index]));
 positions.forEach(p=>{
  const circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',p.x);circle.setAttribute('cy',p.y);circle.setAttribute('r',5.0);circle.classList.add('fontDot');
  const cell=p.index;circle.dataset.cell=cell;circle.setAttribute('tabindex','0');circle.setAttribute('role','button');circle.setAttribute('aria-label',`Диод ${cell+1}`);circle.addEventListener('click',()=>toggleCell(cell));circle.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleCell(cell);}});
  svg.append(circle);dotByLed.set(p.index,circle);
 });
 function widthOf(bits){let width=0;for(let row=0;row<5;row++){const active=positions.filter(p=>p.row===row&&bits[p.index]==='1');if(active.length){const xs=active.map(p=>p.x);width=Math.max(width,Math.round((Math.max(...xs)-Math.min(...xs))/16.5)+1);}}return width?Math.max(3,width):0;}
 function paint(){
  const bits=glyphs[selectedChar]||defaults[selectedChar];
  for(const p of positions){const circle=dotByLed.get(p.index),cell=selectedCellByLed.get(p.index);circle.setAttribute('fill',cell!==undefined&&bits[cell]==='1'?'#8ff0a0':'#17221b');circle.classList.toggle('fontDotOn',cell!==undefined&&bits[cell]==='1');}
  const width=widthOf(bits);$('fontWidth').textContent=width?`Ширина: ${width} px`:'Пустой знак';
 }
 function setSymbol(ch){selectedChar=ch;charInput.value=ch===' '?'':ch;charInput.placeholder=ch===' '?'Пробел':'Введите знак';paint();$('fontStatus').textContent=`Выбран символ «${ch===' '?'Пробел':ch}». Редактирование не затрагивает прошивку.`;}
 function toggleCell(cell){const a=glyphs[selectedChar].split('');a[cell]=a[cell]==='1'?'0':'1';glyphs[selectedChar]=a.join('');paint();$('fontStatus').textContent='Знак изменён в редакторе. Нажми «Сохранить шрифт в браузере», чтобы закрепить.';}
 charInput.addEventListener('input',()=>{const raw=charInput.value;if(!raw)return;const ch=Array.from(raw.toLocaleUpperCase('ru-RU'))[0];if(!uniqueChars.includes(ch)){$('fontStatus').textContent='Этого символа нет в наборе. Можно редактировать русские и английские заглавные буквы, цифры и знаки.';return;}setSymbol(ch);});
 $('fontSpace').addEventListener('click',()=>setSymbol(' '));
 charInput.value=selectedChar;paint();
 $('fontResetGlyph').addEventListener('click',()=>{glyphs[selectedChar]=defaults[selectedChar];paint();$('fontStatus').textContent='Символ восстановлен. Сохрани шрифт в браузере, чтобы закрепить.';});
 $('fontResetAll').addEventListener('click',()=>{glyphs={...defaults};paint();$('fontStatus').textContent='Исходный шрифт восстановлен в редакторе. Нажми «Сохранить шрифт в браузере», чтобы закрепить.';});
 $('fontSave').addEventListener('click',()=>{try{localStorage.setItem(STORE_KEY,JSON.stringify({version:1,glyphs}));$('fontStatus').textContent='Сохранено в этом браузере. В маску ничего не отправлялось.';}catch{$('fontStatus').textContent='Не удалось сохранить в браузере. Попробуй экспортировать JSON.';}});
 $('fontExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,glyphs},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='greenbandana-font.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
 $('fontImport').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{const value=JSON.parse(await file.text());if(value.version!==1||!value.glyphs)throw Error();glyphs=cleanFont(value.glyphs);selectedChar=select.value;paint();$('fontStatus').textContent='Файл загружен в редактор. Нажми «Сохранить шрифт в браузере», чтобы закрепить.';}catch{$('fontStatus').textContent='Не удалось прочитать шрифт. Нужен JSON, ранее экспортированный этой панелью.';}finally{e.target.value='';}});
})();
