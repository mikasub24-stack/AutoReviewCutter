#include "Dsp.h"
#include <cmath>
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
void check(bool ok,const char* what){if(!ok)throw std::runtime_error(what);}
int main(){try{
 check(std::abs(vocal::dbToGain(-6)-.501187f)<.00001f,"dB conversion");
 vocal::Delay d;d.prepare(48000,.1);d.push(1);check(d.tap(1)==1,"delay exact sample");d.reset();check(d.tap(1)==0,"delay clears");
 vocal::Biquad hp;hp.configure(vocal::Biquad::highPass,48000,100,.707);float dc=0;for(int i=0;i<48000;++i)dc=hp.tick(1);check(std::abs(dc)<.00001,"highpass rejects DC");
 vocal::Limiter limiter;limiter.prepare(48000);check(limiter.latency()==48,"limiter reported latency");
 for(int i=0;i<200000;++i){float l=4*std::sin(i*.04f),r=-l;limiter.process(l,r);check(std::abs(l)<=.891251f&&std::isfinite(r),"limiter ceiling");}
 limiter.reset();float l=std::numeric_limits<float>::infinity(),rr=std::numeric_limits<float>::quiet_NaN();limiter.process(l,rr);check(std::isfinite(l)&&std::isfinite(rr),"nonfinite containment");
 for(double rate:{44100.,48000.,96000.,192000.}){vocal::VocalChain chain;chain.prepare(rate);chain.setParameters(vocal::preset(2));double energy=0;for(int i=0;i<static_cast<int>(rate*2);++i){float a=.18f*std::sin(static_cast<float>(i*2*vocal::pi*220/rate)),b=a;chain.process(a,b);check(std::isfinite(a)&&std::abs(a)<10,"stable vocal chain");energy+=a*a;}check(energy>1,"vocal chain not silent");}
 vocal::VocalChain a,b;a.prepare(48000);b.prepare(48000);auto p=vocal::preset(1);a.setParameters(p);b.setParameters(p);for(int i=0;i<9000;++i){float x=.2f*std::sin(i*.03f),y=x,u=x,v=x;a.process(x,y);b.process(u,v);check(x==u&&y==v,"deterministic block-independent DSP");}
 p.bypass=true;a.setParameters(p);l=.123f;rr=-.456f;a.process(l,rr);check(l==.123f&&rr==-.456f,"bit exact FX bypass");
 std::vector<float> source(96000);for(std::size_t i=0;i<source.size();++i)source[i]=static_cast<float>(std::sin(i*2*vocal::pi*32000/96000));auto converted=vocal::resampleBandlimited(source.data(),source.size(),96000,48000);check(converted.size()==48000,"resampling duration");double alias=0;for(std::size_t i=100;i+100<converted.size();++i)alias+=converted[i]*converted[i];check(alias/47800<.00001,"downsampling suppresses alias frequencies");
 std::cout<<"PASS: DSP headroom, limiter latency, EQ, four sample rates, bypass and determinism\n";return 0;
}catch(const std::exception& e){std::cerr<<"FAIL: "<<e.what()<<'\n';return 1;}}
