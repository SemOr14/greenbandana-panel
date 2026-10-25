#include "engine.h"
#include <cassert>
#include <iostream>
#include <set>
using namespace Mask;
Audio loud(){Audio a;a.ok=true;a.db=-8;a.roarRatio=.8f;a.spectrum[2]=1;return a;}
void collapseTests(){
 Config c;Collapse r;Audio a=loud();
 r.tick(0,a,c);r.tick(c.roarTriggerMs-1,a,c);assert(r.state==Collapse::GREEN);
 r.tick(c.roarTriggerMs,a,c);assert(r.state==Collapse::CLOSING);
 r.tick(c.roarTriggerMs+c.roarCloseMs,a,c);assert(r.state==Collapse::RED);
 const uint32_t closed=c.roarTriggerMs+c.roarCloseMs;
 // An unchanged roar must stay red indefinitely, not just 15 seconds.
 r.tick(closed+90000,a,c);assert(r.state==Collapse::RED);
 Audio changed=a;changed.db=-30;changed.roarRatio=.05f;changed.spectrum={};changed.spectrum[6]=1;
 r.tick(closed+90001,changed,c);r.tick(closed+90001+c.changeStableMs-1,changed,c);assert(r.state==Collapse::RED);
 // A short drop interrupted by the old sound must not release the red state.
 r.tick(closed+90500,a,c);r.tick(closed+91000,changed,c);r.tick(closed+91000+c.changeStableMs,changed,c);assert(r.state==Collapse::OPENING);
 uint32_t opened=closed+91000+c.changeStableMs+c.roarOpenMs;r.tick(opened,changed,c);assert(r.state==Collapse::GREEN&&r.amount==0);
 // Volume alone is insufficient; spectrum alone is insufficient.
 for(int variation=0;variation<2;variation++){
  Collapse x;x.trigger(0,a);x.tick(c.roarCloseMs,a,c);Audio b=a;
  if(variation==0)b.db=-30;else{b.spectrum={};b.spectrum[6]=1;}
  x.tick(100000,b,c);x.tick(110000,b,c);assert(x.state==Collapse::RED);
 }
 // Both changes can be present early, but minimum hold still applies.
 Collapse x;x.trigger(0,a);x.tick(c.roarCloseMs,a,c);x.tick(500,changed,c);x.tick(c.roarCloseMs+c.roarHoldMs-1,changed,c);assert(x.state==Collapse::RED);
 x.tick(c.roarCloseMs+c.roarHoldMs,changed,c);assert(x.state==Collapse::OPENING);
 // Unsigned elapsed calculations survive millis() wrap.
 Collapse z;uint32_t start=0xfffffff0u;z.trigger(start,a);z.tick(start+c.roarCloseMs,a,c);assert(z.state==Collapse::RED);
}
void audioTests(){
 Config c;Analyzer an;int32_t samples[N];
 for(int i=0;i<N;i++)samples[i]=int32_t(.2*std::sin(2*kPi*125*i/FS)*2147483647.);
 auto a=an.run(samples,c);assert(a.ok&&!a.clip);assert(a.db>-18&&a.db<-16);assert(a.spectrum[1]>.9);assert(a.roarRatio>.82&&a.roarRatio<.85);
 for(int i=0;i<N;i++)samples[i]=0;auto silent=an.run(samples,c);assert(std::isfinite(silent.db)&&silent.db<-100);for(float v:silent.spectrum)assert(std::isfinite(v));
 for(int i=0;i<N;i++)samples[i]=(i%2)?INT32_MAX:INT32_MIN;assert(an.run(samples,c).clip);
 // Extreme sensitivity is applied after raw clipping detection.
 c.micSensitivity=5;auto attenuated=an.run(samples,c);assert(attenuated.clip&&attenuated.peakDb>-1);
 // Speech focus suppresses bass-dominated audio while preserving midrange activity.
 c={};c.voiceFocus=1;Analyzer focused;for(int i=0;i<N;i++)samples[i]=int32_t(.2*std::sin(2*kPi*125*i/FS)*2147483647.);
 auto bassOnly=focused.run(samples,c);assert(bassOnly.voiceScore<.1f&&bassOnly.level<.01f);
 for(int i=0;i<N;i++)samples[i]=int32_t(.2*std::sin(2*kPi*1000*i/FS)*2147483647.);
 auto midTone=focused.run(samples,c);assert(midTone.voiceScore>.9f&&midTone.level>.1f);
}
void matrixAndPowerTests(){
 assert(std::abs(mouthRedBoost(0,{255,0,0})-1.f)<.001f&&std::abs(mouthRedBoost(.5f,{255,0,0})-1.06f)<.001f&&std::abs(mouthRedBoost(1,{255,0,0})-1.12f)<.001f&&std::abs(mouthRedBoost(1,{0,0,255})-1.f)<.001f);
 float raw=.8f;float half=reduceMouthSensitivity(raw,2,-65,-18),fifth=reduceMouthSensitivity(raw,5,-65,-18);
 assert(std::abs(reduceMouthSensitivity(raw,1,-65,-18)-raw)<.001f&&half<raw&&fifth<half&&half>0&&fifth<.6f);
 std::set<int> ids;for(int r=0;r<5;r++)for(int x=0;x<13;x++)if(BandanaMatrix::indexAt(x,r)>=0)ids.insert(BandanaMatrix::indexAt(x,r));assert(ids.size()==31&&*ids.begin()==0&&*ids.rbegin()==30);
 Config c;Renderer renderer;Collapse roar;Audio a=loud();a.level=.8;a.bass=.8;
 for(int mode=0;mode<MODES;mode++)for(bool heart:{false,true}){c.mode=mode;c.brightness=255;c.base=0xffffff;c.loud=0xffffff;c.currentLimitMa=500;
  auto frame=renderer.render(1000,c,a,roar,heart);float ma=31;for(auto p:frame)ma+=(p.r+p.g+p.b)*20.f/255;assert(ma<=501);
 }
 c.mode=5;c.base=0x00ff00;c.brightness=255;c.currentLimitMa=1800;
 auto green=renderer.render(1000,c,a,roar,false);for(auto p:green)assert(p.g>0&&p.r==0);
 roar.amount=1;auto red=renderer.render(1000,c,a,roar,false);assert(red[15].r>0);for(int i=0;i<31;i++)if(i!=15)assert(red[i].r==0&&red[i].g==0);
 assert(batteryPercent(4.2)==100&&batteryPercent(2.8)==0);
}
void modeControlTests(){
 Config c;c.primaryMask=(1u<<0)|(1u<<9)|(1u<<10);
 assert(validPrimaryMask(c.primaryMask));assert(!validPrimaryMask(0));assert(!validPrimaryMask(1u<<5));assert(validPrimaryMask(1u<<12));
 nextPrimary(c);assert(c.mode==9&&c.lastMode==9);
 nextPrimary(c);assert(c.mode==10);nextPrimary(c);assert(c.mode==0);
 chooseMode(c,10);toggleCollapse(c);assert(c.mode==5&&c.lastMode==10);
 toggleCollapse(c);assert(c.mode==10&&c.lastMode==10);
 chooseMode(c,6);toggleCollapse(c);toggleCollapse(c);assert(c.mode==6); // Return even if excluded from cycle.
 toggleCollapse(c);nextPrimary(c);assert(c.mode==9); // First button exits override into the next selected mode.
 assert(!chooseMode(c,-1)&&!chooseMode(c,MODES));assert(c.mode==9);
 c.primaryMask=1u<<9;for(int i=0;i<20;i++){nextPrimary(c);assert(c.mode==9);}
}
void newEffectTests(){
 Config c;c.brightness=255;c.currentLimitMa=1800;Collapse r;Audio silent;
 c.mode=9;Renderer flame;std::array<Color,LEDS> f{},previous{};bool changed=false;
 for(uint32_t now=60;now<5000;now+=60){f=flame.render(now,c,silent,r,false);for(int i=0;i<31;i++)if(f[i].r!=previous[i].r||f[i].g!=previous[i].g)changed=true;previous=f;}
 int top=0,bottom=0;for(int i=0;i<6;i++)top+=f[i].r;for(int i=25;i<31;i++)bottom+=f[i].r;
 assert(changed&&bottom>top&&bottom>0); // Fire works without microphone, rises and cools.
 c.mode=10;c.musicLow=0xff0000;c.musicMid=0x00ff00;c.musicHigh=0x0000ff;Renderer music;
 auto dark=music.render(1000,c,silent,r,false);for(auto p:dark)assert(p.r==0&&p.g==0&&p.b==0);
 Audio a;a.level=1;for(int b=0;b<3;b++)a.display[b]=1;
 auto bass=music.render(1030,c,a,r,false);assert(bass[25].r>bass[0].r);for(auto p:bass)assert(p.g==0&&p.b==0);
 a.display={};for(int b=5;b<8;b++)a.display[b]=1;
 auto high=music.render(1060,c,a,r,false);assert(high[0].b>high[25].b);for(auto p:high)assert(p.r==0&&p.g==0);
}
int main(){collapseTests();audioTests();matrixAndPowerTests();modeControlTests();newEffectTests();std::cout<<"PASS: collapse timing, hysteresis, both changes, wraparound, FFT, clipping, matrix, current limit, mouth-only sensitivity, selected mode cycle, collapse return, fire and frequency-color music\n";}
