#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include "bandana_led_layout.h"
namespace Mask {
constexpr int N=512, FS=16000, BANDS=8, LEDS=31, MODES=14;
constexpr float kPi=3.14159265358979323846f;
inline float bound(float v,float a=0,float b=1){return std::max(a,std::min(b,v));}
inline float mix(float a,float b,float t){return a+(b-a)*bound(t);}
struct Color {uint8_t r=0,g=0,b=0;};
static_assert(sizeof(Color)==3,"Custom animation storage expects RGB bytes");
using CustomFrames=std::array<std::array<std::array<Color,LEDS>,8>,3>;
inline Color color(uint32_t v){return {uint8_t(v>>16),uint8_t(v>>8),uint8_t(v)};}
inline Color blend(Color a,Color b,float t){return {uint8_t(mix(a.r,b.r,t)),uint8_t(mix(a.g,b.g,t)),uint8_t(mix(a.b,b.b,t))};}
inline Color scale(Color a,float f){f=bound(f);return {uint8_t(a.r*f),uint8_t(a.g*f),uint8_t(a.b*f)};}
inline float mouthRedBoost(float loudMix,Color loud){return 1.f+((loud.r>loud.g&&loud.r>loud.b)?.12f*bound(loudMix):0.f);}
inline float reduceMouthSensitivity(float level,int divisor,float floorDb,float ceilingDb){float span=std::max(.1f,ceilingDb-floorDb),attenuation=20.f*std::log10(float(std::max(1,divisor)));return bound(level-attenuation/span);}
struct Config {
 int mode=0,lastMode=0,brightness=90,currentLimitMa=900;
 int micSensitivity=1,voiceFocus=0,mouthSensitivity=2;
 uint32_t primaryMask=((1u<<11)-1)&~(1u<<5);
 int customFps=4,customCount=4,customSound=0;
 uint32_t fireLow=0xff1800,fireHigh=0xffdc40,musicLow=0xff1800,musicMid=0x00ff50,musicHigh=0x2060ff;
 float fireIntensity=.8f,fireCooling=.15f,musicGain=1.5f;
 uint32_t base=0x00ff18,loud=0xff0000,heart=0xff1680;
 float floorDb=-65,ceilingDb=-18,loudLevel=.82f;
 int bassLow=40,bassHigh=180,roarLow=100,roarHigh=1800;
 float bassGain=2,roarDb=-14,roarBandRatio=.35f;
 int roarTriggerMs=200,roarHoldMs=15000,roarCloseMs=350,roarOpenMs=1800,changeStableMs=1000;
 float changeDb=7,changeSpectrum=.20f,attackMs=45,releaseMs=180,speed=1,batteryCorrection=1;
};
// Mode 5 is a dedicated override; all other modes can be members of the primary cycle.
inline bool validPrimaryMask(uint32_t mask){return mask!=0&&(mask&~((1u<<MODES)-1))==0&&(mask&(1u<<5))==0;}
inline bool chooseMode(Config& c,int mode){
 if(mode<0||mode>=MODES)return false;
 if(mode==5){if(c.mode!=5)c.lastMode=c.mode;}
 else c.lastMode=mode;
 c.mode=mode;return true;
}
inline void toggleCollapse(Config& c){chooseMode(c,c.mode==5?c.lastMode:5);}
inline void nextPrimary(Config& c){
 int start=c.mode==5?c.lastMode:c.mode;
 for(int step=1;step<=MODES;step++){int target=(start+step)%MODES;if(c.primaryMask&(1u<<target)){chooseMode(c,target);return;}}
}
struct Audio {
 float db=-100,peakDb=-100,level=0,bass=0,roarRatio=0;
 float voiceScore=1;
 std::array<float,BANDS> spectrum{},display{};
 bool clip=false,ok=false;
};
class Analyzer {
 std::array<float,N> re{},im{};
 float smoothLevel=0,smoothBass=0;
 public:
 Audio run(const int32_t* samples,const Config& c){
  Audio a;double mean=0,sum=0;float peak=0;
  for(int i=0;i<N;i++)mean+=double(samples[i])/2147483648.;mean/=N;
  for(int i=0;i<N;i++){
   float s=float(double(samples[i])/2147483648.-mean);sum+=s*s;peak=std::max(peak,std::abs(s));
   re[i]=s*(.5f-.5f*std::cos(2*kPi*i/(N-1)));im[i]=0;
  }
  a.db=20*std::log10(std::max(1e-8f,float(std::sqrt(sum/N))));
  a.peakDb=20*std::log10(std::max(1e-8f,peak));a.clip=peak>=.98f;a.ok=true;
  for(int i=1,j=0;i<N;i++){int bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){std::swap(re[i],re[j]);std::swap(im[i],im[j]);}}
  for(int len=2;len<=N;len<<=1){float angle=-2*kPi/len;
   for(int start=0;start<N;start+=len){float wr=1,wi=0,cr=std::cos(angle),ci=std::sin(angle);
    for(int j=0;j<len/2;j++){int u=start+j,v=u+len/2;float tr=wr*re[v]-wi*im[v],ti=wr*im[v]+wi*re[v];
     re[v]=re[u]-tr;im[v]=im[u]-ti;re[u]+=tr;im[u]+=ti;float nw=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=nw;
    }
   }
  }
  const float edges[BANDS+1]={31.25,80,160,315,630,1250,2500,4000,8001};
  double total=0,bass=0,roar=0,voice=0;
  for(int k=1;k<N/2;k++){float f=float(k)*FS/N,p=re[k]*re[k]+im[k]*im[k];total+=p;
   if(f>=c.bassLow&&f<=c.bassHigh)bass+=p;
   if(f>=c.roarLow&&f<=c.roarHigh)roar+=p;
   if(f>=250&&f<=4000)voice+=p;
   for(int b=0;b<BANDS;b++)if(f>=edges[b]&&f<edges[b+1]){a.spectrum[b]+=p;break;}
  }
  // A single mic cannot identify a speaker. This heuristic prioritizes speech-band
  // energy and suppresses bass-heavy frames; vocals and instruments can still pass.
  float voiceShare=float(voice/std::max(1e-12,total));
  a.voiceScore=bound((voiceShare-.30f)/.45f);
  float attenuation=20.f*std::log10(float(std::max(1,c.micSensitivity)));
  float effectiveDb=a.db-attenuation;
  if(c.voiceFocus)effectiveDb=10.f*std::log10(std::max(1e-12f,float(voice)*float(16./(3.*N*N))))-attenuation;
  a.db=effectiveDb;
  for(int b=0;b<BANDS;b++){
   float db=10*std::log10(std::max(1e-12f,a.spectrum[b]*float(16./(3.*N*N))));
   float bandWeight=c.voiceFocus?(b<2?0.f:b>6?.35f:1.f):1.f;
   a.display[b]=bound((db-attenuation-c.floorDb)/(c.ceilingDb-c.floorDb))*bandWeight*(c.voiceFocus?a.voiceScore:1.f);
   a.spectrum[b]/=std::max(1e-12f,float(total));
   a.spectrum[b]*=bandWeight;
  }
  float spectralSum=0;for(float& v:a.spectrum){v*=c.voiceFocus?a.voiceScore:1.f;spectralSum+=v;}
  if(spectralSum>1e-8f)for(float& v:a.spectrum)v/=spectralSum;
  a.roarRatio=float(roar/std::max(1e-12,total))*(c.voiceFocus?a.voiceScore:1.f);
  float target=bound((effectiveDb-c.floorDb)/(c.ceilingDb-c.floorDb));
  float dt=1000.f*N/FS;
  smoothLevel+=(target-smoothLevel)*(1-std::exp(-dt/(target>smoothLevel?c.attackMs:c.releaseMs)));
  float bassDb=10*std::log10(std::max(1e-12f,float(bass)*float(16./(3.*N*N))))-attenuation;
  float bt=bound((bassDb-c.floorDb)/(c.ceilingDb-c.floorDb)*c.bassGain)*(c.voiceFocus?a.voiceScore:1.f);
  smoothBass+=(bt-smoothBass)*(1-std::exp(-dt/(bt>smoothBass?c.attackMs:c.releaseMs)));
  a.level=smoothLevel;a.bass=smoothBass;return a;
 }
};
inline float spectralDistance(const std::array<float,BANDS>& a,const std::array<float,BANDS>& b){
 float dot=0,aa=0,bb=0;for(int i=0;i<BANDS;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}
 if(aa<1e-10f||bb<1e-10f)return aa<1e-10f&&bb<1e-10f?0:1;
 return bound(1-dot/std::sqrt(aa*bb));
}
class Collapse {
 public:
 enum State {GREEN,CLOSING,RED,OPENING};State state=GREEN;
 float amount=0;uint32_t started=0;
 private:
 bool pending=false,changedPending=false,armed=true;uint32_t pendingAt=0,changedAt=0;
 float referenceDb=-100;std::array<float,BANDS> reference{};
 public:
 void reset(){state=GREEN;amount=0;pending=changedPending=false;armed=true;}
 void trigger(uint32_t now,const Audio& a){state=CLOSING;started=now;referenceDb=a.db;reference=a.spectrum;pending=changedPending=false;armed=false;}
 void tick(uint32_t now,const Audio& a,const Config& c){
  bool event=a.ok&&a.db>=c.roarDb&&a.roarRatio>=c.roarBandRatio;
  if(!event){armed=true;pending=false;}
  if(state==GREEN){amount=0;if(event&&armed){if(!pending){pending=true;pendingAt=now;}if(uint32_t(now-pendingAt)>=uint32_t(c.roarTriggerMs))trigger(now,a);}return;}
  if(state==CLOSING){amount=bound(float(uint32_t(now-started))/c.roarCloseMs);if(amount>=1){state=RED;started=now;}return;}
  if(state==RED){amount=1;
   bool changed=a.ok&&std::abs(a.db-referenceDb)>=c.changeDb&&spectralDistance(a.spectrum,reference)>=c.changeSpectrum;
   if(!changed)changedPending=false;
   else if(!changedPending){changedPending=true;changedAt=now;}
   if(changedPending&&uint32_t(now-started)>=uint32_t(c.roarHoldMs)&&uint32_t(now-changedAt)>=uint32_t(c.changeStableMs)){state=OPENING;started=now;pending=false;}
   return;
  }
  if(state==OPENING){
   amount=1-bound(float(uint32_t(now-started))/c.roarOpenMs);
   // A fresh sustained roar interrupts reopening. A changed but continuous loud background does not.
   if(event&&armed){if(!pending){pending=true;pendingAt=now;}if(uint32_t(now-pendingAt)>=uint32_t(c.roarTriggerMs)){trigger(now,a);return;}}
   if(amount<=0){state=GREEN;pending=changedPending=false;}
  }
 }
};
class Renderer {
 float previousBass=0,pulse=1;uint32_t last=0,lastFire=0,rng=0x4c7b91e5;
 const CustomFrames* customFrames=nullptr;
 std::array<std::array<float,7>,5> heat{};
 float random01(){rng^=rng<<13;rng^=rng>>17;rng^=rng<<5;return float(rng>>8)/16777216.f;}
 void advanceFire(uint32_t now,const Config& c){
  uint32_t interval=uint32_t(60/c.speed);
  if(uint32_t(now-lastFire)<interval)return;
  lastFire=now;auto old=heat;
  for(int row=0;row<4;row++)for(int col=0;col<7;col++){
   float rising=old[row+1][col]*.6f+old[row+1][std::max(0,col-1)]*.2f+old[row+1][std::min(6,col+1)]*.2f;
   heat[row][col]=bound(rising*.96f-random01()*c.fireCooling);
  }
  for(int col=0;col<7;col++){
   heat[4][col]=bound(old[4][col]*.45f+c.fireIntensity*(.25f+random01()*.65f));
   if(random01()<.18f*c.fireIntensity)heat[4][col]=bound(heat[4][col]+.5f);
  }
 }
 public:
 void setCustomFrames(const CustomFrames* frames){customFrames=frames;}
 std::array<Color,LEDS> render(uint32_t now,const Config& c,const Audio& a,const Collapse& roar,bool heart){
  if(c.mode==9)advanceFire(now,c);
  std::array<Color,LEDS> out{};float dt=last?uint32_t(now-last)/1000.f:.032f;last=now;
  if(a.bass-previousBass>.08f&&a.bass>.3f&&pulse>.25f)pulse=0;previousBass=a.bass;pulse+=dt*c.speed;
  Color base=color(c.base),loud=color(c.loud);float loudMix=bound((a.level-c.loudLevel)/std::max(.01f,1-c.loudLevel));
  float mouthLevel=reduceMouthSensitivity(a.level,c.mouthSensitivity,c.floorDb,c.ceilingDb);
  float mouthLoudMix=bound((mouthLevel-c.loudLevel)/std::max(.01f,1-c.loudLevel));Color mouthSpeech=blend(base,loud,mouthLoudMix);
  Color speech=blend(base,loud,loudMix);float t=now*.001f*c.speed;
  for(int i=0;i<LEDS;i++){
   auto p=BandanaMatrix::kPosition[i];float x=p.x_mm/49.5f,y=p.y_mm/29.6f,ax=std::abs(x),ay=std::abs(y),v=0;Color co=base;
   if(heart){
    // A silhouette drawn for the actual staggered 6/6/7/6/6 rows, not a rectangular bitmap.
    int row=int(std::lround((p.y_mm+29.6f)/14.8f));
    v=row==0?(ax>.30f&&ax<.72f):row==1?ax<.9f:row==2?ax<.80f:row==3?ax<.53f:ax<.18f;
    co=color(c.heart);
   }else switch(c.mode){
    case 0:{ // Speech mouth: envelope controls opening, spectral balance controls width.
     float hi=a.spectrum[4]+a.spectrum[5]+a.spectrum[6],lo=a.spectrum[1]+a.spectrum[2]+a.spectrum[3];
     float width=mix(.85f,.48f,bound(hi/(hi+lo+1e-6f)));
     float height=mix(.06f,1.f,mouthLevel);
     float ellipse=std::sqrt((x/width)*(x/width)+(y/height)*(y/height));
     v=1-bound(std::abs(ellipse-1)/.65f);if(mouthLevel<.12f)v=(1-bound(ay*3))*bound(1-ax);
     co=mouthSpeech;break;}
    case 1:{float gap=.12f+a.level*.88f;v=1-bound(std::abs(ay-gap)/.50f);co=speech;break;}
    case 2:{int band=std::min(7,std::max(0,int((x+1)*4)));float h=a.display[band]*2;
     v=bound((h-(1-y))/.45f+.5f);co=blend(base,loud,(1-y)/2);break;}
    case 3:{float wave=std::sin(x*3.5f-t*3)*a.level*.85f;v=1-bound(std::abs(y-wave)/.50f);co=speech;break;}
    case 4:{float radius=std::sqrt(x*x+y*y*.60f),size=.10f+a.bass*1.25f;
     v=bound((size-radius)/.35f)*(.12f+.88f*a.bass);co=blend(base,loud,a.bass);break;}
    case 5:{float width=mix(1.18f,.12f,roar.amount);v=bound((width-ax)/.16f);
     co=blend(base,loud,roar.amount);break;}
    case 6:v=1;break;
    case 7:v=.10f+.90f*(.5f-.5f*std::cos(t*2));break;
    case 8:{float r=std::sqrt(x*x+y*y*.6f);v=bound(1-std::abs(r-pulse*1.8f)/.45f)*bound(1-pulse/1.2f);co=blend(base,loud,a.bass);break;}
    case 9:{
     int row=std::max(0,std::min(4,int(std::lround((p.y_mm+29.6f)/14.8f))));
     float col=(x+1)*3;int left=std::max(0,std::min(6,int(col)));int right=std::min(6,left+1);
     float h=mix(heat[row][left],heat[row][right],col-left);
     co=blend(color(c.fireLow),color(c.fireHigh),bound((h-.20f)/.75f));v=std::pow(h,.85f);break;
    }
    case 10:{
     float low=(a.display[0]+a.display[1]+a.display[2])/3,mid=(a.display[3]+a.display[4])/2,high=(a.display[5]+a.display[6]+a.display[7])/3;
     float wl=bound(.5f+y*.75f)*low*c.musicGain,wm=(1-ay*.7f)*mid*c.musicGain,wh=bound(.5f-y*.75f)*high*c.musicGain;
     Color l=color(c.musicLow),m=color(c.musicMid),h=color(c.musicHigh);
     co={uint8_t(bound(l.r*wl+m.r*wm+h.r*wh,0,255)),uint8_t(bound(l.g*wl+m.g*wm+h.g*wh,0,255)),uint8_t(bound(l.b*wl+m.b*wm+h.b*wh,0,255))};
     v=bound(a.level*1.4f);break;
    }
    case 11:case 12:case 13:{
     if(customFrames){int slot=c.mode-11,frame=(now/(1000/std::max(1,c.customFps)))%std::max(1,c.customCount);co=(*customFrames)[slot][frame][i];}
     else co={};
     v=c.customSound==1?(.15f+.85f*a.level):c.customSound==2?(.15f+.85f*a.bass):1.f;break;
    }
   }
   float mouthBoost=c.mode==0?mouthRedBoost(mouthLoudMix,loud):1.f;
   out[i]=scale(co,v*c.brightness/255.f*mouthBoost);
  }
  // Conservative LED-only current estimate (not a current sensor).
  float ma=LEDS;for(auto p:out)ma+=(p.r+p.g+p.b)*20.f/255;
  float cap=bound(float(c.currentLimitMa-LEDS)/std::max(1.f,ma-LEDS));for(auto& p:out)p=scale(p,cap);
  return out;
 }
};
inline float batteryPercent(float v){
 constexpr float volts[]={3.0,3.3,3.5,3.6,3.7,3.8,3.9,4.0,4.1,4.2};
 constexpr float pct[]={0,5,12,22,40,60,75,85,94,100};
 for(int i=1;i<10;i++)if(v<volts[i])return mix(pct[i-1],pct[i],(v-volts[i-1])/(volts[i]-volts[i-1]));return 100;
}
}
