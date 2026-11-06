#include "AutoMix.h"
#include <algorithm>
#include <cmath>
#include <iostream>
#include <limits>
#include <stdexcept>
namespace {
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
vocal::AudioChannels voice(float gain=1){
    vocal::AudioChannels audio(1,std::vector<float>(48000*8));double phase=0;
    for(std::size_t i=0;i<audio[0].size();++i){
        double t=i/48000.0,hz=150*std::pow(2,(static_cast<int>(t)%4)*2/12.0);phase+=2*vocal::pi*hz/48000;
        float v=0;for(int h=1;h<=30;++h)v+=static_cast<float>(.07/std::pow(h,1.1)*std::sin(h*phase));
        audio[0][i]=gain*v;
    }return audio;
}
}
int main(){try{
    std::atomic<bool> cancel{false};std::atomic<float> progress{0};vocal::EqSettings before;
    auto audio=voice();auto original=audio;
    auto normal=vocal::recommendMix(audio,48000,before,cancel,progress);
    check(normal.valid,"dry vocal accepted");check(audio==original,"source audio preserved");
    auto quiet=vocal::recommendMix(voice(.35f),48000,before,cancel,progress);
    check(quiet.valid&&quiet.settings.inputDb>normal.settings.inputDb,"quieter vocal gets more bounded gain");
    for(const auto* r:{&normal,&quiet}){
        const auto& p=r->settings;
        check(p.inputDb>=-12&&p.inputDb<=6&&r->peakDb+p.inputDb<=-2.99f,"normalization leaves input peak headroom");
        check(p.ratio>=2&&p.ratio<=3&&p.thresholdDb>=-30&&p.thresholdDb<=-14,"gentle compressor bounds");
        check(p.reverb>0&&p.delay>0&&p.reverbDuck>0&&!p.bypass,"complete vocal processing enabled");
    }
    auto pauses=audio;pauses[0].resize(48000*16,0);
    auto paused=vocal::recommendMix(pauses,48000,before,cancel,progress);
    check(paused.valid&&std::abs(paused.settings.inputDb-normal.settings.inputDb)<.1,"pauses do not raise normalization gain");
    vocal::AudioChannels silence(1,std::vector<float>(48000*8));
    check(!vocal::recommendMix(silence,48000,before,cancel,progress).valid,"silence rejected");
    auto clipped=audio;for(auto& x:clipped[0])x=std::clamp(x*30,-1.f,1.f);
    check(!vocal::recommendMix(clipped,48000,before,cancel,progress).valid,"clipping rejected");
    auto bad=audio;bad[0].back()=std::numeric_limits<float>::quiet_NaN();
    check(!vocal::recommendMix(bad,48000,before,cancel,progress).valid,"nonfinite data rejected");
    cancel=true;check(!vocal::recommendMix(audio,48000,before,cancel,progress).valid,"cancel produces no plan");
    std::cout<<"PASS: vocal mix, gain adaptation, headroom, pauses, source preservation and rejection guards\n";return 0;
}catch(const std::exception& e){std::cerr<<"FAIL: "<<e.what()<<'\n';return 1;}}
