#include "Dsp.h"
#include <algorithm>
#include <cmath>
#include <limits>
namespace vocal {
float dbToGain(float db) noexcept { return std::pow(10.0f, std::clamp(db, -120.0f, 36.0f) / 20.0f); }
float gainToDb(float gain) noexcept { return 20.0f * std::log10(std::max(1.0e-6f, std::abs(gain))); }
VocalParameters preset(int i) noexcept {
    VocalParameters p;
    if (i == 1) { p.highPassHz=70; p.warmthDb=1; p.presenceDb=1.5f; p.ratio=2.5f; p.thresholdDb=-20; p.reverb=.16f; p.delay=.08f; p.delayMs=330; }
    if (i == 2) { p.highPassHz=95; p.warmthDb=-3; p.presenceDb=3; p.thresholdDb=-22; p.ratio=4; p.makeupDb=4; p.deEss=.55f; p.reverb=.08f; p.delay=.06f; p.delayMs=190; }
    if (i == 3) { p.highPassHz=75; p.presenceDb=.5f; p.ratio=2; p.makeupDb=1; p.reverb=.06f; p.delay=0; }
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
void Delay::reset() noexcept { std::fill(data.begin(),data.end(),0);cursor=0; }
float Delay::tap(std::size_t n) const noexcept { if(data.empty()) return 0; n=std::clamp<std::size_t>(n,1,data.size()-1);return data[(cursor+data.size()-n)%data.size()]; }
void Delay::push(float x) noexcept { if(data.empty())return;data[cursor]=std::isfinite(x)?x:0;cursor=(cursor+1)%data.size(); }
void VocalChain::prepare(double sr) {
    rate=std::clamp(sr,8000.0,384000.0);
    for(auto& c:channels) { c.echo.prepare(rate,2.01);for(auto& d:c.comb)d.prepare(rate,.06);for(auto& d:c.allpass)d.prepare(rate,.009); }
    attack=static_cast<float>(std::exp(-1/(rate*.005)));release=static_cast<float>(std::exp(-1/(rate*.090)));essRelease=static_cast<float>(std::exp(-1/(rate*.045)));
    setParameters(p);reset();
}
void VocalChain::reset() noexcept {
    envelope=essEnvelope=reduction=0;compression=1;
    for(auto& c:channels){ c.high.reset();c.warmth.reset();c.presence.reset();c.ess.reset();c.echo.reset();for(auto& d:c.comb)d.reset();for(auto& d:c.allpass)d.reset();c.damping.fill(0); }
}
void VocalChain::setParameters(const VocalParameters& value) noexcept {
    p=value;p.ratio=std::clamp(p.ratio,1.0f,12.0f);p.deEss=std::clamp(p.deEss,0.0f,1.0f);p.reverb=std::clamp(p.reverb,0.0f,.4f);p.delay=std::clamp(p.delay,0.0f,.3f);
    preGain=dbToGain(p.inputDb);makeup=dbToGain(p.makeupDb);
    delaySamples=static_cast<std::size_t>(rate*std::clamp(p.delayMs,40.0f,1500.0f)/1000);
    for(auto& c:channels) { c.high.configure(Biquad::highPass,rate,p.highPassHz,.707);c.warmth.configure(Biquad::lowShelf,rate,240,.707,p.warmthDb);c.presence.configure(Biquad::peak,rate,3200,.8,p.presenceDb);c.ess.configure(Biquad::bandPass,rate,std::min(6800.0,rate*.35),1.1); }
}
void VocalChain::process(float& left, float& right) noexcept {
    if(p.bypass) return;
    float x[2]={left*preGain,right*preGain}, ess[2]={0,0};
    for(int i=0;i<2;++i) { auto& c=channels[static_cast<std::size_t>(i)];x[i]=c.presence.tick(c.warmth.tick(c.high.tick(x[i])));ess[i]=c.ess.tick(x[i]); }
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
    constexpr double combTimes[4]={.0297,.0371,.0411,.0437};
    constexpr double allpassTimes[2]={.005,.0017};
    for(int i=0;i<2;++i) {
        auto& c=channels[static_cast<std::size_t>(i)];float dry=(x[i]-ess[i]*deEss)*compression*makeup;
        const float echo=c.echo.tap(delaySamples);c.echo.push(dry+echo*.27f);
        float room=0;
        for(std::size_t j=0;j<4;++j) {const auto n=static_cast<std::size_t>(rate*(combTimes[j]+i*.0013));const float v=c.comb[j].tap(n);c.damping[j]=.28f*v+.72f*c.damping[j];c.comb[j].push(dry+c.damping[j]*.76f);room+=v*.25f;}
        for(std::size_t j=0;j<2;++j) {const auto n=static_cast<std::size_t>(rate*(allpassTimes[j]+i*.00013));const float delayed=c.allpass[j].tap(n);const float v=delayed-room*.5f;c.allpass[j].push(room+delayed*.5f);room=v;}
        x[i]=dry*(1-p.reverb*.3f)+room*p.reverb+echo*p.delay;
    }
    left=x[0];right=x[1];
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
