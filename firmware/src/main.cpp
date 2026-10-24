#include <Arduino.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Update.h>
#include <driver/i2s.h>
#include <esp_system.h>
#include <mbedtls/md.h>
#include "engine.h"
using namespace Mask;
constexpr char FW_VERSION[]="1.3.0";
constexpr int PIN_BAT=1,PIN_BCLK=4,PIN_WS=5,PIN_SD=6,PIN_LED=7,PIN_NEXT=8,PIN_PREV=9;
constexpr char SERVICE[]="97bcf501-696e-4f24-9b83-16bfa764b7e1";
constexpr char RX_UUID[]="97bcf502-696e-4f24-9b83-16bfa764b7e1";
constexpr char TX_UUID[]="97bcf503-696e-4f24-9b83-16bfa764b7e1";
constexpr char OTA_UUID[]="97bcf504-696e-4f24-9b83-16bfa764b7e1";
Config cfg;Analyzer analyzer;Collapse collapse;Renderer renderer;Audio audio;
CustomFrames customFrames{};
Preferences prefs;Adafruit_NeoPixel strip(LEDS,PIN_LED,NEO_GRB+NEO_KHZ800);
NimBLEServer* server=nullptr;NimBLECharacteristic* tx=nullptr;
QueueHandle_t commands;volatile uint32_t connectionEpoch=0;volatile bool connected=false;
uint32_t activeEpoch=0,pairUntil=0,otaPermitUntil=0,rebootAt=0,heartStart=0,lastTelemetry=0,lastBattery=0,lastAudioUpdate=0,lastClip=0;
int testLed=-1;uint32_t testAt=0,pairFlashUntil=0;
bool authorized=false,heartActive=false,micReady=false,firmwareSuccessAnimation=false,modeLocked=false;int activeMicPreset=-1,lockedClickCount=0;uint32_t lockedClickAt=0;float battery=0;String salt,key,nonce,outgoing;uint32_t firmwareSuccessAt=0;
volatile bool otaActive=false,otaError=false;volatile size_t otaWritten=0;size_t otaExpected=0;
size_t outPos=0;String incoming;
struct Command{uint32_t epoch;char text[513];};
String randomHex(size_t n){String s;static const char hex[]="0123456789abcdef";for(size_t i=0;i<n;i++){uint8_t b=esp_random();s+=hex[b>>4];s+=hex[b&15];}return s;}
bool validHex(const String& s,size_t bytes){if(s.length()!=bytes*2)return false;for(char c:s)if(!((c>='0'&&c<='9')||(c>='a'&&c<='f')))return false;return true;}
String proofFor(const String& secret,const String& challenge){
 uint8_t bytes[32],digest[32];for(int i=0;i<32;i++)bytes[i]=strtoul(secret.substring(i*2,i*2+2).c_str(),nullptr,16);
 mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),bytes,32,(const unsigned char*)challenge.c_str(),challenge.length(),digest);
 String s;char hex[3];for(uint8_t b:digest){snprintf(hex,sizeof(hex),"%02x",b);s+=hex;}return s;
}
bool setAccessPassword(bool regenerate){
 if(!regenerate&&prefs.getBool("fixed",false)&&validHex(key,32))return true;
 salt=randomHex(16);key=randomHex(32);
 return prefs.putString("salt",salt)>0&&prefs.putString("key",key)>0&&prefs.putBool("fixed",true)>0;
}
bool constantEqual(const String& a,const String& b){if(a.length()!=b.length())return false;unsigned diff=0;for(size_t i=0;i<a.length();i++)diff|=a[i]^b[i];return diff==0;}
bool pairOpen(){return pairUntil&&int32_t(pairUntil-millis())>0;}
void emit(JsonDocument& d){String s;serializeJson(d,s);if(outgoing.length()+s.length()<14000){outgoing+=s;outgoing+='\n';}}
void reply(int id,bool ok,const char* msg=""){StaticJsonDocument<256>d;d["id"]=id;d["type"]="ack";d["ok"]=ok;d["message"]=msg;emit(d);}
void configJson(JsonObject o){
 o["modeLocked"]=modeLocked;o["activeMicPreset"]=activeMicPreset;
#define CFG_FIELD(n) o[#n]=cfg.n
 CFG_FIELD(primaryMask);CFG_FIELD(lastMode);CFG_FIELD(fireLow);CFG_FIELD(fireHigh);CFG_FIELD(fireIntensity);CFG_FIELD(fireCooling);CFG_FIELD(musicLow);CFG_FIELD(musicMid);CFG_FIELD(musicHigh);CFG_FIELD(musicGain);
 CFG_FIELD(mode);CFG_FIELD(brightness);CFG_FIELD(currentLimitMa);CFG_FIELD(base);CFG_FIELD(loud);CFG_FIELD(heart);CFG_FIELD(floorDb);CFG_FIELD(ceilingDb);CFG_FIELD(loudLevel);
 CFG_FIELD(micSensitivity);CFG_FIELD(voiceFocus);
 CFG_FIELD(customFps);CFG_FIELD(customCount);CFG_FIELD(customSound);
 CFG_FIELD(bassLow);CFG_FIELD(bassHigh);CFG_FIELD(bassGain);CFG_FIELD(roarLow);CFG_FIELD(roarHigh);CFG_FIELD(roarDb);CFG_FIELD(roarBandRatio);CFG_FIELD(roarTriggerMs);CFG_FIELD(roarHoldMs);CFG_FIELD(roarCloseMs);CFG_FIELD(roarOpenMs);CFG_FIELD(changeStableMs);CFG_FIELD(changeDb);CFG_FIELD(changeSpectrum);CFG_FIELD(attackMs);CFG_FIELD(releaseMs);CFG_FIELD(speed);CFG_FIELD(batteryCorrection);
#undef CFG_FIELD
}
bool setField(const String& name,JsonVariantConst value){
 if(!value.is<float>()&&!value.is<long>()&&!value.is<unsigned long>())return false;
 double v=value.as<double>();if(!std::isfinite(v))return false;
#define I(n,lo,hi) if(name==#n){if(v<lo||v>hi||v!=int(v))return false;cfg.n=int(v);return true;}
#define CFG_FIELD(n,lo,hi) if(name==#n){if(v<lo||v>hi)return false;cfg.n=float(v);return true;}
 if(name=="mode")return v>=0&&v<MODES&&v==int(v)&&chooseMode(cfg,int(v));
 if(name=="primaryMask"){if(v<1||v>((1u<<MODES)-1)||v!=int(v)||!validPrimaryMask(uint32_t(v)))return false;cfg.primaryMask=uint32_t(v);return true;}
 if(name=="lastMode"){if(v<0||v>=MODES||v==5||v!=int(v))return false;cfg.lastMode=int(v);return true;}
 I(fireLow,0,16777215);I(fireHigh,0,16777215);I(musicLow,0,16777215);I(musicMid,0,16777215);I(musicHigh,0,16777215);
 CFG_FIELD(fireIntensity,.1,1);CFG_FIELD(fireCooling,.02,.5);CFG_FIELD(musicGain,.2,4);I(brightness,0,255);I(currentLimitMa,100,1800);
 I(base,0,16777215);I(loud,0,16777215);I(heart,0,16777215);
 I(customFps,1,20);I(customCount,1,8);I(customSound,0,2);
 I(micSensitivity,1,5);I(voiceFocus,0,1);
 CFG_FIELD(floorDb,-100,-25);CFG_FIELD(ceilingDb,-24,-1);CFG_FIELD(loudLevel,.1,.99);
 I(bassLow,32,150);I(bassHigh,160,500);CFG_FIELD(bassGain,.1,6);
 I(roarLow,32,1500);I(roarHigh,1600,7000);CFG_FIELD(roarDb,-80,-1);CFG_FIELD(roarBandRatio,.01,.99);
 I(roarTriggerMs,50,2000);I(roarHoldMs,12000,15000);I(roarCloseMs,100,3000);I(roarOpenMs,300,8000);
 I(changeStableMs,250,5000);CFG_FIELD(changeDb,1,30);CFG_FIELD(changeSpectrum,.01,.95);
 CFG_FIELD(attackMs,5,500);CFG_FIELD(releaseMs,20,2000);CFG_FIELD(speed,.1,5);CFG_FIELD(batteryCorrection,.8,1.2);
#undef I
#undef CFG_FIELD
 return false;
}
void saveConfig(){DynamicJsonDocument d(3072);configJson(d.to<JsonObject>());String s;serializeJson(d,s);prefs.putString("config",s);prefs.putInt("lastMode",cfg.lastMode);}
void resetAccess(){
 if(!setAccessPassword(true))return;authorized=false;nonce=randomHex(32);pairUntil=millis()+60000;
 NimBLEDevice::deleteAllBonds();outgoing="";outPos=0;
}
class ServerCallbacks:public NimBLEServerCallbacks{
 void onConnect(NimBLEServer*)override{connected=true;connectionEpoch++;}
 void onDisconnect(NimBLEServer*)override{connected=false;connectionEpoch++;incoming="";NimBLEDevice::startAdvertising();}
};
class RxCallbacks:public NimBLECharacteristicCallbacks{
 void onWrite(NimBLECharacteristic* c)override{
  std::string value=c->getValue();
  for(char ch:value){
   if(ch=='\n'){
    Command cmd{};cmd.epoch=connectionEpoch;strlcpy(cmd.text,incoming.c_str(),sizeof(cmd.text));incoming="";
    if(xQueueSend(commands,&cmd,0)!=pdTRUE){ // A protocol flood must not consume unbounded memory.
     for(auto handle:server->getPeerDevices())server->disconnect(handle);
    }
   }else if(ch!='\r'){
    if(incoming.length()>=512){incoming="";for(auto handle:server->getPeerDevices())server->disconnect(handle);return;}
    incoming+=ch;
   }
  }
 }
};
class OtaCallbacks:public NimBLECharacteristicCallbacks{
 void onWrite(NimBLECharacteristic* c)override{
  if(!connected||!authorized||!otaActive||otaError)return;
  std::string bytes=c->getValue();
  if(bytes.empty()||otaWritten+bytes.size()>otaExpected){otaError=true;return;}
  size_t n=Update.write(reinterpret_cast<uint8_t*>(bytes.data()),bytes.size());
  otaWritten+=n;if(n!=bytes.size()||Update.hasError())otaError=true;
 }
};
uint32_t lastAuthAttempt=0;int authFailures=0;
void handleCommand(const char* text){
 StaticJsonDocument<1024>d;if(deserializeJson(d,text)){reply(0,false,"invalid_json");return;}
 int id=d["id"]|0;String op=d["op"]|"";
 if(op=="hello"){
  if(pairOpen()){authorized=true;pairUntil=0;}
  StaticJsonDocument<512>r;r["id"]=id;r["type"]="hello";r["configured"]=key.length()==64;r["pairing"]=pairOpen();r["unlocked"]=authorized;r["salt"]=salt;r["nonce"]=nonce;r["rounds"]=100000;r["version"]=FW_VERSION;if(authorized)r["rememberKey"]=key;emit(r);return;
 }
 if(op=="enroll"){
  String k=d["key"]|"";
  if(key.length()||!pairOpen()||!validHex(k,32)){reply(id,false,"pairing_required");return;}
  key=k;prefs.putString("key",key);pairUntil=0;authorized=true;nonce=randomHex(32);reply(id,true);return;
 }
 if(op=="auth"){
  if(key.length()!=64){reply(id,false,"not_configured");return;}
  if(authFailures&&uint32_t(millis()-lastAuthAttempt)<2000){reply(id,false,"try_later");return;}
  lastAuthAttempt=millis();String proof=d["proof"]|"";
  if(validHex(proof,32)&&constantEqual(proof,proofFor(key,nonce))){authorized=true;authFailures=0;nonce=randomHex(32);reply(id,true);}else{authorized=false;authFailures++;reply(id,false,"wrong_password");}return;
 }
 if(!authorized){reply(id,false,"authentication_required");return;}
 if(op=="customGet"||op=="customSet"){
  int slot=d["slot"]|-1,frame=d["frame"]|-1;
  if(slot<0||slot>=3||frame<0||frame>=8){reply(id,false,"invalid_frame");return;}
  char storageKey[12];snprintf(storageKey,sizeof(storageKey),"anim%d_%d",slot,frame);
  auto& pixels=customFrames[slot][frame];
  if(op=="customSet"){
   String value=d["pixels"]|"";if(!validHex(value,LEDS*3)){reply(id,false,"invalid_pixels");return;}
   for(int i=0;i<LEDS;i++){pixels[i]={uint8_t(strtoul(value.substring(i*6,i*6+2).c_str(),nullptr,16)),uint8_t(strtoul(value.substring(i*6+2,i*6+4).c_str(),nullptr,16)),uint8_t(strtoul(value.substring(i*6+4,i*6+6).c_str(),nullptr,16))};}
   if(prefs.putBytes(storageKey,pixels.data(),LEDS*3)!=LEDS*3){reply(id,false,"storage_failed");return;}
   reply(id,true);return;
  }
  StaticJsonDocument<320>r;r["id"]=id;r["type"]="customFrame";r["slot"]=slot;r["frame"]=frame;
  String value;char rgb[7];for(auto p:pixels){snprintf(rgb,sizeof(rgb),"%02x%02x%02x",p.r,p.g,p.b);value+=rgb;}r["pixels"]=value;emit(r);return;
 }
 if(op=="micPresetGet"){
  DynamicJsonDocument r(1536);r["id"]=id;r["type"]="micPresets";auto list=r.createNestedArray("presets");
  for(int slot=0;slot<4;slot++){JsonObject p=list.createNestedObject();String raw=prefs.getString((String("mic")+slot).c_str(),"");if(raw.length()){DynamicJsonDocument saved(512);if(!deserializeJson(saved,raw)){p["name"]=saved["name"]|"";p["values"]=saved["values"];continue;}}p["name"]="";p.createNestedObject("values");}
  r["active"]=activeMicPreset;emit(r);return;
 }
 if(op=="micPresetSave"){
  int slot=d["slot"]|-1;String name=d["name"]|"";JsonObjectConst values=d["values"].as<JsonObjectConst>();
  if(slot<0||slot>=4||name.length()==0||name.length()>64||values.isNull()){reply(id,false,"invalid_preset");return;}
  Config original=cfg;const char* fields[]={"micSensitivity","voiceFocus","floorDb","ceilingDb","loudLevel","attackMs","releaseMs"};
  for(const char* field:fields){if(!values.containsKey(field)||!setField(field,values[field])){cfg=original;reply(id,false,"invalid_preset");return;}}
  bool valid=cfg.floorDb<cfg.ceilingDb;DynamicJsonDocument saved(512);saved["name"]=name;JsonObject v=saved.createNestedObject("values");for(const char* field:fields){if(strcmp(field,"micSensitivity")==0)v[field]=cfg.micSensitivity;else if(strcmp(field,"voiceFocus")==0)v[field]=cfg.voiceFocus;else if(strcmp(field,"floorDb")==0)v[field]=cfg.floorDb;else if(strcmp(field,"ceilingDb")==0)v[field]=cfg.ceilingDb;else if(strcmp(field,"loudLevel")==0)v[field]=cfg.loudLevel;else if(strcmp(field,"attackMs")==0)v[field]=cfg.attackMs;else v[field]=cfg.releaseMs;}
  cfg=original;if(!valid){reply(id,false,"invalid_preset");return;}String raw;serializeJson(saved,raw);if(prefs.putString((String("mic")+slot).c_str(),raw)==0){reply(id,false,"storage_failed");return;}activeMicPreset=slot;prefs.putInt("micActive",slot);saveConfig();reply(id,true);return;
 }
 if(op=="micPresetApply"){
  int slot=d["slot"]|-1;if(slot<0||slot>=4){reply(id,false,"invalid_preset");return;}String raw=prefs.getString((String("mic")+slot).c_str(),"");DynamicJsonDocument saved(512);
  if(!raw.length()||deserializeJson(saved,raw)){reply(id,false,"empty_preset");return;}Config original=cfg;JsonObjectConst values=saved["values"].as<JsonObjectConst>();const char* fields[]={"micSensitivity","voiceFocus","floorDb","ceilingDb","loudLevel","attackMs","releaseMs"};
  for(const char* field:fields)if(!values.containsKey(field)||!setField(field,values[field])){cfg=original;reply(id,false,"invalid_preset");return;}
  if(cfg.floorDb>=cfg.ceilingDb){cfg=original;reply(id,false,"invalid_preset");return;}activeMicPreset=slot;prefs.putInt("micActive",slot);saveConfig();reply(id,true);return;
 }
 if(op=="otaBegin"){
  int size=d["size"]|0;
  if(!otaPermitUntil||int32_t(otaPermitUntil-millis())<=0){reply(id,false,"physical_confirmation_required");return;}
  if(size<100000||size>1300000){reply(id,false,"invalid_image_size");return;}
  if(otaActive){Update.abort();otaActive=false;}
  otaExpected=size;otaWritten=0;otaError=false;
  if(!Update.begin(otaExpected,U_FLASH)){reply(id,false,"ota_begin_failed");return;}
  otaActive=true;otaPermitUntil=0;reply(id,true);return;
 }
 if(op=="otaStatus"){
  StaticJsonDocument<256>r;r["id"]=id;r["type"]="otaStatus";r["active"]=otaActive;r["written"]=otaWritten;r["size"]=otaExpected;r["error"]=otaError;emit(r);return;
 }
 if(op=="otaEnd"){
  if(!otaActive||otaError||otaWritten!=otaExpected){if(otaActive)Update.abort();otaActive=false;reply(id,false,"ota_incomplete");return;}
   otaActive=false;if(!Update.end()){reply(id,false,"ota_verify_failed");return;}prefs.putBool("fwSuccess",true);
  reply(id,true);rebootAt=millis()+3000;return;
 }
 if(op=="otaAbort"){if(otaActive)Update.abort();otaActive=false;reply(id,true);return;}
 if(op=="config"){
  DynamicJsonDocument r(4096);r["id"]=id;r["type"]="config";configJson(r.createNestedObject("config"));emit(r);return;
 }
 if(op=="set"){
  int oldMode=cfg.mode;String name=d["name"]|"";bool ok=name!="lastMode"&&setField(name,d["value"]);
  if(cfg.mode!=oldMode)collapse.reset();reply(id,ok,ok?"":"invalid_setting");return;
 }
 if(op=="modeLock"){modeLocked=d["locked"]|false;prefs.putBool("modeLock",modeLocked);lockedClickCount=0;reply(id,true);return;}
 if(op=="save"){saveConfig();reply(id,true);return;}
 if(op=="test"){int index=d["index"]|-1;if(index<0||index>=LEDS){reply(id,false,"invalid_index");return;}testLed=index;testAt=millis();reply(id,true);return;}
 if(op=="heart"){heartActive=true;heartStart=millis();reply(id,true);return;}
 if(op=="toggleCollapse"){toggleCollapse(cfg);collapse.reset();reply(id,true);return;}
 if(op=="nextPrimary"){nextPrimary(cfg);collapse.reset();reply(id,true);return;}
 if(op=="trigger"){chooseMode(cfg,5);collapse.trigger(millis(),audio);reply(id,true);return;}
 if(op=="logout"){authorized=false;nonce=randomHex(32);reply(id,true);return;}
 reply(id,false,"unknown_command");
}
struct Button{bool raw=false,down=false,longSent=false;uint32_t changed=0,pressed=0;
 void read(int pin,uint32_t now){bool next=digitalRead(pin)==LOW;if(next!=raw){raw=next;changed=now;}if(uint32_t(now-changed)>=25&&down!=raw){down=raw;if(down){pressed=now;longSent=false;}}}
};
Button nextButton,prevButton;bool oldNext=false,oldPrev=false,combo=false,comboOpened=false,comboReset=false;uint32_t comboAt=0;

void buttons(uint32_t now){
 nextButton.read(PIN_NEXT,now);prevButton.read(PIN_PREV,now);
 if(nextButton.down&&prevButton.down){
  if(!combo){combo=true;comboAt=now;comboOpened=comboReset=false;}
  if(!comboOpened&&uint32_t(now-comboAt)>=3000){if(setAccessPassword(false)){pairUntil=now+60000;otaPermitUntil=now+60000;pairFlashUntil=now+300;Serial.println("Access window: 60 s");}comboOpened=true;}
  if(!comboReset&&uint32_t(now-comboAt)>=8000){resetAccess();comboReset=true;Serial.println("Access reset; enroll a new password");}
  nextButton.longSent=prevButton.longSent=true;
 }else if(combo){ // Suppress both release actions even if released at different times.
  nextButton.longSent=prevButton.longSent=true;if(!nextButton.down&&!prevButton.down)combo=false;
 }else{
  if(nextButton.down&&!nextButton.longSent&&uint32_t(now-nextButton.pressed)>=700){heartActive=true;heartStart=now;nextButton.longSent=true;}
  if(prevButton.down&&!prevButton.longSent&&uint32_t(now-prevButton.pressed)>=700)prevButton.longSent=true;
  if(oldNext&&!nextButton.down&&!nextButton.longSent){
   if(modeLocked){if(!lockedClickCount||uint32_t(now-lockedClickAt)>1000)lockedClickCount=0;lockedClickAt=now;if(++lockedClickCount>=3){modeLocked=false;lockedClickCount=0;prefs.putBool("modeLock",false);pairFlashUntil=now+180;}}
   else{nextPrimary(cfg);collapse.reset();}
  }
  if(oldPrev&&!prevButton.down&&!prevButton.longSent&&!modeLocked){toggleCollapse(cfg);collapse.reset();}
 }
 oldNext=nextButton.down;oldPrev=prevButton.down;
}
void telemetry(const std::array<Color,LEDS>& frame){
 DynamicJsonDocument d(1536);d["type"]="state";d["mode"]=cfg.mode;d["lastMode"]=cfg.lastMode;d["primaryMask"]=cfg.primaryMask;d["modeLocked"]=modeLocked;d["activeMicPreset"]=activeMicPreset;d["v"]=std::round(battery*100)/100;d["pct"]=int(batteryPercent(battery));d["batteryValid"]=battery>2.5&&battery<4.4;
 d["db"]=int(audio.db);d["peakDb"]=int(audio.peakDb);d["clip"]=lastClip!=0&&uint32_t(millis()-lastClip)<1500;d["mic"]=micReady&&audio.ok;
 d["level"]=std::round(audio.level*100)/100;d["bass"]=std::round(audio.bass*100)/100;d["voice"]=std::round(audio.voiceScore*100)/100;d["roar"]=int(collapse.state);d["pairing"]=pairOpen();
 auto b=d.createNestedArray("bands");for(float v:audio.display)b.add(int(v*100));
 String pixels;char h[7];for(auto p:frame){snprintf(h,sizeof(h),"%02x%02x%02x",p.r,p.g,p.b);pixels+=h;}d["pixels"]=pixels;emit(d);
}
void setup(){
 Serial.begin(115200);pinMode(PIN_NEXT,INPUT_PULLUP);pinMode(PIN_PREV,INPUT_PULLUP);
 strip.begin();strip.clear();strip.show();
 prefs.begin("bandana",false);salt=prefs.getString("salt","");key=prefs.getString("key","");modeLocked=prefs.getBool("modeLock",false);activeMicPreset=prefs.getInt("micActive",-1);if(activeMicPreset<0||activeMicPreset>=4)activeMicPreset=-1;
 firmwareSuccessAnimation=prefs.getBool("fwSuccess",false);if(firmwareSuccessAnimation)prefs.putBool("fwSuccess",false);
 renderer.setCustomFrames(&customFrames);
 for(int slot=0;slot<3;slot++)for(int frame=0;frame<8;frame++){char storageKey[12];snprintf(storageKey,sizeof(storageKey),"anim%d_%d",slot,frame);if(prefs.getBytesLength(storageKey)==LEDS*3)prefs.getBytes(storageKey,customFrames[slot][frame].data(),LEDS*3);}
 if(!validHex(salt,16)){salt=randomHex(16);prefs.putString("salt",salt);}if(!validHex(key,32))key="";
 DynamicJsonDocument saved(3072);if(!deserializeJson(saved,prefs.getString("config","{}"))){for(JsonPair p:saved.as<JsonObject>())setField(p.key().c_str(),p.value());}
 // Restore the last ordinary mode; powering up never arms collapse automatically.
 int restored=prefs.getInt("lastMode",cfg.mode==5?cfg.lastMode:cfg.mode);
 if(restored<0||restored>=MODES||restored==5)restored=0;
 chooseMode(cfg,restored);
 analogReadResolution(12);analogSetPinAttenuation(PIN_BAT,ADC_11db);
 i2s_config_t ic{};ic.mode=i2s_mode_t(I2S_MODE_MASTER|I2S_MODE_RX);ic.sample_rate=FS;ic.bits_per_sample=I2S_BITS_PER_SAMPLE_32BIT;
 ic.channel_format=I2S_CHANNEL_FMT_ONLY_LEFT;ic.communication_format=I2S_COMM_FORMAT_STAND_I2S;
 ic.intr_alloc_flags=ESP_INTR_FLAG_LEVEL1;ic.dma_buf_count=8;ic.dma_buf_len=256;ic.use_apll=false;
 i2s_pin_config_t pins{};pins.mck_io_num=I2S_PIN_NO_CHANGE;pins.bck_io_num=PIN_BCLK;pins.ws_io_num=PIN_WS;pins.data_out_num=I2S_PIN_NO_CHANGE;pins.data_in_num=PIN_SD;
 micReady=i2s_driver_install(I2S_NUM_0,&ic,0,nullptr)==ESP_OK;
 if(micReady)micReady=i2s_set_pin(I2S_NUM_0,&pins)==ESP_OK;
 commands=xQueueCreate(8,sizeof(Command));
 NimBLEDevice::init("GreenBandana");NimBLEDevice::setMTU(247);
 // Encrypted BLE transport, bonding and LE Secure Connections. App password remains mandatory.
 NimBLEDevice::setSecurityAuth(true,false,true);NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);
 server=NimBLEDevice::createServer();server->setCallbacks(new ServerCallbacks());
 auto service=server->createService(SERVICE);
 tx=service->createCharacteristic(TX_UUID,NIMBLE_PROPERTY::NOTIFY|NIMBLE_PROPERTY::READ|NIMBLE_PROPERTY::READ_ENC,512);
 auto rx=service->createCharacteristic(RX_UUID,NIMBLE_PROPERTY::WRITE|NIMBLE_PROPERTY::WRITE_ENC,512);rx->setCallbacks(new RxCallbacks());
 auto otaRx=service->createCharacteristic(OTA_UUID,NIMBLE_PROPERTY::WRITE|NIMBLE_PROPERTY::WRITE_ENC,512);otaRx->setCallbacks(new OtaCallbacks());
 service->start();auto ad=NimBLEDevice::getAdvertising();ad->addServiceUUID(SERVICE);ad->setScanResponse(true);ad->start();if(firmwareSuccessAnimation)firmwareSuccessAt=millis();
 nonce=randomHex(32);Serial.printf("GreenBandana %s ready. Hold BOTH buttons 3 s for access; 8 s to reset bonds.\n",FW_VERSION);
}
void loop(){
 uint32_t now=millis();
 if(activeEpoch!=connectionEpoch){activeEpoch=connectionEpoch;authorized=false;nonce=randomHex(32);outgoing="";outPos=0;lastTelemetry=0;if(otaActive){Update.abort();otaActive=false;}}
 buttons(now);
 // Coalesce mode changes; remember the last ordinary mode without writing every frame.
 static int observedMode=cfg.lastMode,savedMode=cfg.lastMode;static uint32_t modeChanged=0;
 if(observedMode!=cfg.lastMode){observedMode=cfg.lastMode;modeChanged=now;}
 if(savedMode!=observedMode&&uint32_t(now-modeChanged)>=1500){prefs.putInt("lastMode",observedMode);savedMode=observedMode;}

 Command cmd;for(int n=0;n<3&&xQueueReceive(commands,&cmd,0)==pdTRUE;n++)if(cmd.epoch==activeEpoch&&connected)handleCommand(cmd.text);
 static int32_t samples[N];static size_t filled=0;size_t got=0;
 if(micReady){
  esp_err_t e=i2s_read(I2S_NUM_0,reinterpret_cast<uint8_t*>(samples)+filled,sizeof(samples)-filled,&got,0);filled+=got;
  if(e!=ESP_OK&&e!=ESP_ERR_TIMEOUT){audio.ok=false;filled=0;}
  if(filled==sizeof(samples)){audio=analyzer.run(samples,cfg);lastAudioUpdate=now;if(audio.clip)lastClip=now;filled=0;}
 }
 static uint32_t lastFrame=0;
 if(uint32_t(now-lastFrame)>=25){lastFrame=now;
  // Missing/stale I2S frames must not keep an old roar or speaking mouth alive.
  if(uint32_t(now-lastAudioUpdate)>300){audio=Audio{};}
  if(cfg.mode==5)collapse.tick(now,audio,cfg);
  if(heartActive&&uint32_t(now-heartStart)>=4000)heartActive=false;
  auto frame=renderer.render(now,cfg,audio,collapse,heartActive);
  if(int32_t(pairFlashUntil-now)>0)for(auto& p:frame)p={32,0,0};
  if(testLed>=0){if(uint32_t(now-testAt)<1500){for(auto& p:frame)p={};frame[testLed]={24,24,24};}else testLed=-1;}
  if(firmwareSuccessAnimation){uint32_t elapsed=now-firmwareSuccessAt;if(elapsed>=2400)firmwareSuccessAnimation=false;else for(int i=0;i<LEDS;i++){
   float x=BandanaMatrix::kPosition[i].x_mm,y=BandanaMatrix::kPosition[i].y_mm;
   float distance=std::abs(x)/49.5f;Color mark{};
   if(elapsed<700){if(distance<=float(elapsed)/700.f)mark={0,105,255};}
   else{
    mark={18,0,36};
    // A check mark mapped to the actual sparse 6/6/7/6/6 LED rows.
    auto segmentDistance=[&](float x1,float y1,float x2,float y2){float dx=x2-x1,dy=y2-y1;float t=bound(((x-x1)*dx+(y-y1)*dy)/(dx*dx+dy*dy));return std::hypot(x-(x1+t*dx),y-(y1+t*dy));};
    bool check=segmentDistance(-24.75f,0.f,-8.25f,14.8f)<10.5f||segmentDistance(-8.25f,14.8f,24.75f,-14.8f)<10.5f;
    if(check){float pulse=.78f+.22f*std::sin(float(elapsed-700)*.009f);mark={uint8_t(255*pulse),uint8_t(35*pulse),uint8_t(210*pulse)};}
    float fade=elapsed>1900?1.f-float(elapsed-1900)/500.f:1.f;mark=scale(mark,fade);
   }
   frame[i]=mark;
  }}
  for(int i=0;i<LEDS;i++)strip.setPixelColor(i,frame[i].r,frame[i].g,frame[i].b);strip.show();
  if(connected&&authorized&&outPos==outgoing.length()&&uint32_t(now-lastTelemetry)>=1000){lastTelemetry=now;telemetry(frame);}
 }
 if(uint32_t(now-lastBattery)>=1000){lastBattery=now;float v=analogReadMilliVolts(PIN_BAT)*.002f*cfg.batteryCorrection;battery=battery==0?v:battery*.85f+v*.15f;}
 // 20-byte fragments work even with the default ATT MTU. Never assume Android negotiated a larger MTU.
 static uint32_t lastTx=0;
 if(connected&&outPos<outgoing.length()&&uint32_t(now-lastTx)>=7){
  lastTx=now;size_t count=std::min(size_t(20),outgoing.length()-outPos);tx->setValue((uint8_t*)outgoing.c_str()+outPos,count);
  // Retain the fragment if NimBLE reports backpressure; notify() in NimBLE 1.x is void.
  auto peers=server->getPeerDevices();
  if(!peers.empty()&&tx->getSubscribedCount()){
   struct ble_gap_conn_desc peer{};
   if(ble_gap_conn_find(peers.front(),&peer)==0&&peer.sec_state.encrypted){
    auto mbuf=ble_hs_mbuf_from_flat(outgoing.c_str()+outPos,count);
    if(mbuf&&ble_gattc_notify_custom(peers.front(),tx->getHandle(),mbuf)==0)outPos+=count;
   }
  }
  if(outPos==outgoing.length()){outgoing="";outPos=0;}
 }
 delay(1);
 if(rebootAt&&int32_t(millis()-rebootAt)>=0)ESP.restart();
}
