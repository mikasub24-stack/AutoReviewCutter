#include "Engine.h"
#include <algorithm>
#include <cmath>

namespace {
// Recover our mono PCM24 recording using bytes on disk, even if a crash left
// the RIFF/data lengths stale. Never modify the interrupted source file.
juce::Result recoverRecording(const juce::File& source,juce::File& recovered){
    auto input=source.createInputStream();
    if(!input||input->readInt()!=0x46464952)return juce::Result::fail(juce::String::fromUTF8("Không đọc được RIFF của bản thu gián đoạn."));
    input->readInt();if(input->readInt()!=0x45564157)return juce::Result::fail(juce::String::fromUTF8("Bản thu gián đoạn không phải WAV."));
    int format=0,channels=0,bits=0,rate=0;juce::int64 dataStart=-1;
    while(input->getPosition()+8<=input->getTotalLength()){
        const int id=input->readInt();const auto size=static_cast<juce::uint32>(input->readInt());const auto start=input->getPosition();
        if(id==0x20746d66&&size>=16){format=input->readShort();channels=input->readShort();rate=input->readInt();input->readInt();input->readShort();bits=input->readShort();}
        if(id==0x61746164){dataStart=start;break;}
        if(start+size+(size&1)>input->getTotalLength()||!input->setPosition(start+size+(size&1)))break;
    }
    if(dataStart<0||format!=1||channels!=1||bits!=24||rate<8000||rate>192000)return juce::Result::fail(juce::String::fromUTF8("Không khôi phục được định dạng bản thu; file gốc vẫn được giữ."));
    auto remaining=(input->getTotalLength()-dataStart)/3;
    if(remaining<=0)return juce::Result::fail(juce::String::fromUTF8("Bản thu gián đoạn chưa có mẫu âm thanh."));
    recovered=source.getSiblingFile(source.getFileNameWithoutExtension()+".recovered.wav").getNonexistentSibling();
    auto stream=recovered.createOutputStream();if(!stream)return juce::Result::fail(juce::String::fromUTF8("Không tạo được file khôi phục."));
    juce::WavAudioFormat wav;std::unique_ptr<juce::AudioFormatWriter> output(wav.createWriterFor(stream.get(),rate,1,24,{},0));
    if(!output)return juce::Result::fail(juce::String::fromUTF8("Không tạo được WAV khôi phục."));stream.release();
    std::array<unsigned char,4096*3> bytes{};juce::AudioBuffer<float> buffer(1,4096);
    while(remaining>0){const int n=static_cast<int>(juce::jmin<juce::int64>(remaining,4096));if(input->read(bytes.data(),n*3)!=n*3)return juce::Result::fail(juce::String::fromUTF8("Không đọc đủ dữ liệu khôi phục."));
        for(int i=0;i<n;++i){const int b=i*3;int value=bytes[b]|(bytes[b+1]<<8)|(bytes[b+2]<<16);if(value&0x800000)value-=0x1000000;buffer.setSample(0,i,static_cast<float>(value)/8388608.0f);}
        if(!output->writeFromAudioSampleBuffer(buffer,0,n))return juce::Result::fail(juce::String::fromUTF8("Ổ đĩa không ghi được bản khôi phục."));remaining-=n;
    }
    return juce::Result::ok();
}
}

StudioEngine::StudioEngine(){formats.registerBasicFormats();pluginFormats.addDefaultFormats();diskThread.startThread();prepare(48000,256);}
StudioEngine::~StudioEngine(){activeWriter.store(nullptr);if(callbackAttached)devices.removeAudioCallback(this);writer.reset();diskThread.stopThread(5000);devices.closeAudioDevice();}
juce::String StudioEngine::openDevice(const juce::String& saved){auto xml=juce::parseXML(saved);auto error=devices.initialise(2,2,xml.get(),true);lastDeviceError=error;if(error.isEmpty()){devices.addAudioCallback(this);callbackAttached=true;}return error;}
void StudioEngine::prepareForTest(double sr,int block){testMode=true;withAudioStopped([&]{prepare(sr,block);});}
void StudioEngine::withAudioStopped(const std::function<void()>& edit){const bool attached=callbackAttached;suspending.store(true);if(attached){devices.removeAudioCallback(this);callbackAttached=false;}edit();if(attached){devices.addAudioCallback(this);callbackAttached=true;}suspending.store(false);}
void StudioEngine::prepare(double sr,int block){
    sampleRate.store(sr>0?sr:48000);currentBlock.store(juce::jlimit(16,8192,block));const auto n=currentBlock.load();
    vocalBus.setSize(2,n);musicBus.setSize(2,n);monoInput.setSize(1,n);playbackFx.prepare(rate());monitorFx.prepare(rate());limiter.prepare(rate());
    for(auto& d:musicDelay)d.prepare(rate(),2.1);smoothing=static_cast<float>(1-std::exp(-1/(rate()*.020)));currentMaster=vocal::dbToGain(masterDb.load());
    if(plugin){plugin->setPlayConfigDetails(2,2,rate(),n);plugin->prepareToPlay(rate(),n);pluginLatency.store(juce::jlimit(0,static_cast<int>(rate()*2),plugin->getLatencySamples()));}
    resetProcessing();
}
void StudioEngine::resetProcessing(){currentMaster=vocal::dbToGain(masterDb.load());playbackFx.reset();monitorFx.reset();limiter.reset();for(auto& d:musicDelay)d.reset();if(plugin)plugin->reset();for(auto& t:tracks){const float p=juce::jlimit(-1.0f,1.0f,t->pan.load());const float g=vocal::dbToGain(t->gainDb.load())*(t->audio.getNumChannels()>1?1.41421356f:1.0f);t->leftGain=g*std::cos((p+1)*static_cast<float>(vocal::pi)*.25f);t->rightGain=g*std::sin((p+1)*static_cast<float>(vocal::pi)*.25f);}}
void StudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device){if(!device)return;if(recording.load()&&!suspending.load()){recordingFault.store(2);activeWriter.store(nullptr);recording.store(false);}driverInputLatency.store(device->getInputLatencyInSamples());driverOutputLatency.store(device->getOutputLatencyInSamples());prepare(device->getCurrentSampleRate(),device->getCurrentBufferSizeSamples());}
void StudioEngine::audioDeviceStopped(){if(recording.load()&&!suspending.load()){recordingFault.store(2);activeWriter.store(nullptr);recording.store(false);}inputPresent.store(false);}
void StudioEngine::audioDeviceError(const juce::String& error){juce::ignoreUnused(error);recordingFault.store(2);}
vocal::VocalParameters StudioEngine::parameters() const noexcept {vocal::VocalParameters p;p.bypass=fxBypass.load();p.inputDb=inputDb.load();p.highPassHz=highPass.load();p.warmthDb=warmth.load();p.presenceDb=presence.load();p.thresholdDb=threshold.load();p.ratio=ratio.load();p.makeupDb=makeup.load();p.deEss=deEss.load();p.reverb=reverb.load();p.delay=delay.load();p.delayMs=delayMs.load();p.decaySeconds=decaySeconds.load();p.preDelayMs=preDelayMs.load();p.damping=damping.load();p.width=width.load();p.delayFeedback=delayFeedback.load();p.deharsh=deharsh.load();return p;}
void StudioEngine::selectPreset(int i){const auto p=vocal::preset(i);inputDb=p.inputDb;highPass=p.highPassHz;warmth=p.warmthDb;presence=p.presenceDb;threshold=p.thresholdDb;ratio=p.ratio;makeup=p.makeupDb;deEss=p.deEss;reverb=p.reverb;delay=p.delay;delayMs=p.delayMs;decaySeconds=p.decaySeconds;preDelayMs=p.preDelayMs;damping=p.damping;width=p.width;delayFeedback=p.delayFeedback;deharsh=p.deharsh;}
void StudioEngine::audioDeviceIOCallbackWithContext(const float* const* inputs,int numInputs,float* const* outputs,int numOutputs,int count,const juce::AudioIODeviceCallbackContext&){
    juce::ScopedNoDenormals noDenormals;
    for(int c=0;c<numOutputs;++c)if(outputs[c])juce::FloatVectorOperations::clear(outputs[c],count);
    const int selected=inputChannel.load();const float* input=selected>=0&&selected<numInputs?inputs[selected]:nullptr;inputPresent.store(input!=nullptr);
    float peak=0;double sum=0;
    for(int i=0;i<count;++i){const float x=input&&std::isfinite(input[i])?input[i]:0;peak=juce::jmax(peak,std::abs(x));sum+=x*x;}
    inputPeak.store(peak);inputRms.store(count?static_cast<float>(std::sqrt(sum/count)):0);if(peak>=.999f)inputClipped.store(true);
    const auto p=parameters();playbackFx.setParameters(p);monitorFx.setParameters(p);
    const int maxBlock=currentBlock.load();
    for(int offset=0;offset<count;offset+=maxBlock){const int n=juce::jmin(maxBlock,count-offset);float* out[2]={numOutputs>0&&outputs[0]?outputs[0]+offset:nullptr,numOutputs>1&&outputs[1]?outputs[1]+offset:nullptr};
        processChunk(input?input+offset:nullptr,out,juce::jmin(2,numOutputs),n,true,true);}
}
void StudioEngine::processChunk(const float* input,float* const* output,int channels,int count,bool recordInput,bool liveMonitor){
    vocalBus.clear(0,count);musicBus.clear(0,count);const bool rolling=playing.load();const auto startFrame=positionFrames.load();const double sr=rate();
    if(recordInput){if(auto* w=activeWriter.load()){auto* raw=monoInput.getWritePointer(0);for(int i=0;i<count;++i)raw[i]=input?input[i]:0;const float* data[]={raw};if(w->write(data,count))capturedFrames.fetch_add(count);else{recordingFault.store(1);activeWriter.store(nullptr);recording.store(false);playing.store(false);}}}
    bool anySolo=false;for(const auto& t:tracks)if(t->solo.load())anySolo=true;
    if(rolling){for(auto& item:tracks){auto& t=*item;if(t.mute.load()||(anySolo&&!t.solo.load()))continue;auto& bus=t.vocal?vocalBus:musicBus;const float pan=juce::jlimit(-1.0f,1.0f,t.pan.load());const float g=vocal::dbToGain(t.gainDb.load())*(t.audio.getNumChannels()>1?1.41421356f:1.0f);const float gl=g*std::cos((pan+1)*static_cast<float>(vocal::pi)*.25f),gr=g*std::sin((pan+1)*static_cast<float>(vocal::pi)*.25f);
        for(int i=0;i<count;++i){t.leftGain+=(gl-t.leftGain)*smoothing;t.rightGain+=(gr-t.rightGain)*smoothing;const double seconds=static_cast<double>(startFrame+i)/sr-t.start;if(seconds<0||seconds>=t.duration())continue;const double position=(seconds+t.trimIn)*t.sourceRate;const auto frame=static_cast<juce::int64>(position);if(frame<0||frame>=t.audio.getNumSamples())continue;const int a=static_cast<int>(frame),b=juce::jmin(a+1,t.audio.getNumSamples()-1);const float blend=static_cast<float>(position-frame);const int right=t.audio.getNumChannels()>1?1:0;const float l=t.audio.getSample(0,a)+(t.audio.getSample(0,b)-t.audio.getSample(0,a))*blend;const float r=t.audio.getSample(right,a)+(t.audio.getSample(right,b)-t.audio.getSample(right,a))*blend;bus.addSample(0,i,l*t.leftGain);bus.addSample(1,i,r*t.rightGain);}}
    }
    for(int i=0;i<count;++i){float l=vocalBus.getSample(0,i),r=vocalBus.getSample(1,i);playbackFx.process(l,r);if(liveMonitor&&monitor.load()&&input){float a=input[i]*.70710678f,b=a;monitorFx.process(a,b);l+=a;r+=b;}vocalBus.setSample(0,i,l);vocalBus.setSample(1,i,r);}
    if(plugin){midi.clear();auto view=juce::AudioBuffer<float>(vocalBus.getArrayOfWritePointers(),2,count);plugin->processBlock(view,midi);}
    float maximum=0;const float targetMaster=vocal::dbToGain(masterDb.load());const auto latency=static_cast<std::size_t>(pluginLatency.load());
    for(int i=0;i<count;++i){float ml=musicBus.getSample(0,i),mr=musicBus.getSample(1,i);if(latency>0){const float l=musicDelay[0].tap(latency),r=musicDelay[1].tap(latency);musicDelay[0].push(ml);musicDelay[1].push(mr);ml=l;mr=r;}currentMaster+=(targetMaster-currentMaster)*smoothing;float l=(ml+vocalBus.getSample(0,i))*currentMaster,r=(mr+vocalBus.getSample(1,i))*currentMaster;limiter.process(l,r);maximum=juce::jmax(maximum,std::abs(l),std::abs(r));if(channels>0&&output[0])output[0][i]=l;if(channels>1&&output[1])output[1][i]=r;}
    outputPeak.store(maximum);gainReduction.store(juce::jmax(playbackFx.gainReductionDb(),monitorFx.gainReductionDb()));
    if(rolling){positionFrames.store(startFrame+count);if(!recording.load()&&!offline&&position()>duration()+3.0){playing.store(false);}}
}
juce::Result StudioEngine::readTrack(const juce::File& file,bool isVocal,std::unique_ptr<StudioTrack>& result){
    std::unique_ptr<juce::AudioFormatReader> reader(formats.createReaderFor(file));if(!reader)return juce::Result::fail(juce::String::fromUTF8("Không đọc được file âm thanh: ")+file.getFileName());
    if(reader->lengthInSamples<1||reader->lengthInSamples>90000000||reader->numChannels<1||reader->numChannels>2||reader->lengthInSamples*reader->numChannels*4>512LL*1024*1024||!std::isfinite(reader->sampleRate)||reader->sampleRate<8000||reader->sampleRate>192000)return juce::Result::fail(juce::String::fromUTF8("Chỉ hỗ trợ mono/stereo 8–192 kHz, dưới 90 triệu mẫu và 512 MB audio giải mã."));
    auto t=std::make_unique<StudioTrack>();t->file=file;t->name=file.getFileNameWithoutExtension();t->sourceRate=reader->sampleRate;t->vocal=isVocal;t->audio.setSize(static_cast<int>(reader->numChannels),static_cast<int>(reader->lengthInSamples));
    if(!reader->read(&t->audio,0,t->audio.getNumSamples(),0,true,true))return juce::Result::fail(juce::String::fromUTF8("File âm thanh bị lỗi hoặc đọc chưa đầy đủ."));
    if(std::abs(t->sourceRate-rate())>.01){
        const auto targetFrames=static_cast<juce::int64>(std::llround(t->audio.getNumSamples()*rate()/t->sourceRate));
        if(targetFrames<1||targetFrames>90000000||targetFrames*t->audio.getNumChannels()*4>512LL*1024*1024)return juce::Result::fail(juce::String::fromUTF8("File sau đổi sample rate quá lớn."));
        juce::AudioBuffer<float> converted(t->audio.getNumChannels(),static_cast<int>(targetFrames));
        for(int c=0;c<t->audio.getNumChannels();++c){auto samples=vocal::resampleBandlimited(t->audio.getReadPointer(c),static_cast<std::size_t>(t->audio.getNumSamples()),t->sourceRate,rate());converted.copyFrom(c,0,samples.data(),static_cast<int>(samples.size()));}
        t->audio=std::move(converted);t->sourceRate=rate();
    }
    t->trimOut=t->audio.getNumSamples()/t->sourceRate;const int bins=juce::jlimit(1,24000,(t->audio.getNumSamples()+255)/256);t->peaks.resize(static_cast<std::size_t>(bins));
    for(int b=0;b<bins;++b){const int first=static_cast<int>(static_cast<juce::int64>(b)*t->audio.getNumSamples()/bins),last=static_cast<int>(static_cast<juce::int64>(b+1)*t->audio.getNumSamples()/bins);float peak=0;for(int c=0;c<t->audio.getNumChannels();++c)peak=juce::jmax(peak,t->audio.getMagnitude(c,first,last-first));t->peaks[static_cast<std::size_t>(b)]=peak;}
    t->originalFile=file;t->originalTrimOut=t->trimOut;result=std::move(t);return juce::Result::ok();
}
void StudioEngine::addTrack(std::unique_ptr<StudioTrack> t){withAudioStopped([&]{tracks.push_back(std::move(t));resetProcessing();});}
void StudioEngine::removeTrack(int index){if(isRecording())return;withAudioStopped([&]{if(juce::isPositiveAndBelow(index,static_cast<int>(tracks.size())))tracks.erase(tracks.begin()+index);});}
double StudioEngine::duration() const noexcept {double end=0;for(const auto& t:tracks)end=juce::jmax(end,t->start+t->duration());return end;}
juce::Result StudioEngine::play(){if(isRecording())return juce::Result::ok();auto ready=ensureSampleRate();if(ready.failed())return ready;if(position()>=duration()+3)positionFrames.store(0);withAudioStopped([&]{resetProcessing();});playing.store(true);return juce::Result::ok();}
void StudioEngine::stop(){playing.store(false);}
void StudioEngine::seek(double seconds){if(isRecording())return;playing.store(false);withAudioStopped([&]{positionFrames.store(static_cast<juce::int64>(juce::jmax(0.0,seconds)*rate()));resetProcessing();});}
juce::Result StudioEngine::startRecording(const juce::File& dir){
    if(isRecording()||hasUnfinishedTake())return juce::Result::fail(juce::String::fromUTF8("Hoàn tất bản thu hiện tại trước khi thu tiếp."));if(tracks.size()>=24)return juce::Result::fail(juce::String::fromUTF8("Phiên bản này hỗ trợ tối đa 24 track. Bỏ một track trước khi thu tiếp."));auto ready=ensureSampleRate();if(ready.failed())return ready;if(!testMode&&(!devices.getCurrentAudioDevice()||!inputPresent.load()))return juce::Result::fail(juce::String::fromUTF8("Chưa có ngõ vào micro. Chọn cổng input trong cài đặt âm thanh."));
    if(dir.createDirectory().failed())return juce::Result::fail(juce::String::fromUTF8("Không tạo được thư mục bản thu."));
    recordFile=dir.getNonexistentChildFile("Take_"+juce::Time::getCurrentTime().formatted("%Y%m%d_%H%M%S"),".recording.wav",false);
    auto stream=recordFile.createOutputStream();if(!stream)return juce::Result::fail(juce::String::fromUTF8("Không ghi được vào ổ đĩa."));
    juce::WavAudioFormat wav;auto* raw=wav.createWriterFor(stream.get(),rate(),1,24,{},0);if(!raw)return juce::Result::fail(juce::String::fromUTF8("Không tạo được WAV 24-bit."));stream.release();
    withAudioStopped([&]{writer=std::make_unique<juce::AudioFormatWriter::ThreadedWriter>(raw,diskThread,262144);writer->setFlushInterval(16384);recordingFault.store(0);inputClipped.store(false);capturedFrames.store(0);recordStart=position();if(latencyCompensation.load())recordStart-=(driverInputLatency.load()+driverOutputLatency.load()+pluginLatency.load()+static_cast<int>(limiter.latency()))/rate();recordStart+=manualOffsetMs.load()/1000.0;resetProcessing();activeWriter.store(writer.get());recording.store(true);playing.store(true);});
    return juce::Result::ok();
}
juce::Result StudioEngine::finishRecording(juce::File& completed,double& startSeconds){
    playing.store(false);activeWriter.store(nullptr);recording.store(false);withAudioStopped([&]{writer.reset();});startSeconds=recordStart;
    if(!recordFile.existsAsFile())return juce::Result::fail(juce::String::fromUTF8("Không có bản thu cần lưu."));
    std::unique_ptr<juce::AudioFormatReader> verify(formats.createReaderFor(recordFile));
    if(!verify||verify->lengthInSamples!=capturedFrames.load()||recordFile.getSize()<capturedFrames.load()*3+44)recordingFault.store(3);
    verify.reset();
    const auto target=recordFile.getSiblingFile(recordFile.getFileName().replace(".recording.wav",recordingFault.load()?".partial.wav":".wav"));
    if(!recordFile.moveFileTo(target))return juce::Result::fail(juce::String::fromUTF8("Đã có dữ liệu nhưng không đổi tên được bản thu: ")+recordFile.getFullPathName());
    completed=target;recordFile={};if(recordingFault.load())return juce::Result::fail(juce::String::fromUTF8("Thu bị gián đoạn. Đã giữ bản thu một phần tại ")+target.getFullPathName());return juce::Result::ok();
}
juce::Result StudioEngine::installPlugin(std::unique_ptr<juce::AudioPluginInstance> next){if(isRecording()||isPlaying())return juce::Result::fail(juce::String::fromUTF8("Dừng phát/thu trước khi đổi plugin."));if(!next)return juce::Result::fail(juce::String::fromUTF8("Plugin không hợp lệ."));next->disableNonMainBuses();auto layout=next->getBusesLayout();if(layout.inputBuses.isEmpty()||layout.outputBuses.isEmpty())return juce::Result::fail(juce::String::fromUTF8("Cần VST3 audio effect có input/output."));layout.inputBuses.set(0,juce::AudioChannelSet::stereo());layout.outputBuses.set(0,juce::AudioChannelSet::stereo());if(!next->setBusesLayout(layout))return juce::Result::fail(juce::String::fromUTF8("Plugin cần hỗ trợ stereo input/output."));withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin=std::move(next);prepare(rate(),blockSize());});return juce::Result::ok();}
void StudioEngine::removePlugin(){if(isRecording()||isPlaying())return;withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin.reset();pluginLatency.store(0);resetProcessing();});}
juce::StringArray StudioEngine::inputNames() const {juce::StringArray names;if(auto* d=devices.getCurrentAudioDevice()){const auto active=d->getActiveInputChannels();const auto all=d->getInputChannelNames();for(int i=0;i<all.size();++i)if(active[i])names.add(all[i]);}return names;}
double StudioEngine::latencyMs() const noexcept{return 1000*(driverInputLatency.load()+driverOutputLatency.load()+pluginLatency.load()+static_cast<int>(limiter.latency()))/rate();}
juce::String StudioEngine::deviceSummary() const {auto* d=devices.getCurrentAudioDevice();if(!d)return juce::String::fromUTF8("Chưa chọn sound card");return d->getTypeName()+juce::String::fromUTF8(" · ")+juce::String(rate()/1000,1)+juce::String::fromUTF8(" kHz · ")+juce::String(blockSize())+juce::String::fromUTF8(" samples · ")+juce::String(latencyMs(),1)+" ms";}

juce::Result StudioEngine::ensureSampleRate(){
    for(auto& track:tracks){if(std::abs(track->sourceRate-rate())<.01)continue;
        std::unique_ptr<StudioTrack> replacement;auto result=readTrack(track->file,track->vocal,replacement);if(result.failed())return result;
        replacement->originalFile=track->originalFile;replacement->originalTrimIn=track->originalTrimIn;replacement->originalTrimOut=track->originalTrimOut;replacement->name=track->name;replacement->start=track->start;replacement->trimIn=track->trimIn;replacement->trimOut=track->trimOut;
        replacement->gainDb.store(track->gainDb.load());replacement->pan.store(track->pan.load());replacement->mute.store(track->mute.load());replacement->solo.store(track->solo.load());
        withAudioStopped([&]{track=std::move(replacement);});
    }return juce::Result::ok();
}

juce::var StudioEngine::projectState() const {
    auto* state=new juce::DynamicObject();state->setProperty("schema",1);state->setProperty("sampleRate",rate());state->setProperty("masterDb",masterDb.load());
    auto* fx=new juce::DynamicObject();const auto p=parameters();fx->setProperty("bypass",p.bypass);fx->setProperty("inputDb",p.inputDb);fx->setProperty("highPass",p.highPassHz);fx->setProperty("warmth",p.warmthDb);fx->setProperty("presence",p.presenceDb);fx->setProperty("threshold",p.thresholdDb);fx->setProperty("ratio",p.ratio);fx->setProperty("makeup",p.makeupDb);fx->setProperty("deEss",p.deEss);fx->setProperty("reverb",p.reverb);fx->setProperty("delay",p.delay);fx->setProperty("delayMs",p.delayMs);fx->setProperty("decaySeconds",p.decaySeconds);fx->setProperty("preDelayMs",p.preDelayMs);fx->setProperty("damping",p.damping);fx->setProperty("width",p.width);fx->setProperty("delayFeedback",p.delayFeedback);fx->setProperty("deharsh",p.deharsh);state->setProperty("fx",juce::var(fx));
    juce::Array<juce::var> rows;
    for(const auto& t:tracks){auto* row=new juce::DynamicObject();row->setProperty("file",t->file.getRelativePathFrom(sessionDirectory));row->setProperty("originalFile",t->originalFile.getRelativePathFrom(sessionDirectory));row->setProperty("originalTrimIn",t->originalTrimIn);row->setProperty("originalTrimOut",t->originalTrimOut);row->setProperty("name",t->name);row->setProperty("vocal",t->vocal);row->setProperty("start",t->start);row->setProperty("trimIn",t->trimIn);row->setProperty("trimOut",t->trimOut);row->setProperty("gainDb",t->gainDb.load());row->setProperty("pan",t->pan.load());row->setProperty("mute",t->mute.load());row->setProperty("solo",t->solo.load());rows.add(juce::var(row));}
    state->setProperty("tracks",rows);
    if(plugin){juce::PluginDescription description;plugin->fillInPluginDescription(description);auto* slot=new juce::DynamicObject();slot->setProperty("description",description.createXml()->toString());juce::MemoryBlock bytes;plugin->getStateInformation(bytes);slot->setProperty("state",bytes.toBase64Encoding());state->setProperty("plugin",juce::var(slot));}
    if(activeWriter.load()) {state->setProperty("recoveringTake",recordFile.getFullPathName());state->setProperty("recoveringStart",recordStart);}
    return juce::var(state);
}
juce::Result StudioEngine::saveProject(const juce::File& file){if(file.getParentDirectory().createDirectory().failed())return juce::Result::fail(juce::String::fromUTF8("Không tạo được thư mục dự án."));juce::TemporaryFile temp(file);if(!temp.getFile().replaceWithText(juce::JSON::toString(projectState(),true)))return juce::Result::fail(juce::String::fromUTF8("Không ghi được dự án tạm."));if(!temp.overwriteTargetFileWithTemporary())return juce::Result::fail(juce::String::fromUTF8("Không cập nhật được dự án. Dữ liệu cũ được giữ nguyên."));return juce::Result::ok();}
juce::Result StudioEngine::loadProject(const juce::File& file){
    if(isRecording())return juce::Result::fail(juce::String::fromUTF8("Dừng thu trước khi mở dự án."));playing.store(false);const auto state=juce::JSON::parse(file);if(!state.isObject()||static_cast<int>(state["schema"])!=1||!state["tracks"].isArray())return juce::Result::fail(juce::String::fromUTF8("Định dạng dự án không hợp lệ."));
    std::vector<std::unique_ptr<StudioTrack>> loaded;
    for(const auto& row:*state["tracks"].getArray()){if(loaded.size()>=24)return juce::Result::fail(juce::String::fromUTF8("Giới hạn 24 track trong phiên bản này."));std::unique_ptr<StudioTrack> t;auto path=file.getParentDirectory().getChildFile(row["file"].toString());auto result=readTrack(path,static_cast<bool>(row["vocal"]),t);if(result.failed())return result;
        if(row.hasProperty("originalFile")){t->originalFile=file.getParentDirectory().getChildFile(row["originalFile"].toString());t->originalTrimIn=static_cast<double>(row["originalTrimIn"]);t->originalTrimOut=static_cast<double>(row["originalTrimOut"]);}
        t->name=row["name"].toString();t->start=static_cast<double>(row["start"]);t->trimIn=juce::jlimit(0.0,t->trimOut,static_cast<double>(row["trimIn"]));t->trimOut=juce::jlimit(t->trimIn,t->trimOut,static_cast<double>(row["trimOut"]));t->gainDb.store(juce::jlimit(-60.0f,18.0f,static_cast<float>(row["gainDb"])));t->pan.store(juce::jlimit(-1.0f,1.0f,static_cast<float>(row["pan"])));t->mute.store(static_cast<bool>(row["mute"]));t->solo.store(static_cast<bool>(row["solo"]));if(!std::isfinite(t->start)||std::abs(t->start)>86400)return juce::Result::fail(juce::String::fromUTF8("Vị trí clip không hợp lệ."));loaded.push_back(std::move(t));
    }
    const juce::File interrupted(state["recoveringTake"].toString());
    juce::File pending=interrupted;
    if(!pending.existsAsFile()&&state.hasProperty("recoveringTake")){
        pending=interrupted.getSiblingFile(interrupted.getFileName().replace(".recording.wav",".wav"));
        if(!pending.existsAsFile())pending=interrupted.getSiblingFile(interrupted.getFileName().replace(".recording.wav",".partial.wav"));
    }
    if(pending.existsAsFile()){
        if(loaded.size()>=24)return juce::Result::fail(juce::String::fromUTF8("Cần bỏ một track trước khi khôi phục bản thu tại ")+pending.getFullPathName());
        juce::File recovered=pending;auto recovery=juce::Result::ok();
        if(pending==interrupted){recovery=recoverRecording(interrupted,recovered);if(recovery.failed())return recovery;}
        std::unique_ptr<StudioTrack> take;recovery=readTrack(recovered,true,take);if(recovery.failed())return recovery;
        const double start=static_cast<double>(state["recoveringStart"]);if(!std::isfinite(start)||std::abs(start)>86400)return juce::Result::fail(juce::String::fromUTF8("Vị trí bản thu khôi phục không hợp lệ."));
        take->start=start;take->name=juce::String::fromUTF8("RECOVERED · ")+recovered.getFileNameWithoutExtension();loaded.push_back(std::move(take));
    }
    std::unique_ptr<juce::AudioPluginInstance> next;
    juce::MemoryBlock pluginState;
    if(state["plugin"].isObject()){juce::PluginDescription desc;auto xml=juce::parseXML(state["plugin"]["description"].toString());if(!xml||!desc.loadFromXml(*xml))return juce::Result::fail(juce::String::fromUTF8("Thông tin VST3 không hợp lệ."));juce::String error;next=pluginFormats.createPluginInstance(desc,rate(),blockSize(),error);if(!next)return juce::Result::fail(juce::String::fromUTF8("Không khôi phục được VST3: ")+error);next->disableNonMainBuses();auto layout=next->getBusesLayout();if(layout.inputBuses.isEmpty()||layout.outputBuses.isEmpty())return juce::Result::fail(juce::String::fromUTF8("VST3 không có bus âm thanh."));layout.inputBuses.set(0,juce::AudioChannelSet::stereo());layout.outputBuses.set(0,juce::AudioChannelSet::stereo());if(!next->setBusesLayout(layout))return juce::Result::fail(juce::String::fromUTF8("VST3 không hỗ trợ stereo."));pluginState.fromBase64Encoding(state["plugin"]["state"].toString());next->setStateInformation(pluginState.getData(),static_cast<int>(pluginState.getSize()));}
    withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin=std::move(next);tracks=std::move(loaded);sessionDirectory=file.getParentDirectory();positionFrames.store(0);const auto fx=state["fx"];auto value=[&](const char* key,float fallback){return fx.hasProperty(key)?static_cast<float>(fx[key]):fallback;};fxBypass.store(static_cast<bool>(fx["bypass"]));inputDb=value("inputDb",0);highPass=value("highPass",80);warmth=value("warmth",-2);presence=value("presence",2);threshold=value("threshold",-18);ratio=value("ratio",3);makeup=value("makeup",2);deEss=value("deEss",.35f);reverb=value("reverb",.1f);delay=value("delay",.04f);delayMs=value("delayMs",240);decaySeconds=value("decaySeconds",1.2f);preDelayMs=value("preDelayMs",20);damping=value("damping",.65f);width=value("width",1);delayFeedback=value("delayFeedback",.27f);deharsh=value("deharsh",0);masterDb=state.hasProperty("masterDb")?static_cast<float>(state["masterDb"]):-3;pluginLatency.store(0);prepare(rate(),blockSize());});return juce::Result::ok();
}
void StudioEngine::newProject(){if(isRecording())return;playing.store(false);withAudioStopped([&]{tracks.clear();if(plugin)plugin->releaseResources();plugin.reset();pluginLatency.store(0);positionFrames.store(0);selectPreset(0);masterDb=-3;resetProcessing();});}
juce::Result StudioEngine::exportMix(const juce::File& destination,std::atomic<bool>& cancel,std::atomic<float>& progress){
    if(isRecording()||isPlaying())return juce::Result::fail(juce::String::fromUTF8("Dừng phát và thu trước khi xuất."));if(tracks.empty())return juce::Result::fail(juce::String::fromUTF8("Chưa có track để xuất."));for(const auto& t:tracks)if(t->file==destination)return juce::Result::fail(juce::String::fromUTF8("Không xuất đè lên file âm thanh nguồn."));auto ready=ensureSampleRate();if(ready.failed())return ready;
    juce::Result result=juce::Result::ok();const auto oldPosition=positionFrames.load();
    withAudioStopped([&]{offline=true;resetProcessing();positionFrames.store(0);const auto tail=juce::jlimit(3.0,30.0,plugin?plugin->getTailLengthSeconds():3.0);const auto frames=static_cast<juce::int64>(std::ceil((duration()+tail)*rate()));const auto pipeline=static_cast<juce::int64>(pluginLatency.load()+static_cast<int>(limiter.latency()));
        juce::TemporaryFile temp(destination);auto stream=temp.getFile().createOutputStream();if(!stream){result=juce::Result::fail(juce::String::fromUTF8("Không mở được file xuất."));offline=false;return;}
        juce::WavAudioFormat wav;std::unique_ptr<juce::AudioFormatWriter> out(wav.createWriterFor(stream.get(),rate(),2,24,{},0));if(!out){result=juce::Result::fail(juce::String::fromUTF8("Không tạo được WAV xuất."));offline=false;return;}stream.release();juce::AudioBuffer<float> buffer(2,blockSize());auto p=parameters();playbackFx.setParameters(p);monitorFx.setParameters(p);playing.store(true);juce::int64 processed=0,written=0;juce::Random noise(0x4f7531);
        while(processed<frames+pipeline&&!cancel.load()){const int n=static_cast<int>(juce::jmin<juce::int64>(blockSize(),frames+pipeline-processed));buffer.clear();processChunk(nullptr,buffer.getArrayOfWritePointers(),2,n,false,false);const int skip=static_cast<int>(juce::jlimit<juce::int64>(0,n,pipeline-processed));const int valid=static_cast<int>(juce::jmin<juce::int64>(n-skip,frames-written));
            for(int c=0;c<2;++c)for(int i=skip;i<skip+valid;++i)buffer.addSample(c,i,(noise.nextFloat()-noise.nextFloat())/8388608.0f);
            if(valid>0&&!out->writeFromAudioSampleBuffer(buffer,skip,valid)){result=juce::Result::fail(juce::String::fromUTF8("Ổ đĩa không ghi được bản mix đầy đủ."));break;}written+=valid;processed+=n;progress.store(static_cast<float>(written)/static_cast<float>(frames));
        }
        out.reset();playing.store(false);if(cancel.load())result=juce::Result::fail(juce::String::fromUTF8("Đã hủy xuất; file đích cũ không thay đổi."));if(result.wasOk()&&!temp.overwriteTargetFileWithTemporary())result=juce::Result::fail(juce::String::fromUTF8("Không cập nhật được file đích."));offline=false;positionFrames.store(oldPosition);resetProcessing();
    });return result;
}
void StudioEngine::createDemo(){newProject();const auto folder=juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("VocalStudio-Demo");folder.createDirectory();sessionDirectory=folder;
    for(int type=0;type<2;++type){const int n=48000*12;juce::AudioBuffer<float> audio(type?1:2,n);for(int i=0;i<n;++i){const double t=i/48000.0;float x=0;if(type){const double breath=std::pow(juce::jmax(0.0,std::sin(t*1.6)),2.0);x=static_cast<float>(breath*(.12*std::sin(t*2*vocal::pi*220)+.04*std::sin(t*2*vocal::pi*440)));}else{const double beat=std::fmod(t,.5);x=static_cast<float>(.2*std::exp(-beat*24)*std::sin(2*vocal::pi*65*t)+.04*std::sin(2*vocal::pi*130.81*t)+.025*std::sin(2*vocal::pi*196*t));}for(int c=0;c<audio.getNumChannels();++c)audio.setSample(c,i,x);}
        const auto file=folder.getChildFile(type?"Demo_Vocal_Test.wav":"Demo_Beat_Test.wav");file.deleteFile();auto stream=file.createOutputStream();juce::WavAudioFormat wav;std::unique_ptr<juce::AudioFormatWriter> out(wav.createWriterFor(stream.get(),48000,audio.getNumChannels(),24,{},0));if(out){stream.release();out->writeFromAudioSampleBuffer(audio,0,n);out.reset();std::unique_ptr<StudioTrack> track;if(readTrack(file,type==1,track).wasOk())addTrack(std::move(track));}}
}
