from pathlib import Path
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle,FancyBboxPatch,Circle
import matplotlib.patheffects as pe
P=Path(__file__).resolve().parent
ROOT=P.parent
plt.rcParams.update({'font.family':'DejaVu Sans','svg.fonttype':'none','svg.image_inline':True})
fig=plt.figure(figsize=(18,20),facecolor='white');ax=fig.add_axes([0,0,1,1]);ax.set_xlim(0,1800);ax.set_ylim(2000,0);ax.axis('off')
C={'5v':'#dc2943','gnd':'#263644','3v3':'#dc8d00','bclk':'#245ed2','ws':'#0699ac','sd':'#8251ba','data':'#078e59','bat':'#ac5d24','next':'#b83980','prev':'#697f99','ink':'#223344'}
texts=[]
def text(x,y,s,size=12,c='ink',ha='left',weight='normal',bg=True):texts.append((x,y,s,size,C.get(c,c),ha,weight,bg))
def wire(points,c,lw=2.7):
 co=C.get(c,c);x,y=zip(*points)
 line,=ax.plot(x,y,color=co,lw=lw,solid_capstyle='round',zorder=3)
 line.set_path_effects([pe.Stroke(linewidth=lw+3.3,foreground='white'),pe.Normal()])
def dot(p,c,r=4):ax.add_patch(Circle(p,r,fc=C.get(c,c),ec='white',lw=.9,zorder=5))
def pad(p,c):dot(p,c,5)
def card(x,y,w,h,fill='#f4f7fa',edge='#d5dfe6'):
 ax.add_patch(FancyBboxPatch((x,y),w,h,boxstyle='round,pad=0,rounding_size=14',fc=fill,ec=edge,lw=1,zorder=0))
def photo(filename,crop,x,y,width):
 asset={(480,285,810,835):'charger_front.png',(875,285,1230,880):'boost_front.png',(1190,245,1590,780):'esp_back.png',(1640,300,1930,570):'mic_back.png'}[crop]
 im=Image.open(P/'assets'/asset)
 height=im.height*width/im.width
 ax.imshow(im,extent=(x,x+width,y+height,y),zorder=1)
 def at(px,py):return (x+(px-crop[0])*width/im.width,y+(py-crop[1])*width/im.width)
 return at,height

def resistor(a,b,label,c='ink'):
 x1,y1=a;x2,y2=b
 if y1==y2:
  mid=(x1+x2)/2;wire([a,(mid-22,y1)],c);wire([(mid+22,y1),b],c)
  ax.add_patch(Rectangle((mid-22,y1-6),44,12,fc='white',ec=C.get(c,c),lw=1.7,zorder=4));text(mid,y1-19,label,10,c,'center')
 else:
  mid=(y1+y2)/2;wire([a,(x1,mid-18)],c);wire([(x1,mid+18),b],c)
  ax.add_patch(Rectangle((x1-6,mid-18),12,36,fc='white',ec=C.get(c,c),lw=1.7,zorder=4));text(x1-17,mid,label,10,c,'right')
def capacitor(x,top,bottom,name,c='5v'):
 mid=(top+bottom)/2
 wire([(x,top),(x,mid-4)],c);wire([(x,mid+4),(x,bottom)],'gnd')
 wire([(x-12,mid-4),(x+12,mid-4)],c,2);wire([(x-12,mid+4),(x+12,mid+4)],'gnd',2)
 text(x+20,mid,name,10,'ink')
# Header and exact photos.
text(35,40,'Бандана · фотосхема · GPIO7 через резистор 330 Ом',25,weight='bold',bg=False)
text(35,77,'ESP32-S3 SuperMini · INMP441 · WS2812B, 31 диод · прошивка GreenBandana 1.1.0',13,c='#617385',bg=False)
# Top row photos.
card(40,180,210,150,'#fff7ed');text(60,208,'АККУМУЛЯТОР 1S',14,weight='bold');text(60,237,'Li-ion / LiPo 3,7 В',12);text(60,260,'До 4,2 В после заряда',11)
batplus=(250,287);batminus=(250,315);text(230,286,'+ ',12,'5v','right');text(230,314,'− ',12,'gnd','right')
charger,_=photo('image(20261022-190227).png',(480,285,810,835),380,185,190)
text(380,154,'Твой TP4056 с защитой',14,weight='bold')
cp={k:charger(x,360) for k,x in [('OUT+',518),('B+',577),('B−',714),('OUT−',775)]}
for k,p in cp.items():text(p[0],p[1]-17,k,10,'gnd' if '−'in k else '5v','center')
text(380,520,'USB-C — зарядка АКБ',11)
boost,_=photo('image(20261022-190227).png',(875,285,1230,880),760,185,190)
text(760,154,'Твой MT3608',14,weight='bold')
bp={'OUT+':boost(924,344),'OUT−':boost(1187,344),'IN+':boost(925,830),'IN−':boost(1190,830)}
for k,p in bp.items():text(p[0],p[1]-17,k,10,'gnd' if '−'in k else '5v','center')
text(760,520,'Micro-USB — вход, НЕ зарядка',10)
# ESP photo: no mirroring. Physical coordinates measured in supplied reverse-side photo.
esp,_=photo('image(20261022-190233).png',(1190,245,1590,780),520,850,280)
text(520,811,'Твоя ESP32-S3 SuperMini',15,weight='bold');text(520,833,'Обратная сторона · USB вниз · не зеркалить',10)
e={7:esp(1230,291),6:esp(1232,344),5:esp(1233,396),4:esp(1234,450),1:esp(1237,609),8:esp(1549,281),9:esp(1548,334),'3V3':esp(1544,599),'GND':esp(1543,652),'5V':esp(1542,704)}
for k,p in e.items():
 co={1:'bat',4:'bclk',5:'ws',6:'sd',7:'data',8:'next',9:'prev','3V3':'3v3','GND':'gnd','5V':'5v'}[k]
 text(p[0]+(-17 if isinstance(k,int)and k<8 else 18),p[1]-9,('GPIO'+str(k))if isinstance(k,int)else k,11,co,'right'if isinstance(k,int)and k<8 else'left',weight='bold')
# Mic reverse side.
mic,_=photo('image(20261022-190233).png',(1640,300,1930,570),1210,840,250)
text(1210,805,'Твой INMP441',15,weight='bold');text(1210,826,'Обратная сторона, как на фото',10)
m={'L/R':mic(1695.5,414),'WS':mic(1697.5,468),'SCK':mic(1699.5,520),'GND':mic(1855.5,408),'VDD':mic(1857,461),'SD':mic(1861.5,513)}
for k,p in m.items():
 co={'L/R':'gnd','WS':'ws','SCK':'bclk','GND':'gnd','VDD':'3v3','SD':'sd'}[k]
 text(p[0]+(-15 if k in ['L/R','WS','SCK']else 17),p[1]-11,k,11,co,'right'if k in ['L/R','WS','SCK']else'left',weight='bold')
# Matrix diagram, components without photos are explicitly marked.
card(1230,185,470,335,'#f1f8f3');text(1250,213,'WS2812B · условно, вид спереди',14,weight='bold')
leds={};start=0
for r in range(5):
 n=7 if r==2 else 6
 for j in range(n):
  idx=start+(n-1-j if r%2 else j);x=1465+(j-(n-1)/2)*60;y=280+r*40;leds[idx]=(x,y)
  ax.add_patch(FancyBboxPatch((x-12,y-12),24,24,boxstyle='round,pad=0,rounding_size=4',fc='#93d8a5',ec='#3b9060',lw=1,zorder=4));text(x,y+1,str(idx),9,'ink','center',bg=False)
 start+=n
for i in range(30):
 a,b=leds[i],leds[i+1]
 if a[1]==b[1]:wire([a,b],'#9bb8a4',1.4)
 else:
  side=1667 if i in [5,18] else 1263
  wire([a,(side,a[1]),(side,b[1]),b],'#9bb8a4',1.4)
wire([(1230,280),leds[0]],'data');text(1241,257,'DIN → №0',11,'data',weight='bold')
text(1250,483,'Данные: DOUT → DIN следующего ряда.',10)
text(1250,504,'+5V / GND всех пяти рядов — параллельно.',10)
text(1687,237,'+5V',11,'5v','right',weight='bold');text(1687,460,'GND',11,'gnd','right',weight='bold')
# Protected battery charging power path.
wire([batplus,(280,batplus[1]),(280,130),(cp['B+'][0],130),cp['B+']],'5v')
wire([batminus,(300,batminus[1]),(300,150),(cp['B−'][0],150),cp['B−']],'gnd')
wire([cp['OUT+'],(cp['OUT+'][0],170),(335,170),(335,560),(600,560)],'5v')
# Main latching switch.
wire([(600,560),(612,560)],'5v');dot((612,560),'5v',3);dot((656,560),'5v',3);wire([(612,560),(644,542)],'5v')
wire([(656,560),(bp['IN+'][0],560),bp['IN+']],'5v')
text(625,588,'S1 · с фиксацией',12,'5v','center',weight='bold')
wire([cp['OUT−'],(cp['OUT−'][0],170),(610,170),(610,530),(bp['IN−'][0],530),bp['IN−']],'gnd')
wire([(bp['IN−'][0],530),(1760,530)],'gnd');dot((1760,530),'gnd')
wire([bp['OUT+'],(bp['OUT+'][0],100),(1720,100),(1720,1220)],'5v',3)
wire([bp['OUT−'],(bp['OUT−'][0],120),(1760,120),(1760,1730)],'gnd',3)
text(1620,91,'ШИНА +5 В',11,'5v','right',weight='bold')
wire([(1720,240),(1700,240)],'5v');dot((1720,240),'5v')
wire([(1760,450),(1700,450)],'gnd');dot((1760,450),'gnd')
text(965,250,'До подключения выставить',11)
text(965,275,'MT3608 на 5,0 В!',16,'5v',weight='bold')
text(965,306,'Сначала проверить мультиметром.',10)
text(965,333,'Лента питается напрямую от MT3608,',10)
text(965,354,'а не через плату ESP.',10)
# Bulk capacitor.
wire([(1720,620),(1450,620)],'5v');dot((1720,620),'5v')
capacitor(1450,620,695,'C1: 1000 мкФ / 10 В');text(1431,641,'+',12,'5v','right')
wire([(1450,695),(1760,695)],'gnd');dot((1760,695),'gnd')
# 5 V board power with explicit removable link.
wire([(1720,1220),(900,1220),(900,e['5V'][1]),(856,e['5V'][1])],'5v');dot((1720,1220),'5v')
y=e['5V'][1];wire([(856,y),(844,y)],'5v');wire([(832,y),e['5V']],'5v');
ax.add_patch(Rectangle((832,y-6),12,12,fc='white',ec=C['5v'],lw=1.6,zorder=5));text(840,y+22,'JP1: разъём +5V',10,'5v','center')
wire([e['GND'],(930,e['GND'][1]),(930,1280),(1760,1280)],'gnd');dot((1760,1280),'gnd')
# I2S pin-to-pin wires, routed around photographs.
wire([e[4],(400,e[4][1]),(400,740),(1100,740),(1100,m['SCK'][1]),m['SCK']],'bclk')
wire([e[5],(420,e[5][1]),(420,760),(1080,760),(1080,m['WS'][1]),m['WS']],'ws')
wire([e[6],(440,e[6][1]),(440,780),(1510,780),(1510,m['SD'][1]),m['SD']],'sd')
text(1000,727,'GPIO4 → SCK',11,'bclk','right');text(1000,752,'GPIO5 → WS',11,'ws','right');text(1000,778,'SD → GPIO6',11,'sd','right')
wire([e['3V3'],(970,e['3V3'][1]),(970,820),(1470,820),(1470,m['VDD'][1]),m['VDD']],'3v3')
text(1010,845,'VDD микрофона: только 3,3 В',11,'3v3',weight='bold')
wire([m['GND'],(1570,m['GND'][1]),(1760,m['GND'][1])],'gnd');dot((1760,m['GND'][1]),'gnd')
wire([m['L/R'],(1170,m['L/R'][1]),(1170,1110),(1760,1110)],'gnd');dot((1760,1110),'gnd');text(1190,1137,'L/R на GND: левый I2S-канал',10)
# Microphone pull-down and bypass.
resistor((1510,m['SD'][1]),(1510,1110),'R2: 100 кОм','sd');dot((1510,m['SD'][1]),'sd');dot((1510,1110),'gnd')
wire([(1470,m['VDD'][1]),(1630,m['VDD'][1])],'3v3');dot((1470,m['VDD'][1]),'3v3')
capacitor(1630,m['VDD'][1],1110,'C2: 100 нФ','3v3');dot((1630,1110),'gnd')
# Buttons. Two-contact symbols prevent ambiguity about 4-pin tactile modules.
for yy,label,desc in [(970,'S2 · GPIO8','Круг основных; долго: ♥'),(1150,'S3 · GPIO9','Смыкание / возврат')]:
 card(70,yy-50,235,95,'#f5f5fa');text(85,yy-28,label,12,weight='bold')
 wire([(140,yy),(155,yy)],'next'if yy==970 else'prev');wire([(205,yy),(220,yy)],'gnd')
 dot((155,yy),'ink',3);dot((205,yy),'ink',3);wire([(155,yy-8),(205,yy-8)],'ink',1.6)
 wire([(180,yy-15),(180,yy-8)],'ink',1.6);text(85,yy+27,desc,9)
wire([e[8],(850,e[8][1]),(850,650),(130,650),(130,970),(140,970)],'next')
wire([e[9],(870,e[9][1]),(870,630),(90,630),(90,1150),(140,1150)],'prev')
wire([(220,970),(310,970),(310,1280),(930,1280)],'gnd');dot((930,1280),'gnd')
wire([(220,1150),(310,1150)],'gnd');dot((310,1150),'gnd')
text(75,1230,'Обе кнопки без фиксации.',10)
text(75,1250,'Входы ESP: INPUT_PULLUP.',10)
# Direct WS2812B data, as requested: GPIO7 -> 330 ohm -> DIN.
wire([e[7],(460,e[7][1]),(460,1320),(970,1320),(970,1420),(1100,1420)],'data')
resistor((1100,1420),(1420,1420),'R1: 330 Ом','data')
wire([(1420,1420),(1580,1420),(1580,580),(1200,580),(1200,280),(1230,280)],'data')
text(735,1304,'GPIO7 → резистор → DIN',11,'data')
text(1330,564,'Данные ленты: сигнал ESP 3,3 В',11,'data','center')
text(1060,1360,'ПРЯМОЕ ПОДКЛЮЧЕНИЕ ЛЕНТЫ',14,'data',weight='bold')
text(1060,1480,'Один резистор 330 Ом последовательно в DATA.',11)
text(1060,1506,'Резистор — у DIN первого диода. Провод короткий.',11)
text(1060,1532,'Общая земля ESP и ленты обязательна.',11)
# ADC voltage divider with a switched, protected battery feed.
wire([(710,560),(710,600),(40,600),(40,1600),(130,1600)],'bat');dot((710,560),'5v')
text(68,1420,'ИЗМЕРЕНИЕ АККУМУЛЯТОРА',14,weight='bold')
text(68,1448,'VBAT_SW: после S1, до MT3608.',11,'bat')
text(68,1470,'Плюс НЕ брать с выхода 5 В.',11,'bat',weight='bold')
resistor((130,1600),(350,1600),'R3: 100 кОм, 1%','bat');wire([(350,1600),(480,1600),(480,e[1][1]),e[1]],'bat')
dot((440,1600),'bat');resistor((440,1600),(440,1730),'R4: 100 кОм, 1%','bat')
wire([(440,1730),(1760,1730)],'gnd');dot((1760,1730),'gnd')
wire([(440,1600),(620,1600)],'bat');capacitor(620,1600,1730,'C4: 100 нФ','bat');dot((620,1730),'gnd')
text(68,1680,'При АКБ 4,2 В на GPIO1 — 2,1 В.',11)
# Endpoints and junctions on the original solder pads.
for k,p in cp.items():pad(p,'gnd'if'−'in k else'5v')
for k,p in bp.items():pad(p,'gnd'if'−'in k else'5v')
for k,p in e.items():pad(p,{1:'bat',4:'bclk',5:'ws',6:'sd',7:'data',8:'next',9:'prev','3V3':'3v3','GND':'gnd','5V':'5v'}[k])
for k,p in m.items():pad(p,{'L/R':'gnd','WS':'ws','SCK':'bclk','GND':'gnd','VDD':'3v3','SD':'sd'}[k])
pad(batplus,'5v');pad(batminus,'gnd')
# Notes, full-width and away from routed wires.
card(35,1780,1730,175,'#eef3f8');text(55,1810,'Перед USB-прошивкой: выключить S1 и разъединить JP1 (+5V к ESP).',14,weight='bold')
text(55,1838,'Зарядка — через USB-C TP4056 при выключенной маске. Micro-USB MT3608 не заряжает аккумулятор.',12)
text(55,1867,'Все земли нагрузки — на OUT− защиты. Не соединять их напрямую с B−. Точка = соединение; пересечение без точки = нет соединения.',11)
text(55,1894,'Фото плат не зеркалены. Аккумулятор, кнопки и лента показаны условно. Схема соответствует назначению GPIO в прошивке.',11)
text(55,1922,'C2 на микрофонном модуле может уже быть. Ёмкости ставить рядом с питаемыми узлами; C1 — у входа питания ленты.',11)
# Legend.
for x,key,label in [(50,'5v','+5 В / питание'),(350,'gnd','Общая земля'),(650,'3v3','3,3 В микрофона'),(1010,'data','Данные ленты'),(1360,'bat','Измерение АКБ')]:
 wire([(x,1980),(x+28,1980)],key,3);text(x+38,1980,label,10,bg=False)
for x,y,s,size,c,ha,weight,bg in texts:
 ax.text(x,y,s,fontsize=size,color=c,ha=ha,va='center',weight=weight,zorder=10,bbox={'facecolor':'white','edgecolor':'none','pad':1,'alpha':.92}if bg else None)
fig.savefig(P/'bandana_photo_wiring.png',dpi=180)
fig.savefig(P/'bandana_photo_wiring.svg')
print(P/'bandana_photo_wiring.png')
