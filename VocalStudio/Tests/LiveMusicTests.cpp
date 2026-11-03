#include "LiveMusic.h"
#include "Pitch.h"
#include "Dsp.h"
#include <array>
#include <chrono>
#include <thread>
#include <cmath>
#include <iostream>
#include <stdexcept>
namespace {void check(bool ok,const char* msg){if(!ok)throw std::runtime_error(msg);}}
int main(){try{
    vocal::LiveMusic live;live.gain=1;live.start();std::atomic<bool> cancel{false};std::atomic<float> progress{0};
    constexpr int block=480,rate=48000;std::array<float,block> source{},left{},right{};std::uint64_t frame=0;
    for(int semitones:{0,-1,1,-12,12}){
        live.setSemitones(semitones);vocal::AudioChannels captured(1);double difference=0,energy=0;const auto start=std::chrono::steady_clock::now();
        for(int packet=0;packet<170;++packet){for(int i=0;i<block;++i,++frame)source[i]=static_cast<float>(.2*std::sin(2*vocal::pi*220*frame/rate));const float* inputs[]={source.data(),source.data()};check(live.push(inputs,2,block)==block,"live input FIFO overflow");live.render(left.data(),right.data(),block,rate);if(packet>70)for(int i=0;i<block;++i){check(std::isfinite(left[i])&&std::isfinite(right[i]),"finite live audio");difference+=std::pow(left[i]-right[i],2);energy+=left[i]*left[i];captured[0].push_back(left[i]);}std::this_thread::sleep_until(start+std::chrono::milliseconds(10*(packet+1)));}
        std::cout<<"stereo difference ratio="<<difference/std::max(1e-20,energy)<<"\n";check(difference/std::max(1e-20,energy)<.0001,"live stereo coherence");auto found=vocal::analysePitch(captured,rate,true,cancel,progress);const double expected=220*std::pow(2,semitones/12.0),cents=1200*std::log2(found.medianHz/expected);std::cout<<semitones<<" semitones: "<<found.medianHz<<" Hz, "<<cents<<" cents\n";check(std::isfinite(cents)&&std::abs(cents)<15,"live transpose pitch accuracy");
    }
    const auto before=live.key();live.beginSong();const auto after=live.key();check(after.tonic==-1&&after.generation>before.generation,"new song must clear prior key");check(live.semitones()==12,"song change must preserve user's transpose");
    live.setSemitones(3);const double chords[4][3]={{261.625565,329.627557,391.995436},{349.228231,440,523.251131},{391.995436,493.883301,587.329536},{261.625565,329.627557,391.995436}};const auto keyStart=std::chrono::steady_clock::now();
    for(int packet=0;packet<850;++packet){for(int i=0;i<block;++i){source[i]=0;for(double hz:chords[(packet/100)%4])source[i]+=static_cast<float>(.08*std::sin(2*vocal::pi*hz*(packet*block+i)/rate));}const float* inputs[]={source.data(),source.data()};live.push(inputs,2,block);live.render(left.data(),right.data(),block,rate);std::this_thread::sleep_until(keyStart+std::chrono::milliseconds(10*(packet+1)));}
    const auto key=live.key();std::cout<<"live raw key="<<key.tonic<<" minor="<<key.minor<<" confidence="<<key.confidence<<"\n";check(key.tonic==0&&!key.minor,"key detector must hear original C major, independent of +3 music transpose");
    live.setSemitones(0);live.render(left.data(),right.data(),block,44100);for(float s:left)check(std::isfinite(s),"44.1k resampling finite");live.stop();auto stats=live.statistics();check(stats.inputFrames==(5*170+850)*block,"source duration/frame count");check(stats.outputFrames==(5*170+850)*block+block,"render duration/frame count");check(stats.droppedFrames==0,"no dropped real-time frames");std::cout<<"PASS: live +/- one semitone and octave, stereo, duration, rate conversion and song reset\n";return 0;
}catch(const std::exception& e){std::cerr<<"FAIL: "<<e.what()<<"\n";return 1;}}
