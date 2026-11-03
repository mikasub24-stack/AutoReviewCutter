#include "LiveMusic.h"
#include "Pitch.h"
#include "signalsmith-stretch.h"
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <mutex>
#include <thread>
#include <vector>
namespace vocal {namespace {
constexpr int rate=48000,block=256;
constexpr std::size_t queueSize=32768,analysisSize=rate*8,warmup=1536;
struct Frame {float left=0,right=0;std::uint64_t generation=0;};
class Queue {
    std::array<Frame,queueSize> data{};
    alignas(64) std::atomic<std::uint64_t> write{0};
    alignas(64) std::atomic<std::uint64_t> read{0};
public:
    bool push(Frame f) noexcept {const auto w=write.load(std::memory_order_relaxed);if(w-read.load(std::memory_order_acquire)>=queueSize)return false;data[static_cast<std::size_t>(w)&(queueSize-1)]=f;write.store(w+1,std::memory_order_release);return true;}
    bool pop(Frame& f) noexcept {const auto r=read.load(std::memory_order_relaxed);if(r==write.load(std::memory_order_acquire))return false;f=data[static_cast<std::size_t>(r)&(queueSize-1)];read.store(r+1,std::memory_order_release);return true;}
    std::size_t size() const noexcept {const auto r=read.load(std::memory_order_acquire),w=write.load(std::memory_order_acquire);return static_cast<std::size_t>(w>=r?std::min<std::uint64_t>(w-r,queueSize):0);}
    void discardConsumer() noexcept {read.store(write.load(std::memory_order_acquire),std::memory_order_release);}
};
}
struct LiveMusic::Impl {
    Queue input,output;std::atomic<bool> running{false},resetOutput{false};std::thread worker,analyser;
    std::atomic<int> target{0},latency{0};std::atomic<std::uint64_t> generation{1},inputFrames{0},outputFrames{0},dropped{0},underflows{0};
    std::mutex analysisMutex,keyMutex;std::vector<float> analysis=std::vector<float>(analysisSize);std::uint64_t analysisCount=0,analysisGeneration=0;LiveKey detected;
    std::uint64_t renderGeneration=0;Frame a,b;double phase=0,drift=1;bool primed=false;float fade=0,lastLeft=0,lastRight=0;
    void publishUnknown(std::uint64_t epoch){std::lock_guard<std::mutex> lock(keyMutex);detected.tonic=-1;detected.confidence=0;detected.generation=epoch;++detected.revision;}
    void process(){
        signalsmith::stretch::SignalsmithStretch<float> stretch(9017);stretch.presetDefault(2,static_cast<float>(rate));stretch.setFormantFactor(1,false);latency=stretch.inputLatency()+stretch.outputLatency();
        std::array<std::array<float,block>,2> in{},out{};std::array<const float*,2> inputs{in[0].data(),in[1].data()};std::array<float*,2> outputs{out[0].data(),out[1].data()};std::uint64_t epoch=0;float pitch=0;int collected=0;bool wasBlocked=false;
        while(running.load()){
            if(output.size()>queueSize-block*2){resetOutput=true;input.discardConsumer();stretch.reset();collected=0;wasBlocked=true;std::this_thread::sleep_for(std::chrono::milliseconds(2));continue;}
            if(wasBlocked){wasBlocked=false;pitch=static_cast<float>(target.load());}
            Frame f;if(!input.pop(f)){std::this_thread::sleep_for(std::chrono::milliseconds(1));continue;}
            if(f.generation!=generation.load())continue;
            if(f.generation!=epoch){epoch=f.generation;stretch.reset();pitch=static_cast<float>(target.load());collected=0;std::lock_guard<std::mutex> lock(analysisMutex);analysisCount=0;analysisGeneration=epoch;}
            in[0][static_cast<std::size_t>(collected)]=f.left;in[1][static_cast<std::size_t>(collected)]=f.right;++collected;if(collected<block)continue;
            {std::lock_guard<std::mutex> lock(analysisMutex);for(int i=0;i<block;++i)analysis[static_cast<std::size_t>(analysisCount++)%analysisSize]=(in[0][i]+in[1][i])*.5f;}
            pitch+=(target.load()-pitch)*.2f;stretch.setTransposeSemitones(pitch);stretch.process(inputs,block,outputs,block);for(int i=0;i<block;++i){Frame result{std::isfinite(out[0][i])?out[0][i]:0,std::isfinite(out[1][i])?out[1][i]:0,epoch};if(!output.push(result))++dropped;}
            collected=0;
        }
    }
    void analyse(){std::uint64_t lastCount=0,lastGeneration=0;int candidate=-1,streak=0;bool candidateMinor=false;std::atomic<bool> cancel{false};std::atomic<float> progress{0};
        while(running.load()){
            std::this_thread::sleep_for(std::chrono::milliseconds(100));AudioChannels snapshot(1);std::uint64_t count=0,epoch=0;
            {std::lock_guard<std::mutex> lock(analysisMutex);count=analysisCount;epoch=analysisGeneration;if(epoch!=lastGeneration){lastGeneration=epoch;lastCount=0;candidate=-1;streak=0;}if(count<rate*4||count-lastCount<rate)continue;const auto n=static_cast<std::size_t>(std::min<std::uint64_t>(count,analysisSize));snapshot[0].resize(n);for(std::size_t i=0;i<n;++i)snapshot[0][i]=analysis[static_cast<std::size_t>(count-n+i)%analysisSize];lastCount=count;}
            if(!running.load())break;auto result=analysePitch(snapshot,rate,false,cancel,progress);if(epoch!=generation.load()||!running.load())continue;
            if(result.tonic>=0&&result.keyConfidence>=.55){if(result.tonic==candidate&&result.minor==candidateMinor)++streak;else{candidate=result.tonic;candidateMinor=result.minor;streak=1;}if(streak>=2){std::lock_guard<std::mutex> lock(keyMutex);if(detected.tonic!=candidate||detected.minor!=candidateMinor||detected.generation!=epoch){detected={candidate,candidateMinor,result.keyConfidence,epoch,detected.revision+1};}}}else streak=0;
        }
    }
    bool next(Frame& f) noexcept {for(std::size_t i=0;i<queueSize;++i){if(!output.pop(f))return false;if(f.generation==renderGeneration)return true;}return false;}
};
LiveMusic::LiveMusic():impl(std::make_unique<Impl>()){}
LiveMusic::~LiveMusic(){stop();}
void LiveMusic::start(){if(impl->running.exchange(true))return;impl->worker=std::thread([this]{impl->process();});impl->analyser=std::thread([this]{impl->analyse();});}
void LiveMusic::stop(){if(!impl->running.exchange(false))return;if(impl->worker.joinable())impl->worker.join();if(impl->analyser.joinable())impl->analyser.join();}
void LiveMusic::beginSong(){const auto epoch=impl->generation.fetch_add(1)+1;impl->publishUnknown(epoch);}
void LiveMusic::setSemitones(int value) noexcept {impl->target=std::clamp(value,-12,12);}
int LiveMusic::semitones() const noexcept{return impl->target.load();}
std::size_t LiveMusic::push(const float* const* channels,int channelCount,int frames) noexcept {if(!channels||channelCount<1||frames<1)return 0;const auto epoch=impl->generation.load();std::size_t accepted=0;for(int i=0;i<frames;++i){const float l=channels[0]&&std::isfinite(channels[0][i])?channels[0][i]:0,r=channelCount>1&&channels[1]&&std::isfinite(channels[1][i])?channels[1][i]:l;if(impl->input.push({l,r,epoch}))++accepted;else ++impl->dropped;}impl->inputFrames+=accepted;return accepted;}
void LiveMusic::render(float* left,float* right,int frames,double outputRate) noexcept {
    if(!left||!right||frames<1)return;std::fill(left,left+frames,0);std::fill(right,right+frames,0);auto& s=*impl;const auto epoch=s.generation.load();if(s.renderGeneration!=epoch||s.resetOutput.exchange(false)){s.renderGeneration=epoch;s.primed=false;s.phase=0;s.fade=0;s.output.discardConsumer();}
    const double desiredDrift=1+std::clamp((static_cast<double>(s.output.size())-warmup)/static_cast<double>(queueSize)*.002,-.001,.001);s.drift+=(desiredDrift-s.drift)*.01;const double step=rate/std::clamp(outputRate,8000.0,192000.0)*s.drift;const float volume=std::clamp(gain.load(),0.0f,1.5f);
    for(int i=0;i<frames;++i){if(!s.primed){if(s.output.size()>=warmup&&s.next(s.a)&&s.next(s.b)){s.primed=true;s.phase=0;}else{s.fade*=.98f;left[i]=s.lastLeft*s.fade;right[i]=s.lastRight*s.fade;continue;}}
        s.fade=std::min(1.0f,s.fade+.005f);s.lastLeft=(s.a.left+(s.b.left-s.a.left)*static_cast<float>(s.phase))*volume;s.lastRight=(s.a.right+(s.b.right-s.a.right)*static_cast<float>(s.phase))*volume;left[i]=s.lastLeft*s.fade;right[i]=s.lastRight*s.fade;s.phase+=step;
        while(s.phase>=1){s.phase-=1;s.a=s.b;if(!s.next(s.b)){s.primed=false;++s.underflows;break;}}
    }s.outputFrames+=static_cast<std::uint64_t>(frames);
}
LiveKey LiveMusic::key() const {std::lock_guard<std::mutex> lock(impl->keyMutex);return impl->detected;}
LiveStatistics LiveMusic::statistics() const noexcept {return {impl->inputFrames.load(),impl->outputFrames.load(),impl->dropped.load(),impl->underflows.load(),impl->output.size()};}
double LiveMusic::processingLatencyMs() const noexcept{return 1000.0*(impl->latency.load()+warmup)/rate;}
}
