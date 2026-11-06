#include "Dsp.h"
#include <cmath>
#include <iostream>
#include <stdexcept>
namespace {
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
struct Tail {double early=0,late=0;};
Tail tail(float shortMix,float longMix){
    vocal::VocalChain chain;chain.prepare(48000);vocal::VocalParameters p;
    p.shortReverb=shortMix;p.shortDecaySeconds=.4f;p.reverb=longMix;p.decaySeconds=2;p.delay=0;
    chain.setParameters(p);Tail result;
    for(int i=0;i<48000*4;++i){float l=i==0?.5f:0,r=l;chain.processAmbience(l,r);
        check(std::isfinite(l)&&std::isfinite(r)&&std::abs(l)<1&&std::abs(r)<1,"finite bounded reverb impulse");
        if(i>4800&&i<19200)result.early+=l*l+r*r;
        if(i>48000&&i<96000)result.late+=l*l+r*r;
    }return result;
}
}
int main(){try{
    auto room=tail(.3f,0),hall=tail(0,.3f),both=tail(.3f,.3f);
    std::cout<<"room early/late "<<room.early<<' '<<room.late<<" hall "<<hall.early<<' '<<hall.late<<'\n';
    check(room.early>1e-10&&hall.early>1e-10,"both reverb banks produce audible return");
    check(room.late<room.early*.0001,"short room decays promptly");
    check(hall.late>room.late*100+1e-20,"long reverb retains a separately longer tail");
    check(both.early>room.early&&both.early>hall.early,"two returns can run simultaneously");
    vocal::VocalChain chain;chain.prepare(48000);auto p=vocal::preset(5);p.reverb=p.shortReverb=p.delay=0;chain.setParameters(p);
    for(int i=0;i<48000;++i){float l=.3f*static_cast<float>(std::sin(2*vocal::pi*220*i/48000)),r=l;chain.processDry(l,r);}
    check(chain.gainReductionDb()>3,"live singing preset applies noticeable compression");
    p.bypass=true;p.shortReverb=.4f;chain.setParameters(p);float l=.2f,r=-.1f;chain.process(l,r);
    check(l==.2f&&r==-.1f,"bypass covers both reverbs and compressor");
    chain.reset();p.bypass=false;chain.setParameters(p);float a=0,b=0;chain.processAmbience(a,b);check(a==0&&b==0,"reset clears both tails");
    std::cout<<"PASS: separate short/long tails, parallel returns, live compression, bypass and reset\n";return 0;
}catch(const std::exception& e){std::cerr<<"FAIL: "<<e.what()<<'\n';return 1;}}
