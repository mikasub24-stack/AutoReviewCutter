#include "Dsp.h"
#include <algorithm>
#include <cmath>
#include <limits>
namespace vocal {
float dbToGain(float db) noexcept { return std::pow(10.0f, std::clamp(db, -120.0f, 36.0f) / 20.0f); }
float gainToDb(float gain) noexcept { return 20.0f * std::log10(std::max(1.0e-6f, std::abs(gain))); }
VocalParameters preset(int i) noexcept {
    VocalParameters p;
    if (i == 1) { p.highPassHz=70; p.warmthDb=1; p.presenceDb=1.5f; p.ratio=2.5f; p.thresholdDb=-20; p.reverb=.16f; p.delay=.08f; p.delayMs=330;p.decaySeconds=1.8f;p.preDelayMs=32; }
    if (i == 2) { p.highPassHz=95; p.warmthDb=-3; p.presenceDb=3; p.thresholdDb=-22; p.ratio=4; p.makeupDb=4; p.deEss=.55f; p.reverb=.08f; p.delay=.06f; p.delayMs=190;p.decaySeconds=.85f;p.preDelayMs=18; }
    if (i == 3) { p.highPassHz=75; p.presenceDb=.5f; p.ratio=2; p.makeupDb=1; p.reverb=.06f;p.decaySeconds=.5f;p.preDelayMs=8; p.delay=0; }
    if(i==4){p.leveling=.7f;p.dynamicTame=.55f;p.reverbDuck=.65f;p.thresholdDb=-18;p.ratio=2.5f;p.makeupDb=1.5f;p.reverb=.09f;p.delay=.025f;p.delayMs=260;p.delayFeedback=.18f;p.decaySeconds=1.3f;p.preDelayMs=28;p.damping=.7f;p.width=.85f;}
    return p;
}
void Biquad::configure(Type type, double sr, double hz, double q, double db) noexcept {
    sr = std::clamp(sr, 8000.0, 384000.0);
    hz = std::clamp(hz, 10.0, sr * .45);
    q = std::clamp(q, .1, 10.0);
    const double w = 2*pi*hz/sr, c = std::cos(w), s = std::sin(w), alpha = s/(2*q);
    const double A = std::pow(10.0, std::clamp(db,-24.0,24.0)/40.0);
    double n0=1,n1=0,n2=0,d0=1,d1=0,d2=0;
    if (type == highPass) { n0=(1+c)/2;n1=-(1+c);n2=n0;d0=1+alpha;d1=-2*c;d2=1-alpha; }
    if (type == lowPass) { n0=(1-c)/2;n1=1-c;n2=n0;d0=1+alpha;d1=-2*c;d2=1-alpha; }
    if (type == peak) { n0=1+alpha*A;n1=-2*c;n2=1-alpha*A;d0=1+alpha/A;d1=-2*c;d2=1-alpha/A; }
    if (type == bandPass) { n0=alpha;n1=0;n2=-alpha;d0=1+alpha;d1=-2*c;d2=1-alpha; }
    if (type == lowShelf) {
        const double a=s*std::sqrt(2.0), t=2*std::sqrt(A)*a/2;
        n0=A*((A+1)-(A-1)*c+t);n1=2*A*((A-1)-(A+1)*c);n2=A*((A+1)-(A-1)*c-t);
        d0=(A+1)+(A-1)*c+t;d1=-2*((A-1)+(A+1)*c);d2=(A+1)+(A-1)*c-t;
    }
    b0=n0/d0;b1=n1/d0;b2=n2/d0;a1=d1/d0;a2=d2/d0;
}
float Biquad::tick(float x) noexcept {
    if (!std::isfinite(x)) x=0;
    const double y=b0*x+z1;
    z1=b1*x-a1*y+z2;z2=b2*x-a2*y;
    if (std::abs(z1)<1e-25) z1=0;
    if (std::abs(z2)<1e-25) z2=0;
    return std::isfinite(y) ? static_cast<float>(y) : 0.0f;
}
void Delay::prepare(double sr, double seconds) { data.assign(std::max<std::size_t>(4,static_cast<std::size_t>(sr*seconds)+2),0);cursor=0; }
void Delay::reset() noexcept { std::fill(data.begin(),data.end(),0.0f);cursor=0; }
float Delay::tap(std::size_t n) const noexcept { if(data.empty()) return 0; n=std::clamp<std::size_t>(n,1,data.size()-1);return data[(cursor+data.size()-n)%data.size()]; }
void Delay::push(float x) noexcept { if(data.empty())return;data[cursor]=std::isfinite(x)?x:0;cursor=(cursor+1)%data.size(); }
void VocalChain::prepare(double sr) {
    rate=std::clamp(sr,8000.0,384000.0);
    for(auto& c:channels) { c.echo.prepare(rate,2.01);c.preDelay.prepare(rate,.15);for(auto& d:c.comb)d.prepare(rate,.06);for(auto& d:c.allpass)d.prepare(rate,.009); }
    attack=static_cast<float>(std::exp(-1/(rate*.005)));release=static_cast<float>(std::exp(-1/(rate*.090)));essRelease=static_cast<float>(std::exp(-1/(rate*.045)));
    controlRate=static_cast<float>(1-std::exp(-1/(rate*.02)));
    powerRate=static_cast<float>(1-std::exp(-1/(rate*.05)));levelUp=static_cast<float>(1-std::exp(-1/(rate*.7)));levelDown=static_cast<float>(1-std::exp(-1/(rate*.08)));tameAttack=static_cast<float>(1-std::exp(-1/(rate*.005)));tameRelease=static_cast<float>(1-std::exp(-1/(rate*.12)));roomAttack=static_cast<float>(1-std::exp(-1/(rate*.01)));roomRelease=static_cast<float>(1-std::exp(-1/(rate*.18)));
    setParameters(p);reset();
}
void VocalChain::reset() noexcept {
    envelope=essEnvelope=reduction=0;compression=1;levelPower=levelDb=harshPower=harshGain=roomPower=0;levelAmount=tameAmount=duckAmount=0;
    for(auto& c:channels){ c.high.reset();c.warmth.reset();c.presence.reset();c.ess.reset();c.tame.reset();c.harsh.reset();c.echo.reset();c.preDelay.reset();for(auto& d:c.comb)d.reset();for(auto& d:c.allpass)d.reset();c.damping.fill(0); }
}
void VocalChain::setParameters(const VocalParameters& value) noexcept {
    p=value;p.ratio=std::clamp(p.ratio,1.0f,12.0f);p.deEss=std::clamp(p.deEss,0.0f,1.0f);p.reverb=std::clamp(p.reverb,0.0f,.4f);p.delay=std::clamp(p.delay,0.0f,.3f);
    p.decaySeconds=std::clamp(p.decaySeconds,.3f,4.0f);p.damping=std::clamp(p.damping,.05f,.95f);p.width=std::clamp(p.width,0.0f,1.5f);p.delayFeedback=std::clamp(p.delayFeedback,0.0f,.65f);p.deharsh=std::clamp(p.deharsh,0.0f,1.0f);
    p.leveling=std::clamp(p.leveling,0.0f,1.0f);p.dynamicTame=std::clamp(p.dynamicTame,0.0f,1.0f);p.reverbDuck=std::clamp(p.reverbDuck,0.0f,1.0f);
    preDelaySamples=static_cast<std::size_t>(rate*std::clamp(p.preDelayMs,0.0f,100.0f)/1000);
    constexpr double combTimes[4]={.0297,.0371,.0411,.0437};for(int j=0;j<4;++j)roomFeedback[j]=static_cast<float>(std::pow(.001,combTimes[j]/p.decaySeconds));
    preGain=dbToGain(p.inputDb);makeup=dbToGain(p.makeupDb);
    delaySamples=static_cast<std::size_t>(rate*std::clamp(p.delayMs,40.0f,1500.0f)/1000);
    for(auto& c:channels) { c.high.configure(Biquad::highPass,rate,p.highPassHz,.707);c.warmth.configure(Biquad::lowShelf,rate,240,.707,p.warmthDb);c.presence.configure(Biquad::peak,rate,3200,.8,p.presenceDb);c.ess.configure(Biquad::bandPass,rate,std::min(6800.0,rate*.35),1.1);c.tame.configure(Biquad::lowPass,rate,14000-9000*p.deharsh,.707);c.harsh.configure(Biquad::bandPass,rate,std::min(3500.0,rate*.3),.75); }
}
void VocalChain::process(float& left,float& right) noexcept {processDry(left,right);processAmbience(left,right);}
void VocalChain::processDry(float& left, float& right) noexcept {
    if(p.bypass) return;
    float x[2]={left*preGain,right*preGain}, ess[2]={0,0};
    for(int i=0;i<2;++i) { auto& c=channels[static_cast<std::size_t>(i)];x[i]=c.presence.tick(c.warmth.tick(c.high.tick(x[i]))); }
    levelAmount+=(p.leveling-levelAmount)*controlRate;tameAmount+=(p.dynamicTame-tameAmount)*controlRate;
    const float power=static_cast<float>(std::min(16.0,(static_cast<double>(x[0])*x[0]+static_cast<double>(x[1])*x[1])*.5));levelPower+=(power-levelPower)*powerRate;
    if(levelAmount>1e-6f||std::abs(levelDb)>1e-5f){const float db=10*std::log10(std::max(1e-12f,levelPower));const float target=db>-40?std::clamp(-22-db,-6.0f,4.0f)*levelAmount:0;const float speed=p.leveling<=0?controlRate:(target<levelDb?levelDown:levelUp);levelDb+=(target-levelDb)*speed;const float gain=dbToGain(levelDb);x[0]*=gain;x[1]*=gain;}else levelDb=0;
    if(tameAmount>1e-6f||harshGain>1e-6f){float band[2]={channels[0].harsh.tick(x[0]),channels[1].harsh.tick(x[1])};const float energy=std::min(16.0f,(band[0]*band[0]+band[1]*band[1])*.5f);harshPower+=(energy-harshPower)*powerRate;const float wide=std::max(1e-12f,levelPower*dbToGain(levelDb*2));const float target=wide>1e-5f?std::clamp((harshPower/wide-.18f)*1.3f,0.0f,.55f)*tameAmount:0;harshGain+=(target-harshGain)*(target>harshGain?tameAttack:tameRelease);x[0]-=band[0]*harshGain;x[1]-=band[1]*harshGain;}else harshGain=0;
    for(int i=0;i<2;++i)ess[i]=channels[static_cast<std::size_t>(i)].ess.tick(x[i]);
    const float peak=std::max(std::abs(x[0]),std::abs(x[1]));
    envelope=peak>envelope ? attack*envelope+(1-attack)*peak : release*envelope+(1-release)*peak;
    const float over=gainToDb(envelope)-std::clamp(p.thresholdDb,-48.0f,0.0f), knee=6;
    float gr=0;
    if(over>knee/2) gr=over*(1-1/p.ratio);
    else if(over>-knee/2) gr=(1-1/p.ratio)*(over+knee/2)*(over+knee/2)/(2*knee);
    const float desired=dbToGain(-gr);
    compression=desired<compression ? attack*compression+(1-attack)*desired : release*compression+(1-release)*desired;
    reduction=-gainToDb(compression);
    const float essPeak=std::max(std::abs(ess[0]),std::abs(ess[1]));
    essEnvelope=std::max(essPeak,essRelease*essEnvelope);
    const float deEss=std::clamp((essEnvelope-.035f)*6,0.0f,.85f)*p.deEss;
    for(int i=0;i<2;++i){auto& channel=channels[static_cast<std::size_t>(i)];float value=(x[i]-ess[i]*deEss)*compression*makeup;value=value*(1-p.deharsh*.5f)+channel.tame.tick(value)*p.deharsh*.5f;if(i==0)left=value;else right=value;}
}
void VocalChain::processAmbience(float& left,float& right) noexcept {
    if(p.bypass)return;
    const float signal[2]={left,right};duckAmount+=(p.reverbDuck-duckAmount)*controlRate;
    const float power=static_cast<float>(std::min(16.0,(static_cast<double>(left)*left+static_cast<double>(right)*right)*.5));roomPower+=(power-roomPower)*(power>roomPower?roomAttack:roomRelease);const float activity=std::clamp((10*std::log10(std::max(1e-12f,roomPower))+36)/20,0.0f,1.0f);const float wetGain=1-.75f*duckAmount*activity;
    constexpr double combTimes[4]={.0297,.0371,.0411,.0437};
    constexpr double allpassTimes[2]={.005,.0017};
    float wet[2]={0,0},echoWet[2]={0,0},drySignal[2]={0,0};
    for(int i=0;i<2;++i) {
        auto& c=channels[static_cast<std::size_t>(i)];float dry=signal[i];drySignal[i]=dry;
        const float echo=c.echo.tap(delaySamples);c.echo.push(dry+echo*p.delayFeedback);echoWet[i]=echo;
        const float excitation=preDelaySamples>0?c.preDelay.tap(preDelaySamples):dry;c.preDelay.push(dry);
        float room=0;
        for(std::size_t j=0;j<4;++j) {const auto n=static_cast<std::size_t>(rate*(combTimes[j]+i*.0013));const float v=c.comb[j].tap(n);c.damping[j]=(1-p.damping)*v+p.damping*c.damping[j];c.comb[j].push(excitation+c.damping[j]*roomFeedback[j]);room+=v*.25f;}
        for(std::size_t j=0;j<2;++j) {const auto n=static_cast<std::size_t>(rate*(allpassTimes[j]+i*.00013));const float delayed=c.allpass[j].tap(n);const float v=delayed-room*.5f;c.allpass[j].push(room+delayed*.5f);room=v;}
        wet[i]=room;
    }
    const float middle=(wet[0]+wet[1])*.5f,side=(wet[0]-wet[1])*.5f*p.width;
    left=drySignal[0]*(1-p.reverb*.3f)+(middle+side)*p.reverb*wetGain+echoWet[0]*p.delay*wetGain;right=drySignal[1]*(1-p.reverb*.3f)+(middle-side)*p.reverb*wetGain+echoWet[1]*p.delay*wetGain;
}
void Limiter::prepare(double sr) {lookahead=std::max<std::size_t>(1,static_cast<std::size_t>(sr*.001));for(auto& d:delay)d.prepare(sr,.003);recovery=static_cast<float>(std::exp(-1/(sr*.080)));reset();}
void Limiter::reset() noexcept {gain=1;hold=0;for(auto& d:delay)d.reset();}
void Limiter::process(float& l,float& r) noexcept {
    if(!std::isfinite(l)) l=0;
    if(!std::isfinite(r)) r=0;
    constexpr float ceiling=.891250938f;
    const float peak=std::max(std::abs(l),std::abs(r));const float target=peak>ceiling?ceiling/peak:1;
    if(target<gain){gain=target;hold=lookahead+1;}else if(hold>0)--hold;else gain=1-(1-gain)*recovery;
    const float a=delay[0].tap(lookahead),b=delay[1].tap(lookahead);delay[0].push(l);delay[1].push(r);
    l=std::clamp(a*gain,-ceiling,ceiling);r=std::clamp(b*gain,-ceiling,ceiling);
}
}

namespace vocal {
std::vector<float> resampleBandlimited(const float* input,std::size_t length,double fromRate,double toRate){
    if(fromRate<=0||toRate<=0||!input||length==0)return {};
    if(std::abs(fromRate-toRate)<.01)return {input,input+length};
    constexpr int taps=64,phases=2048;
    const double ratio=fromRate/toRate,cutoff=std::min(1.0,1/ratio)*.94;
    std::vector<float> table(phases*taps);
    for(int phase=0;phase<phases;++phase){double sum=0;const double fraction=static_cast<double>(phase)/phases;
        for(int tap=0;tap<taps;++tap){const double distance=tap-taps/2+1-fraction;const double z=pi*distance*cutoff;const double sinc=std::abs(z)<1e-12?1:std::sin(z)/z;const double w=.42-.5*std::cos(2*pi*tap/(taps-1))+.08*std::cos(4*pi*tap/(taps-1));const float c=static_cast<float>(cutoff*sinc*w);table[phase*taps+tap]=c;sum+=c;}
        for(int tap=0;tap<taps;++tap)table[phase*taps+tap]/=static_cast<float>(sum);
    }
    std::vector<float> result(static_cast<std::size_t>(std::llround(length/ratio)));
    for(std::size_t i=0;i<result.size();++i){const double position=i*ratio;auto centre=static_cast<long long>(std::floor(position));int phase=static_cast<int>(std::llround((position-centre)*phases));if(phase==phases){phase=0;++centre;}double value=0;const auto* coefficients=table.data()+phase*taps;
        for(int tap=0;tap<taps;++tap){const auto index=centre+tap-taps/2+1;if(index>=0&&index<static_cast<long long>(length))value+=input[index]*coefficients[tap];}result[i]=static_cast<float>(value);
    }return result;
}
}
