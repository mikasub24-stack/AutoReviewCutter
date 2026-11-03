#include "Pitch.h"
#include "Dsp.h"
#include "signalsmith-stretch.h"
#include <algorithm>
#include <cmath>
#include <complex>
#include <numeric>
#include <stdexcept>
namespace vocal {namespace {
constexpr int analysisRate=12000,frameSize=1024,hopSize=240,fftSize=2048;
void fft(std::vector<std::complex<double>>& values,bool inverse){
    const auto n=values.size();for(std::size_t i=1,j=0;i<n;++i){auto bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j)std::swap(values[i],values[j]);}
    for(std::size_t length=2;length<=n;length<<=1){const auto step=std::polar(1.0,(inverse?2:-2)*pi/length);for(std::size_t i=0;i<n;i+=length){std::complex<double> phase=1;for(std::size_t j=0;j<length/2;++j){const auto a=values[i+j],b=values[i+j+length/2]*phase;values[i+j]=a+b;values[i+j+length/2]=a-b;phase*=step;}}}
    if(inverse)for(auto& x:values)x/=static_cast<double>(n);
}
PitchFrame fundamental(const float* input,double seconds){
    PitchFrame result;result.seconds=seconds;std::vector<std::complex<double>> spectrum(fftSize);std::array<double,frameSize+1> energy{};double mean=0;for(int i=0;i<frameSize;++i)mean+=input[i];mean/=frameSize;
    for(int i=0;i<frameSize;++i){const double x=input[i]-mean;spectrum[i]=x;energy[i+1]=energy[i]+x*x;}result.rms=std::sqrt(energy.back()/frameSize);if(result.rms<.002)return result;
    fft(spectrum,false);for(auto& x:spectrum)x=std::norm(x);fft(spectrum,true);
    constexpr int first=analysisRate/1000,last=analysisRate/55;std::array<double,last+2> difference{};double cumulative=0;
    for(int tau=1;tau<=last+1;++tau){const double d=std::max(0.0,(energy[frameSize-tau]+energy.back()-energy[tau]-2*spectrum[tau].real())/(frameSize-tau));cumulative+=d;difference[tau]=cumulative>1e-12?d*tau/cumulative:1;}
    int best=-1;for(int tau=first;tau<last;++tau)if(difference[tau]<.15){while(tau+1<last&&difference[tau+1]<difference[tau])++tau;best=tau;break;}
    if(best<0)return result;
    double shift=0;const double denominator=difference[best-1]-2*difference[best]+difference[best+1];if(std::abs(denominator)>1e-12)shift=std::clamp(.5*(difference[best-1]-difference[best+1])/denominator,-.5,.5);
    const double hz=analysisRate/(best+shift);result.midi=69+12*std::log2(hz/440);result.confidence=std::clamp(1-difference[best],0.0,1.0);return result;
}
void addSpectralChroma(const float* input,std::array<double,12>& chroma){
    constexpr int n=4096;std::vector<std::complex<double>> spectrum(n);for(int i=0;i<n;++i)spectrum[i]=input[i]*(.5-.5*std::cos(2*pi*i/(n-1)));fft(spectrum,false);std::array<double,12> current{};
    for(int bin=25;bin<680;++bin){const double magnitude=std::abs(spectrum[bin]);if(magnitude<std::abs(spectrum[bin-1])||magnitude<std::abs(spectrum[bin+1]))continue;const double denominator=std::abs(spectrum[bin-1])-2*magnitude+std::abs(spectrum[bin+1]);const double offset=std::abs(denominator)>1e-12?std::clamp(.5*(std::abs(spectrum[bin-1])-std::abs(spectrum[bin+1]))/denominator,-.5,.5):0;const double frequency=(bin+offset)*analysisRate/n;const double midi=69+12*std::log2(frequency/440);const int note=static_cast<int>(std::llround(midi));const double cents=std::abs(midi-note);if(cents>.35)continue;current[(note%12+12)%12]+=std::sqrt(magnitude)/std::sqrt(frequency);}
    const double total=std::accumulate(current.begin(),current.end(),0.0);if(total>1e-8)for(int i=0;i<12;++i)chroma[i]+=current[i]/total;
}
void estimateKey(PitchAnalysis& result){
    constexpr std::array<double,12> major{6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88},minor{6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17};
    const double total=std::accumulate(result.chroma.begin(),result.chroma.end(),0.0);if(total<1e-8)return;const auto maximum=*std::max_element(result.chroma.begin(),result.chroma.end());int distinct=0;for(double x:result.chroma)if(x>maximum*.12)++distinct;if(distinct<3)return;
    std::array<double,24> scores{};const double average=total/12;for(int mode=0;mode<2;++mode){const auto& profile=mode?minor:major;const double mean=std::accumulate(profile.begin(),profile.end(),0.0)/12;for(int root=0;root<12;++root){double numerator=0,a=0,b=0;for(int i=0;i<12;++i){const double x=result.chroma[i]-average,y=profile[(i-root+12)%12]-mean;numerator+=x*y;a+=x*x;b+=y*y;}scores[mode*12+root]=a*b>0?numerator/std::sqrt(a*b):0;}}
    std::array<int,24> order{};std::iota(order.begin(),order.end(),0);std::sort(order.begin(),order.end(),[&](int a,int b){return scores[a]>scores[b];});const int best=order[0];result.tonic=best%12;result.minor=best>=12;const double margin=scores[best]-scores[order[1]];result.keyConfidence=std::clamp(.3+margin*3+std::max(0.0,scores[best]-.5)*.5,0.0,.95);result.alternative=noteName(60+order[1]%12)+(order[1]>=12?" minor":" major");
}
}
std::string noteName(double midi){static const char* names[]={"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};const int note=static_cast<int>(std::llround(midi));return names[(note%12+12)%12];}
double nearestScaleNote(double midi,int tonic,bool minor){if(tonic<0)return std::round(midi);constexpr int major[]={0,2,4,5,7,9,11},naturalMinor[]={0,2,3,5,7,8,10};double best=std::round(midi),distance=100;for(int note=static_cast<int>(std::floor(midi))-12;note<=static_cast<int>(std::ceil(midi))+12;++note){const int pitchClass=((note-tonic)%12+12)%12;for(int degreeIndex=0;degreeIndex<7;++degreeIndex)if(pitchClass==(minor?naturalMinor[degreeIndex]:major[degreeIndex])&&std::abs(note-midi)<distance){best=note;distance=std::abs(note-midi);}}return best;}
PitchAnalysis analysePitch(const AudioChannels& input,double rate,bool monophonic,std::atomic<bool>& cancel,std::atomic<float>& progress){
    if(input.empty()||input[0].empty()||rate<8000||rate>192000)throw std::runtime_error("Invalid pitch-analysis input");
    PitchAnalysis result;result.monophonic=monophonic;std::vector<float> mono(input[0].size());std::size_t clipped=0;
    for(std::size_t i=0;i<mono.size();++i){for(const auto& channel:input){if(channel.size()!=mono.size())throw std::runtime_error("Unequal channel lengths");const float sample=std::isfinite(channel[i])?channel[i]:0;mono[i]+=sample/static_cast<float>(input.size());if(std::abs(sample)>=.999f)++clipped;}}result.clippedFraction=static_cast<double>(clipped)/(mono.size()*input.size());
    if(input.size()>1){double midEnergy=0;for(float x:mono)midEnergy+=x*x;double strongestEnergy=0;const std::vector<float>* strongest=nullptr;for(const auto& channel:input){double energy=0;for(float x:channel)if(std::isfinite(x))energy+=x*x;if(energy>strongestEnergy){strongestEnergy=energy;strongest=&channel;}}if(strongest&&midEnergy<strongestEnergy*.1)mono=*strongest;}
    if(cancel.load())return result;
    auto reduced=resampleBandlimited(mono.data(),mono.size(),rate,analysisRate);progress.store(.1f);std::vector<double> frequencies;int voiced=0,total=0;
    for(std::size_t offset=0;offset+frameSize<=reduced.size()&&!cancel.load();offset+=hopSize){auto frame=fundamental(reduced.data()+offset,(offset+frameSize*.5)/analysisRate);if(frame.confidence>=.8){++voiced;frequencies.push_back(440*std::pow(2,(frame.midi-69)/12));if(monophonic){const int note=static_cast<int>(std::llround(frame.midi));result.chroma[(note%12+12)%12]+=frame.confidence*std::sqrt(frame.rms);}}result.frames.push_back(frame);++total;
        if(!monophonic&&offset% (hopSize*4)==0&&offset+4096<=reduced.size())addSpectralChroma(reduced.data()+offset,result.chroma);
        progress.store(.1f+.9f*static_cast<float>(offset+frameSize)/reduced.size());}
    result.voicedFraction=total?static_cast<double>(voiced)/total:0;if(!frequencies.empty()){std::nth_element(frequencies.begin(),frequencies.begin()+frequencies.size()/2,frequencies.end());result.medianHz=frequencies[frequencies.size()/2];}estimateKey(result);if(!cancel.load())progress.store(1);return result;
}
AudioChannels repairLightClipping(const AudioChannels& source,double rate){
    auto result=source;const std::size_t maximumRun=static_cast<std::size_t>(rate*.004);
    for(auto& channel:result){for(std::size_t i=0;i<channel.size();){if(std::abs(channel[i])<.999f){++i;continue;}const auto begin=i;while(i<channel.size()&&std::abs(channel[i])>=.999f)++i;const auto end=i;if(begin<4||end+4>=channel.size()||end-begin>maximumRun||channel[begin-1]*channel[end]<=0)continue;
        const double a=channel[begin-1],b=channel[end],length=static_cast<double>(end-begin+1);const double leftSlope=(a-channel[begin-4])/3,rightSlope=(channel[end+3]-b)/3;
        for(std::size_t k=begin;k<end;++k){const double t=(k-begin+1)/length,t2=t*t,t3=t2*t;const double value=(2*t3-3*t2+1)*a+(t3-2*t2+t)*length*leftSlope+(-2*t3+3*t2)*b+(t3-t2)*length*rightSlope;channel[k]=static_cast<float>(std::clamp(value,-4.0,4.0));}
    }}return result;
}
AudioChannels processPitch(const AudioChannels& source,double rate,const PitchOptions& options,const PitchAnalysis* analysis,std::atomic<bool>& cancel,std::atomic<float>& progress){
    const auto repaired=options.repairLightClip?repairLightClipping(source,rate):AudioChannels{};const auto& input=options.repairLightClip?repaired:source;
    if(input.empty()||input.size()>2||input[0].empty())throw std::runtime_error("Invalid pitch input");
    const auto length=input[0].size();for(const auto& c:input)if(c.size()!=length)throw std::runtime_error("Unequal pitch channel lengths");if(options.correction<=0&&options.semitones==0&&options.cents==0){progress.store(1);return input;}
    signalsmith::stretch::SignalsmithStretch<float> stretch(0x7159);stretch.presetDefault(static_cast<int>(input.size()),static_cast<float>(rate));stretch.setFormantFactor(1,options.preserveFormants);const double formantHz=analysis&&analysis->medianHz>0?std::clamp(analysis->medianHz,55.0,700.0):180;stretch.setFormantBase(static_cast<float>(formantHz/rate));const int latency=stretch.inputLatency()+stretch.outputLatency();constexpr int block=256;AudioChannels output(input.size(),std::vector<float>(length));std::array<std::array<float,block>,2> in{},out{};std::array<const float*,2> inputs{in[0].data(),in[1].data()};std::array<float*,2> outputs{out[0].data(),out[1].data()};float correction=0;std::size_t frameIndex=0;
    for(std::size_t position=0;position<length+latency&&!cancel.load();position+=block){const int count=static_cast<int>(std::min<std::size_t>(block,length+latency-position));for(std::size_t c=0;c<input.size();++c)for(int i=0;i<count;++i)in[c][i]=position+i<length?input[c][position+i]:0;
        float target=0;const double processingTime=(static_cast<double>(position)-stretch.inputLatency()+count*.5)/rate;
        if(options.correction>0&&analysis&&!analysis->frames.empty()){const auto& frames=analysis->frames;while(frameIndex+1<frames.size()&&frames[frameIndex+1].seconds<=processingTime)++frameIndex;const auto& frame=frames[frameIndex];if(frame.confidence>=.8&&frame.rms>.002&&processingTime>=0){const double shiftedMidi=frame.midi+options.semitones;const double delta=nearestScaleNote(shiftedMidi,options.tonic,options.minor)-shiftedMidi;if(std::abs(delta)*100>options.toleranceCents)target=static_cast<float>(std::clamp(delta,-2.0,2.0))*std::clamp(options.correction,0.0f,1.0f);}}
        const float smooth=static_cast<float>(1-std::exp(-count/(rate*std::max(.005f,options.retuneMs*.001f))));correction+=(target-correction)*smooth;stretch.setTransposeSemitones(std::clamp(options.semitones+options.cents*.01f+correction,-24.0f,24.0f));stretch.process(inputs,count,outputs,count);
        for(int i=0;i<count;++i){const auto index=static_cast<long long>(position)+i-latency;if(index>=0&&static_cast<std::size_t>(index)<length)for(std::size_t c=0;c<input.size();++c)output[c][static_cast<std::size_t>(index)]=std::isfinite(out[c][i])?out[c][i]:0;}progress.store(static_cast<float>(position+count)/(length+latency));}
    if(cancel.load())return {};
    return output;
}
}
