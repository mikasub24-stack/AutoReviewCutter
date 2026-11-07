#include "Engine.h"
#include "Vst2Host.h"
#include <algorithm>
#include <cmath>

namespace {
juce::var capturePlugin(juce::AudioPluginInstance& plugin){
    auto* slot=new juce::DynamicObject;slot->setProperty("description",plugin.getPluginDescription().createXml()->toString());
    juce::MemoryBlock bytes;plugin.getStateInformation(bytes);slot->setProperty("state",bytes.toBase64Encoding());
    juce::Array<juce::var> values;
    for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i)){
        const float value=p->getValue();if(!std::isfinite(value)||value<0||value>1)continue;
        auto* item=new juce::DynamicObject;item->setProperty("id",p->getParameterID());item->setProperty("value",value);values.add(juce::var(item));
    }
    slot->setProperty("parameters",values);return juce::var(slot);
}
void applyPluginState(juce::AudioPluginInstance& plugin,const juce::var& slot){
    juce::MemoryBlock bytes;if(bytes.fromBase64Encoding(slot["state"].toString())&&bytes.getSize()>0)plugin.setStateInformation(bytes.getData(),static_cast<int>(bytes.getSize()));
    // Some plugins initialise their controller after prepareToPlay or omit UI
    // values from their opaque state. Restore the captured public IDs afterwards.
    juce::PluginDescription saved;auto xml=juce::parseXML(slot["description"].toString());
    if(!xml||!saved.loadFromXml(*xml)||saved.version!=plugin.getPluginDescription().version)return;
    const auto* values=slot["parameters"].getArray();if(!values)return;
    juce::HashMap<juce::String,float> savedValues;
    for(const auto& item:*values){const auto id=item["id"].toString();const float value=static_cast<float>(item["value"]);if(id.isNotEmpty()&&std::isfinite(value)&&value>=0&&value<=1)savedValues.set(id,value);}
    for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i))if(savedValues.contains(p->getParameterID())){
        const float value=savedValues[p->getParameterID()];p->beginChangeGesture();p->setValueNotifyingHost(value);p->endChangeGesture();
    }
}

void resetPluginPreservingParameters(juce::AudioPluginInstance& plugin){
    std::vector<std::pair<juce::AudioPluginInstance::HostedParameter*,float>> values;
    values.reserve(static_cast<size_t>(plugin.getParameters().size()));
    for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i)){const float value=p->getValue();if(std::isfinite(value)&&value>=0&&value<=1)values.emplace_back(p,value);}
    plugin.reset();
    // VST3 reset deactivates/reactivates the component, and some plugins reset
    // controls on activation. Hosted setValue updates the processor queue even
    // when its controller cache still displays the pre-reset value.
    for(const auto& value:values)value.first->setValue(value.second);
}

struct RenderScopeExit{std::function<void()> fn;~RenderScopeExit(){fn();}};
// Recover our mono PCM24 recording using bytes on disk, even if a crash left
// the RIFF/data lengths stale. Never modify the interrupted source file.
std::pair<int,int> configureVocalPlugin(juce::AudioPluginInstance& plugin){
    plugin.disableNonMainBuses();
    for(const auto& counts:std::array<std::pair<int,int>,4>{{{2,2},{1,2},{1,1},{2,1}}}){auto layout=plugin.getBusesLayout();if(layout.inputBuses.isEmpty()||layout.outputBuses.isEmpty())return {0,0};layout.inputBuses.set(0,counts.first==1?juce::AudioChannelSet::mono():juce::AudioChannelSet::stereo());layout.outputBuses.set(0,counts.second==1?juce::AudioChannelSet::mono():juce::AudioChannelSet::stereo());if(plugin.setBusesLayout(layout))return counts;}
    return {0,0};
}
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

StudioEngine::StudioEngine(){formats.registerBasicFormats();pluginFormats.addDefaultFormats();pluginFormats.addFormat(createVst2Format().release());diskThread.startThread();prepare(48000,256);}
StudioEngine::~StudioEngine(){activeWriter.store(nullptr);if(callbackAttached)devices.removeAudioCallback(this);writer.reset();diskThread.stopThread(5000);devices.closeAudioDevice();}
juce::String StudioEngine::openDevice(const juce::String& saved){auto xml=juce::parseXML(saved);auto error=devices.initialise(2,2,xml.get(),true);lastDeviceError=error;/* Keep the callback registered even if startup device selection fails.
    AudioDeviceManager will start it when the user selects a working device later. */if(!callbackAttached){devices.addAudioCallback(this);callbackAttached=true;}return error;}
void StudioEngine::prepareForTest(double sr,int block){testMode=true;withAudioStopped([&]{prepare(sr,block);});}
void StudioEngine::withAudioStopped(const std::function<void()>& edit,const std::function<void()>& finalise){
    const bool attached=callbackAttached;suspending=true;
    if(attached){devices.removeAudioCallback(this);callbackAttached=false;}
    try{
        edit();
        if(attached){devices.addAudioCallback(this);callbackAttached=true;}
        // addAudioCallback invokes prepare again. Apply saved controllers only
        // after that invocation, while IO is still gated by suspending.
        if(finalise)finalise();
    }catch(...){if(attached&&!callbackAttached){devices.addAudioCallback(this);callbackAttached=true;}suspending=false;throw;}
    suspending=false;
}
void StudioEngine::prepare(double sr,int block){
    sampleRate.store(sr>0?sr:48000);currentBlock.store(juce::jlimit(16,8192,block));const auto n=currentBlock.load();
    dryVocalSidechain.setSize(2,n);musicDucker.prepare(rate());reverbDry.setSize(2,n);for(auto& d:reverbDryDelay)d.prepare(rate(),2.1);vocalBus.setSize(2,n);musicBus.setSize(2,n);monoInput.setSize(1,n);playbackFx.prepare(rate());monitorFx.prepare(rate());vocalAmbience.prepare(rate());limiter.prepare(rate());
    for(auto& d:musicDelay)d.prepare(rate(),6.1);smoothing=static_cast<float>(1-std::exp(-1/(rate()*.020)));currentMonitor=vocal::dbToGain(juce::jlimit(-12.0f,18.0f,monitorDb.load()));currentMaster=vocal::dbToGain(masterDb.load());
    if(plugin){plugin->setPlayConfigDetails(pluginInputs.load(),pluginOutputs.load(),rate(),n);plugin->prepareToPlay(rate(),n);pluginLatency.store(juce::jlimit(0,static_cast<int>(rate()*2),plugin->getLatencySamples()));const double tail=plugin->getTailLengthSeconds();pluginTailSeconds.store(std::isfinite(tail)?juce::jlimit(0.0,30.0,tail):0);}
    if(reverbPlugin){reverbPlugin->setPlayConfigDetails(reverbInputs,reverbOutputs,rate(),n);reverbPlugin->prepareToPlay(rate(),n);reverbPluginLatency=juce::jlimit(0,static_cast<int>(rate()*2),reverbPlugin->getLatencySamples());const auto tail=reverbPlugin->getTailLengthSeconds();reverbPluginTail=std::isfinite(tail)?juce::jlimit(0.0,30.0,tail):0;}
    if(eqPlugin){eqPlugin->setPlayConfigDetails(eqInputs,eqOutputs,rate(),n);eqPlugin->prepareToPlay(rate(),n);eqPluginLatency=juce::jlimit(0,static_cast<int>(rate()*2),eqPlugin->getLatencySamples());const auto tail=eqPlugin->getTailLengthSeconds();eqPluginTail=std::isfinite(tail)?juce::jlimit(0.0,30.0,tail):0;}
    resetProcessing();
}
void StudioEngine::resetProcessing(){currentMonitor=vocal::dbToGain(juce::jlimit(-12.0f,18.0f,monitorDb.load()));currentMaster=vocal::dbToGain(masterDb.load());musicDucker.reset();musicDuckReduction=0;playbackFx.reset();monitorFx.reset();vocalAmbience.reset();limiter.reset();for(auto& d:musicDelay)d.reset();for(auto& d:reverbDryDelay)d.reset();currentReverbMix=juce::jlimit(0.f,1.f,reverbPluginMix.load());if(plugin)resetPluginPreservingParameters(*plugin);if(reverbPlugin)resetPluginPreservingParameters(*reverbPlugin);if(eqPlugin)resetPluginPreservingParameters(*eqPlugin);for(auto& t:tracks){const float p=juce::jlimit(-1.0f,1.0f,t->pan.load());const float g=vocal::dbToGain(t->gainDb.load())*(t->audio.getNumChannels()>1?1.41421356f:1.0f);t->leftGain=g*std::cos((p+1)*static_cast<float>(vocal::pi)*.25f);t->rightGain=g*std::sin((p+1)*static_cast<float>(vocal::pi)*.25f);}}
void StudioEngine::audioDeviceAboutToStart(juce::AudioIODevice* device){if(!device)return;if(recording.load()&&!suspending.load()){recordingFault.store(2);activeWriter.store(nullptr);recording.store(false);}driverInputLatency.store(device->getInputLatencyInSamples());driverOutputLatency.store(device->getOutputLatencyInSamples());prepare(device->getCurrentSampleRate(),device->getCurrentBufferSizeSamples());}
void StudioEngine::audioDeviceStopped(){if(recording.load()&&!suspending.load()){recordingFault.store(2);activeWriter.store(nullptr);recording.store(false);}inputPresent.store(false);}
void StudioEngine::audioDeviceError(const juce::String& error){juce::ignoreUnused(error);recordingFault.store(2);}
vocal::VocalParameters StudioEngine::parameters() const noexcept {vocal::VocalParameters p;p.shortReverb=shortReverb.load();p.shortDecaySeconds=shortDecaySeconds.load();p.bypass=fxBypass.load();p.inputDb=inputDb.load();p.highPassHz=highPass.load();p.warmthDb=warmth.load();p.presenceDb=presence.load();p.thresholdDb=threshold.load();p.ratio=ratio.load();p.makeupDb=makeup.load();p.deEss=deEss.load();p.reverb=reverb.load();p.delay=delay.load();p.delayMs=delayMs.load();p.decaySeconds=decaySeconds.load();p.preDelayMs=preDelayMs.load();p.damping=damping.load();p.width=width.load();p.delayFeedback=delayFeedback.load();p.deharsh=deharsh.load();p.leveling=leveling.load();p.dynamicTame=dynamicTame.load();p.reverbDuck=reverbDuck.load();p.wetReturnDb=wetReturnDb.load();return p;}
void StudioEngine::selectPreset(int i){const auto personal=eqSettings();const auto p=vocal::preset(i);shortReverb=p.shortReverb;shortDecaySeconds=p.shortDecaySeconds;inputDb=p.inputDb;highPass=p.highPassHz;warmth=p.warmthDb;presence=p.presenceDb;threshold=p.thresholdDb;ratio=p.ratio;makeup=p.makeupDb;deEss=p.deEss;reverb=p.reverb;delay=p.delay;delayMs=p.delayMs;decaySeconds=p.decaySeconds;preDelayMs=p.preDelayMs;damping=p.damping;width=p.width;delayFeedback=p.delayFeedback;deharsh=p.deharsh;leveling=p.leveling;dynamicTame=p.dynamicTame;reverbDuck=p.reverbDuck;wetReturnDb=p.wetReturnDb;if(i==4)applyEq(personal);}
void StudioEngine::audioDeviceIOCallbackWithContext(const float* const* inputs,int numInputs,float* const* outputs,int numOutputs,int count,const juce::AudioIODeviceCallbackContext&){
    juce::ScopedNoDenormals noDenormals;
    for(int c=0;c<numOutputs;++c)if(outputs[c])juce::FloatVectorOperations::clear(outputs[c],count);
    if(suspending.load())return;
    const int selected=inputChannel.load();const float* input=selected>=0&&selected<numInputs?inputs[selected]:nullptr;inputPresent.store(input!=nullptr);
    float peak=0;double sum=0;
    for(int i=0;i<count;++i){const float x=input&&std::isfinite(input[i])?input[i]:0;peak=juce::jmax(peak,std::abs(x));sum+=x*x;}
    inputPeak.store(peak);inputRms.store(count?static_cast<float>(std::sqrt(sum/count)):0);if(peak>=.999f)inputClipped.store(true);
    const auto p=parameters();playbackFx.setParameters(p);monitorFx.setParameters(p);vocalAmbience.setParameters(p);
    const int maxBlock=currentBlock.load();
    for(int offset=0;offset<count;offset+=maxBlock){const int n=juce::jmin(maxBlock,count-offset);float* out[2]={numOutputs>0&&outputs[0]?outputs[0]+offset:nullptr,numOutputs>1&&outputs[1]?outputs[1]+offset:nullptr};
        processChunk(input?input+offset:nullptr,out,juce::jmin(2,numOutputs),n,true,true);}
}
void StudioEngine::processChunk(const float* input,float* const* output,int channels,int count,bool recordInput,bool liveMonitor){
    vocalBus.clear(0,count);musicBus.clear(0,count);const bool rolling=playing.load();const auto startFrame=positionFrames.load();const double sr=rate();
    if(recordInput){if(auto* w=activeWriter.load()){auto* raw=monoInput.getWritePointer(0);for(int i=0;i<count;++i)raw[i]=input?input[i]:0;const float* data[]={raw};if(w->write(data,count))capturedFrames.fetch_add(count);else{recordingFault.store(1);activeWriter.store(nullptr);recording.store(false);playing.store(false);}}}
    bool anySolo=false;for(const auto& t:tracks)if(t->solo.load())anySolo=true;
    const bool audition=eqListening.load();
    if(rolling&&(!liveMode.load()||audition)&&!calibrationInputOnly.load()){for(std::size_t trackIndex=0;trackIndex<(audition?1:tracks.size());++trackIndex){auto& t=audition?*eqAudition:*tracks[trackIndex];if(!audition&&(t.mute.load()||(anySolo&&!t.solo.load())))continue;auto& bus=t.vocal?vocalBus:musicBus;const float pan=juce::jlimit(-1.0f,1.0f,t.pan.load());const float g=vocal::dbToGain(t.gainDb.load())*(t.audio.getNumChannels()>1?1.41421356f:1.0f);const float gl=g*std::cos((pan+1)*static_cast<float>(vocal::pi)*.25f),gr=g*std::sin((pan+1)*static_cast<float>(vocal::pi)*.25f);
        for(int i=0;i<count;++i){t.leftGain+=(gl-t.leftGain)*smoothing;t.rightGain+=(gr-t.rightGain)*smoothing;const double seconds=static_cast<double>(startFrame+i)/sr-t.start;if(seconds<0||seconds>=t.duration())continue;const double position=(seconds+t.trimIn)*t.sourceRate;const auto frame=static_cast<juce::int64>(position);if(frame<0||frame>=t.audio.getNumSamples())continue;const int a=static_cast<int>(frame),b=juce::jmin(a+1,t.audio.getNumSamples()-1);const float blend=static_cast<float>(position-frame);const int right=t.audio.getNumChannels()>1?1:0;const float l=t.audio.getSample(0,a)+(t.audio.getSample(0,b)-t.audio.getSample(0,a))*blend;const float r=t.audio.getSample(right,a)+(t.audio.getSample(right,b)-t.audio.getSample(right,a))*blend;bus.addSample(0,i,l*t.leftGain);bus.addSample(1,i,r*t.rightGain);}}
    }
    if(liveMonitor&&liveMode.load()&&!audition)liveMusic->render(musicBus.getWritePointer(0),musicBus.getWritePointer(1),count,sr);
    for(int i=0;i<count;++i){float l=vocalBus.getSample(0,i),r=vocalBus.getSample(1,i);playbackFx.processDry(l,r);if(liveMonitor&&monitor.load()&&input&&!audition){float a=input[i]*.70710678f,b=a;if(!calibrationInputOnly.load())monitorFx.processDry(a,b);l+=a;r+=b;}vocalBus.setSample(0,i,l);vocalBus.setSample(1,i,r);}
    if(eqPlugin&&!calibrationInputOnly.load()){
        if(eqInputs==1)for(int i=0;i<count;++i)vocalBus.setSample(0,i,(vocalBus.getSample(0,i)+vocalBus.getSample(1,i))*.5f);
        auto view=juce::AudioBuffer<float>(vocalBus.getArrayOfWritePointers(),juce::jmax(eqInputs,eqOutputs),count);midi.clear();eqPlugin->processBlock(view,midi);
        if(eqOutputs==1)vocalBus.copyFrom(1,0,vocalBus,0,0,count);
    }
    if(plugin&&!pluginBypassed.load()&&!calibrationInputOnly.load()){midi.clear();const int inputs=pluginInputs.load(),outputs=pluginOutputs.load();if(inputs==1){for(int i=0;i<count;++i)vocalBus.setSample(0,i,(vocalBus.getSample(0,i)+vocalBus.getSample(1,i))*.5f);if(outputs>1)vocalBus.clear(1,0,count);}auto view=juce::AudioBuffer<float>(vocalBus.getArrayOfWritePointers(),juce::jmax(inputs,outputs),count);plugin->processBlock(view,midi);if(outputs==1)vocalBus.copyFrom(1,0,vocalBus,0,0,count);}
    // Detect voice before any reverb/delay. Long tails must not keep ducking music.
    for(int c=0;c<2;++c)dryVocalSidechain.copyFrom(c,0,vocalBus,c,0,count);
    // Antares receives the dry vocal; ambience returns are added afterwards.
    if(!calibrationInputOnly.load())for(int i=0;i<count;++i){float l=vocalBus.getSample(0,i),r=vocalBus.getSample(1,i);vocalAmbience.processAmbience(l,r);vocalBus.setSample(0,i,l);vocalBus.setSample(1,i,r);}
    if(!liveMonitor)currentMonitor=1;
    if(reverbPlugin&&!calibrationInputOnly.load()){
        const auto delay=static_cast<size_t>(reverbPluginLatency.load());
        for(int i=0;i<count;++i)for(int c=0;c<2;++c){const auto sample=vocalBus.getSample(c,i);const auto dry=delay?reverbDryDelay[c].tap(delay):sample;reverbDryDelay[c].push(sample);reverbDry.setSample(c,i,dry);}

        if(reverbInputs==1)for(int i=0;i<count;++i)vocalBus.setSample(0,i,(vocalBus.getSample(0,i)+vocalBus.getSample(1,i))*.5f);
        auto view=juce::AudioBuffer<float>(vocalBus.getArrayOfWritePointers(),juce::jmax(reverbInputs,reverbOutputs),count);midi.clear();reverbPlugin->processBlock(view,midi);
        if(reverbOutputs==1)vocalBus.copyFrom(1,0,vocalBus,0,0,count);
        const auto mix=juce::jlimit(0.f,1.f,reverbPluginMix.load());for(int i=0;i<count;++i){currentReverbMix+=(mix-currentReverbMix)*smoothing;for(int c=0;c<2;++c)vocalBus.setSample(c,i,reverbDry.getSample(c,i)*(1-currentReverbMix)+vocalBus.getSample(c,i)*currentReverbMix);}

    }
    const float duckLimit=liveMonitor&&liveMode.load()&&monitor.load()&&!audition&&!calibrationInputOnly.load()&&!fxBypass.load()?musicDuckingDb.load():0;
    float lastMusicGain=1,maximum=0;const float targetMonitor=liveMonitor?vocal::dbToGain(juce::jlimit(-12.0f,18.0f,monitorDb.load())):1.0f;const float targetMaster=vocal::dbToGain(masterDb.load());const auto latency=static_cast<std::size_t>(effectivePluginLatency());
    for(int i=0;i<count;++i){float ml=musicBus.getSample(0,i),mr=musicBus.getSample(1,i);const float delayedLeft=latency>0?musicDelay[0].tap(latency):ml,delayedRight=latency>0?musicDelay[1].tap(latency):mr;musicDelay[0].push(ml);musicDelay[1].push(mr);ml=delayedLeft;mr=delayedRight;currentMonitor+=(targetMonitor-currentMonitor)*smoothing;currentMaster+=(targetMaster-currentMaster)*smoothing;const float musicGain=musicDucker.process(dryVocalSidechain.getSample(0,i)*currentMonitor,dryVocalSidechain.getSample(1,i)*currentMonitor,duckLimit);lastMusicGain=musicGain;ml*=musicGain;mr*=musicGain;float l=(ml+vocalBus.getSample(0,i)*currentMonitor)*currentMaster,r=(mr+vocalBus.getSample(1,i)*currentMonitor)*currentMaster;limiter.process(l,r);maximum=juce::jmax(maximum,std::abs(l),std::abs(r));if(channels>0&&output[0])output[0][i]=l;if(channels>1&&output[1])output[1][i]=r;}
    musicDuckReduction=-vocal::gainToDb(lastMusicGain);outputPeak.store(maximum);gainReduction.store(juce::jmax(playbackFx.gainReductionDb(),monitorFx.gainReductionDb()));
    if(rolling){positionFrames.store(startFrame+count);if(!recording.load()&&!offline&&position()>(audition?eqAudition->duration():duration())+effectTailSeconds()){playing.store(false);eqListening=false;}}
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
double StudioEngine::effectTailSeconds() const noexcept {
    const double echoSeconds=juce::jlimit(40.0,800.0,static_cast<double>(delayMs.load()))*.001,feedback=juce::jlimit(0.0,.65,static_cast<double>(delayFeedback.load()));
    const double echoTail=delay.load()>.001f?echoSeconds*(feedback>.001?1+std::ceil(std::log(.001)/std::log(feedback)):1):0;
    const double shortTail=shortReverb.load()>.001f?juce::jlimit(.15,.9,static_cast<double>(shortDecaySeconds.load()))+.3:0;
    const double roomTail=reverb.load()>.001f?juce::jlimit(.3,4.0,static_cast<double>(decaySeconds.load()))+juce::jlimit(0.0,.1,preDelayMs.load()*.001)+.3:0;
    return juce::jlimit(3.0,30.0,juce::jmax(shortTail,juce::jmax(roomTail,echoTail))+reverbPluginTail.load()+eqPluginTail.load()+(pluginBypassed.load()?0:pluginTailSeconds.load()));
}
juce::Result StudioEngine::play(){if(isRecording())return juce::Result::ok();auto ready=ensureSampleRate();if(ready.failed())return ready;if(position()>=duration()+3)positionFrames.store(0);withAudioStopped([&]{resetProcessing();});playing.store(true);return juce::Result::ok();}
void StudioEngine::stop(){playing.store(false);eqListening=false;}
void StudioEngine::seek(double seconds){if(isRecording())return;playing.store(false);withAudioStopped([&]{positionFrames.store(static_cast<juce::int64>(juce::jmax(0.0,seconds)*rate()));resetProcessing();});}
juce::Result StudioEngine::startRecording(const juce::File& dir){
    if(isRecording()||hasUnfinishedTake())return juce::Result::fail(juce::String::fromUTF8("Hoàn tất bản thu hiện tại trước khi thu tiếp."));if(tracks.size()>=24)return juce::Result::fail(juce::String::fromUTF8("Phiên bản này hỗ trợ tối đa 24 track. Bỏ một track trước khi thu tiếp."));auto ready=ensureSampleRate();if(ready.failed())return ready;if(!testMode&&(!devices.getCurrentAudioDevice()||!inputPresent.load()))return juce::Result::fail(juce::String::fromUTF8("Chưa có ngõ vào micro. Chọn cổng input trong cài đặt âm thanh."));
    if(eqListening.load())stop();
    if(dir.createDirectory().failed())return juce::Result::fail(juce::String::fromUTF8("Không tạo được thư mục bản thu."));
    recordFile=dir.getNonexistentChildFile("Take_"+juce::Time::getCurrentTime().formatted("%Y%m%d_%H%M%S")+"_"+juce::Uuid().toString(),".recording.wav",false);
    auto stream=recordFile.createOutputStream();if(!stream)return juce::Result::fail(juce::String::fromUTF8("Không ghi được vào ổ đĩa."));
    juce::WavAudioFormat wav;auto* raw=wav.createWriterFor(stream.get(),rate(),1,24,{},0);if(!raw)return juce::Result::fail(juce::String::fromUTF8("Không tạo được WAV 24-bit."));stream.release();
    withAudioStopped([&]{writer=std::make_unique<juce::AudioFormatWriter::ThreadedWriter>(raw,diskThread,262144);writer->setFlushInterval(16384);recordingFault.store(0);inputClipped.store(false);capturedFrames.store(0);recordStart=position();if(latencyCompensation.load())recordStart-=(driverInputLatency.load()+driverOutputLatency.load()+effectivePluginLatency()+static_cast<int>(limiter.latency()))/rate();recordStart+=manualOffsetMs.load()/1000.0;resetProcessing();activeWriter.store(writer.get());recording.store(true);playing.store(true);});
    return juce::Result::ok();
}
juce::Result StudioEngine::finishRecording(juce::File& completed,double& startSeconds){
    playing.store(false);activeWriter.store(nullptr);recording.store(false);withAudioStopped([&]{writer.reset();});startSeconds=recordStart;
    if(!recordFile.existsAsFile())return juce::Result::fail(juce::String::fromUTF8("Không có bản thu cần lưu."));
    std::unique_ptr<juce::AudioFormatReader> verify(formats.createReaderFor(recordFile));
    if(!verify||verify->lengthInSamples!=capturedFrames.load()||recordFile.getSize()<capturedFrames.load()*3+44)recordingFault.store(3);
    verify.reset();
    const auto target=recordFile.getSiblingFile(recordFile.getFileName().replace(".recording.wav",recordingFault.load()?".partial.wav":".wav")).getNonexistentSibling();
    if(!recordFile.moveFileTo(target))return juce::Result::fail(juce::String::fromUTF8("Đã có dữ liệu nhưng không đổi tên được bản thu: ")+recordFile.getFullPathName());
    completed=target;recordFile=juce::File{};if(recordingFault.load())return juce::Result::fail(juce::String::fromUTF8("Thu bị gián đoạn. Đã giữ bản thu một phần tại ")+target.getFullPathName());return juce::Result::ok();
}
juce::Result StudioEngine::installPlugin(std::unique_ptr<juce::AudioPluginInstance> next){if(isRecording()||isPlaying())return juce::Result::fail(juce::String::fromUTF8("Dừng phát/thu trước khi đổi plugin."));if(!next)return juce::Result::fail(juce::String::fromUTF8("Plugin không hợp lệ."));const auto channels=configureVocalPlugin(*next);if(channels.first==0)return juce::Result::fail(juce::String::fromUTF8("Plugin cần có bus mono hoặc stereo cho vocal."));const auto incoming=capturePlugin(*next);const auto eqState=eqPlugin?capturePlugin(*eqPlugin):juce::var{};const auto verbState=reverbPlugin?capturePlugin(*reverbPlugin):juce::var{};withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin=std::move(next);tuneUndo.clear();tuneFixStatus={};pluginInputs=channels.first;pluginOutputs=channels.second;pluginBypassed=false;heldForUnknownKey=false;prepare(rate(),blockSize());},[&]{applyPluginState(*plugin,incoming);if(eqPlugin)applyPluginState(*eqPlugin,eqState);if(reverbPlugin)applyPluginState(*reverbPlugin,verbState);});scanToneLink();if(songTonic>=0&&toneLink.complete()&&toneLink.enabled)setSongKey(songTonic,songMinor,songKeySource);return juce::Result::ok();}
void StudioEngine::removePlugin(){if(isRecording()||isPlaying())return;withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin.reset();tuneUndo.clear();tuneFixStatus={};pluginBypassed=false;heldForUnknownKey=false;toneLink=PluginToneLink{};toneLinkStatus={};pluginLatency.store(0);pluginTailSeconds.store(0);resetProcessing();});}
juce::StringArray StudioEngine::inputNames() const {juce::StringArray names;if(auto* d=devices.getCurrentAudioDevice()){const auto active=d->getActiveInputChannels();const auto all=d->getInputChannelNames();for(int i=0;i<all.size();++i)if(active[i])names.add(all[i]);}return names;}
double StudioEngine::latencyMs() const noexcept{return 1000*(driverInputLatency.load()+driverOutputLatency.load()+effectivePluginLatency()+static_cast<int>(limiter.latency()))/rate();}
juce::String StudioEngine::deviceSummary() const {auto* d=devices.getCurrentAudioDevice();if(!d)return juce::String::fromUTF8("Chưa chọn sound card");return d->getTypeName()+juce::String::fromUTF8(" · ")+juce::String(rate()/1000,1)+juce::String::fromUTF8(" kHz · ")+juce::String(blockSize())+juce::String::fromUTF8(" samples · ")+juce::String(latencyMs(),1)+" ms";}

juce::Result StudioEngine::ensureSampleRate(){
    for(auto& track:tracks){if(std::abs(track->sourceRate-rate())<.01)continue;
        std::unique_ptr<StudioTrack> replacement;auto result=readTrack(track->file,track->vocal,replacement);if(result.failed())return result;
        replacement->originalFile=track->originalFile;replacement->originalTrimIn=track->originalTrimIn;replacement->originalTrimOut=track->originalTrimOut;replacement->name=track->name;replacement->start=track->start;replacement->trimIn=track->trimIn;replacement->trimOut=track->trimOut;
        replacement->gainDb.store(track->gainDb.load());replacement->pan.store(track->pan.load());replacement->mute.store(track->mute.load());replacement->solo.store(track->solo.load());
        withAudioStopped([&]{track=std::move(replacement);});
    }return juce::Result::ok();
}

juce::var StudioEngine::projectState(const vocal::EqSettings* storedEq) const {
    auto* state=new juce::DynamicObject();state->setProperty("schema",1);state->setProperty("sampleRate",rate());state->setProperty("masterDb",masterDb.load());state->setProperty("monitorDb",monitorDb.load());state->setProperty("reverbPluginMix",reverbPluginMix.load());state->setProperty("musicDuckingDb",musicDuckingDb.load());
    auto* fx=new juce::DynamicObject();auto p=parameters();if(storedEq&&storedEq->valid()){p.highPassHz=storedEq->highPass;p.warmthDb=storedEq->warmth;p.presenceDb=storedEq->presence;p.deharsh=storedEq->deharsh;p.deEss=storedEq->deEss;p.inputDb=storedEq->inputDb;}fx->setProperty("shortReverb",p.shortReverb);fx->setProperty("shortDecaySeconds",p.shortDecaySeconds);fx->setProperty("bypass",p.bypass);fx->setProperty("inputDb",p.inputDb);fx->setProperty("highPass",p.highPassHz);fx->setProperty("warmth",p.warmthDb);fx->setProperty("presence",p.presenceDb);fx->setProperty("threshold",p.thresholdDb);fx->setProperty("ratio",p.ratio);fx->setProperty("makeup",p.makeupDb);fx->setProperty("deEss",p.deEss);fx->setProperty("reverb",p.reverb);fx->setProperty("delay",p.delay);fx->setProperty("delayMs",p.delayMs);fx->setProperty("decaySeconds",p.decaySeconds);fx->setProperty("preDelayMs",p.preDelayMs);fx->setProperty("damping",p.damping);fx->setProperty("width",p.width);fx->setProperty("delayFeedback",p.delayFeedback);fx->setProperty("deharsh",p.deharsh);fx->setProperty("leveling",p.leveling);fx->setProperty("dynamicTame",p.dynamicTame);fx->setProperty("reverbDuck",p.reverbDuck);fx->setProperty("wetReturnDb",p.wetReturnDb);state->setProperty("fx",juce::var(fx));
    juce::Array<juce::var> rows;
    for(const auto& t:tracks){auto* row=new juce::DynamicObject();row->setProperty("file",t->file.getRelativePathFrom(sessionDirectory));row->setProperty("originalFile",t->originalFile.getRelativePathFrom(sessionDirectory));row->setProperty("originalTrimIn",t->originalTrimIn);row->setProperty("originalTrimOut",t->originalTrimOut);row->setProperty("name",t->name);row->setProperty("vocal",t->vocal);row->setProperty("start",t->start);row->setProperty("trimIn",t->trimIn);row->setProperty("trimOut",t->trimOut);row->setProperty("gainDb",t->gainDb.load());row->setProperty("pan",t->pan.load());row->setProperty("mute",t->mute.load());row->setProperty("solo",t->solo.load());rows.add(juce::var(row));}
    state->setProperty("tracks",rows);
    auto* profile=new juce::DynamicObject();profile->setProperty("valid",voiceProfile.valid);profile->setProperty("low",voiceProfile.lowMidi);profile->setProperty("high",voiceProfile.highMidi);profile->setProperty("median",voiceProfile.medianMidi);profile->setProperty("seconds",voiceProfile.voicedSeconds);state->setProperty("voiceProfile",juce::var(profile));
    state->setProperty("toneLink",toneLink.state());state->setProperty("songTonic",songTonic);state->setProperty("songMinor",songMinor);state->setProperty("songKeySource",songKeySource);state->setProperty("pluginBypassed",pluginBypassed.load());state->setProperty("keyHold",heldForUnknownKey);
    if(plugin)state->setProperty("plugin",capturePlugin(*plugin));
    if(reverbPlugin)state->setProperty("reverbPlugin",capturePlugin(*reverbPlugin));
    if(eqPlugin)state->setProperty("eqPlugin",capturePlugin(*eqPlugin));
    if(activeWriter.load()) {state->setProperty("recoveringTake",recordFile.getFullPathName());state->setProperty("recoveringStart",recordStart);state->setProperty("recoveringCalibration",calibrationInputOnly.load());}
    return juce::var(state);
}
juce::Result StudioEngine::saveProject(const juce::File& file,const vocal::EqSettings* storedEq){if(file.getParentDirectory().createDirectory().failed())return juce::Result::fail(juce::String::fromUTF8("Không tạo được thư mục dự án."));juce::TemporaryFile temp(file);if(!temp.getFile().replaceWithText(juce::JSON::toString(projectState(storedEq),true)))return juce::Result::fail(juce::String::fromUTF8("Không ghi được dự án tạm."));if(!temp.overwriteTargetFileWithTemporary())return juce::Result::fail(juce::String::fromUTF8("Không cập nhật được dự án. Dữ liệu cũ được giữ nguyên."));return juce::Result::ok();}
juce::Result StudioEngine::loadProject(const juce::File& file,bool loadExternalPlugins){
    if(isRecording())return juce::Result::fail(juce::String::fromUTF8("Dừng thu trước khi mở dự án."));playing.store(false);auto state=juce::JSON::parse(file);if(!state.isObject()||static_cast<int>(state["schema"])!=1||!state["tracks"].isArray())return juce::Result::fail(juce::String::fromUTF8("Định dạng dự án không hợp lệ."));
    if(!loadExternalPlugins)for(const auto* key:{"plugin","eqPlugin","reverbPlugin"})state.getDynamicObject()->removeProperty(key);
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
        take->start=start;const bool calibration=static_cast<bool>(state["recoveringCalibration"]);take->mute=calibration;take->name=(calibration?juce::String::fromUTF8("[Mẫu đo giọng] "):juce::String::fromUTF8("RECOVERED · "))+recovered.getFileNameWithoutExtension();loaded.push_back(std::move(take));
    }
    std::unique_ptr<juce::AudioPluginInstance> next;std::pair<int,int> nextChannels{2,2};
    juce::MemoryBlock pluginState;
    if(state["plugin"].isObject()){juce::PluginDescription desc;auto xml=juce::parseXML(state["plugin"]["description"].toString());if(!xml||!desc.loadFromXml(*xml))return juce::Result::fail(juce::String::fromUTF8("Thông tin VST3 không hợp lệ."));juce::String error;next=pluginFormats.createPluginInstance(desc,rate(),blockSize(),error);if(!next)return juce::Result::fail(juce::String::fromUTF8("Không khôi phục được VST3: ")+error);nextChannels=configureVocalPlugin(*next);if(nextChannels.first==0)return juce::Result::fail(juce::String::fromUTF8("VST3 không hỗ trợ bus vocal mono/stereo."));pluginState.fromBase64Encoding(state["plugin"]["state"].toString());next->setStateInformation(pluginState.getData(),static_cast<int>(pluginState.getSize()));}
    std::unique_ptr<juce::AudioPluginInstance> nextReverb;std::pair<int,int> reverbChannels{2,2};
    if(state["reverbPlugin"].isObject()){
        juce::PluginDescription desc;const auto xml=juce::parseXML(state["reverbPlugin"]["description"].toString());
        if(!xml||!desc.loadFromXml(*xml))return juce::Result::fail("Invalid reverb plugin description");
        juce::String error;nextReverb=pluginFormats.createPluginInstance(desc,rate(),blockSize(),error);if(!nextReverb)return juce::Result::fail(error);
        reverbChannels=configureVocalPlugin(*nextReverb);if(reverbChannels.first==0)return juce::Result::fail("Reverb plugin needs mono/stereo buses");
        juce::MemoryBlock bytes;if(!bytes.fromBase64Encoding(state["reverbPlugin"]["state"].toString()))return juce::Result::fail("Invalid reverb plugin state");
        nextReverb->setStateInformation(bytes.getData(),static_cast<int>(bytes.getSize()));
    }
    std::unique_ptr<juce::AudioPluginInstance> nextEq;std::pair<int,int> eqChannels{2,2};
    if(state["eqPlugin"].isObject()){
        juce::PluginDescription desc;const auto xml=juce::parseXML(state["eqPlugin"]["description"].toString());
        if(!xml||!desc.loadFromXml(*xml))return juce::Result::fail("Invalid EQ plugin description");
        juce::String error;nextEq=pluginFormats.createPluginInstance(desc,rate(),blockSize(),error);if(!nextEq)return juce::Result::fail(error);
        eqChannels=configureVocalPlugin(*nextEq);if(eqChannels.first==0)return juce::Result::fail("EQ plugin needs mono/stereo buses");
        juce::MemoryBlock bytes;if(!bytes.fromBase64Encoding(state["eqPlugin"]["state"].toString()))return juce::Result::fail("Invalid EQ plugin state");
        nextEq->setStateInformation(bytes.getData(),static_cast<int>(bytes.getSize()));
    }
    const auto profile=state["voiceProfile"];if(static_cast<bool>(profile["valid"])){const double low=static_cast<double>(profile["low"]),high=static_cast<double>(profile["high"]),median=static_cast<double>(profile["median"]);if(std::isfinite(low)&&std::isfinite(high)&&std::isfinite(median)&&low>=33&&high<=96&&high-low>=4&&high-low<=48){voiceProfile={true,low,high,median,static_cast<double>(profile["seconds"])};}}
    songTonic=state.hasProperty("songTonic")?juce::jlimit(-1,11,static_cast<int>(state["songTonic"])):-1;songMinor=static_cast<bool>(state["songMinor"]);songKeySource=state["songKeySource"].toString();toneLink=PluginToneLink::fromState(state["toneLink"]);const bool nextBypass=static_cast<bool>(state["pluginBypassed"]);heldForUnknownKey=static_cast<bool>(state["keyHold"]);
    withAudioStopped([&]{if(plugin)plugin->releaseResources();plugin=std::move(next);if(reverbPlugin)reverbPlugin->releaseResources();reverbPlugin=std::move(nextReverb);reverbInputs=reverbChannels.first;reverbOutputs=reverbChannels.second;reverbPluginLatency=0;reverbPluginTail=0;reverbPluginMix=state.hasProperty("reverbPluginMix")?juce::jlimit(0.f,1.f,static_cast<float>(state["reverbPluginMix"])):(reverbPlugin?1.f:.2f);if(eqPlugin)eqPlugin->releaseResources();eqPlugin=std::move(nextEq);eqInputs=eqChannels.first;eqOutputs=eqChannels.second;eqPluginLatency=0;eqPluginTail=0;tuneUndo.clear();tuneFixStatus={};pluginInputs=nextChannels.first;pluginOutputs=nextChannels.second;pluginBypassed=nextBypass;eqListening=false;eqAudition.reset();tracks=std::move(loaded);sessionDirectory=file.getParentDirectory();positionFrames.store(0);const auto fx=state["fx"];auto value=[&](const char* key,float fallback){return fx.hasProperty(key)?static_cast<float>(fx[key]):fallback;};shortReverb=juce::jlimit(0.0f,.4f,value("shortReverb",0));shortDecaySeconds=juce::jlimit(.15f,.9f,value("shortDecaySeconds",.45f));monitorDb=state.hasProperty("monitorDb")?juce::jlimit(-12.0f,18.0f,static_cast<float>(state["monitorDb"])):0;fxBypass.store(static_cast<bool>(fx["bypass"]));inputDb=value("inputDb",0);highPass=value("highPass",80);warmth=value("warmth",-2);presence=value("presence",2);threshold=value("threshold",-18);ratio=value("ratio",3);makeup=value("makeup",2);deEss=value("deEss",.35f);reverb=value("reverb",.1f);delay=value("delay",.04f);delayMs=value("delayMs",240);decaySeconds=value("decaySeconds",1.2f);preDelayMs=value("preDelayMs",20);damping=value("damping",.65f);width=value("width",1);delayFeedback=value("delayFeedback",.27f);deharsh=value("deharsh",0);leveling=juce::jlimit(0.0f,1.0f,value("leveling",0));dynamicTame=juce::jlimit(0.0f,1.0f,value("dynamicTame",0));reverbDuck=juce::jlimit(0.0f,1.0f,value("reverbDuck",0));wetReturnDb=juce::jlimit(-12.f,12.f,value("wetReturnDb",0));musicDuckingDb=state.hasProperty("musicDuckingDb")?juce::jlimit(0.f,6.f,static_cast<float>(state["musicDuckingDb"])):0;masterDb=state.hasProperty("masterDb")?static_cast<float>(state["masterDb"]):-3;pluginLatency.store(0);pluginTailSeconds.store(0);prepare(rate(),blockSize());},[&]{if(plugin)applyPluginState(*plugin,state["plugin"]);if(reverbPlugin)applyPluginState(*reverbPlugin,state["reverbPlugin"]);if(eqPlugin)applyPluginState(*eqPlugin,state["eqPlugin"]);});if(plugin){if(toneLink.identity!=pluginToneIdentity(*plugin)||!toneLink.complete())scanToneLink();}return juce::Result::ok();
}
void StudioEngine::newProject(){if(isRecording())return;songTonic=-1;songKeySource={};playing.store(false);withAudioStopped([&]{eqListening=false;eqAudition.reset();tracks.clear();if(eqPlugin)eqPlugin->releaseResources();eqPlugin.reset();eqPluginLatency=0;eqPluginTail=0;if(reverbPlugin)reverbPlugin->releaseResources();reverbPlugin.reset();reverbPluginLatency=0;reverbPluginTail=0;if(plugin)plugin->releaseResources();plugin.reset();tuneUndo.clear();tuneFixStatus={};pluginBypassed=false;heldForUnknownKey=false;toneLink=PluginToneLink{};toneLinkStatus={};pluginLatency.store(0);pluginTailSeconds.store(0);positionFrames.store(0);musicDuckingDb=0;selectPreset(0);masterDb=-3;resetProcessing();});}
juce::Result StudioEngine::exportMix(const juce::File& destination,std::atomic<bool>& cancel,std::atomic<float>& progress,int vocalIndex){
    if(isRecording()||isPlaying())return juce::Result::fail(juce::String::fromUTF8("Dừng phát và thu trước khi xuất."));if(tracks.empty())return juce::Result::fail(juce::String::fromUTF8("Chưa có track để xuất."));for(const auto& t:tracks)if(t->file==destination||t->originalFile==destination)return juce::Result::fail(juce::String::fromUTF8("Không xuất đè lên file âm thanh nguồn."));auto ready=vocalIndex>=0?juce::Result::ok():ensureSampleRate();if(ready.failed())return ready;
    std::unique_ptr<StudioTrack> solo;
    if(vocalIndex>=0){if(!juce::isPositiveAndBelow(vocalIndex,static_cast<int>(tracks.size()))||!tracks[static_cast<std::size_t>(vocalIndex)]->vocal)return juce::Result::fail(juce::String::fromUTF8("Chọn track micro để xuất riêng vocal."));const auto& source=*tracks[static_cast<std::size_t>(vocalIndex)];ready=readTrack(source.originalFile,true,solo);if(ready.failed())return ready;solo->trimIn=source.file==source.originalFile?source.trimIn:source.originalTrimIn;solo->trimOut=source.file==source.originalFile?source.trimOut:source.originalTrimOut;solo->start=0;solo->leftGain=solo->rightGain=solo->audio.getNumChannels()>1?1.0f:.70710678f;}
    juce::Result result=juce::Result::ok();const auto oldPosition=positionFrames.load();
    withAudioStopped([&]{RenderScopeExit cleanup{[this,oldPosition]{this->playing=false;this->eqListening=false;this->offline=false;this->positionFrames=oldPosition;this->resetProcessing();}};if(solo){eqAudition=std::move(solo);eqListening=true;}else eqListening=false;offline=true;resetProcessing();positionFrames.store(0);const auto tail=effectTailSeconds();const auto frames=static_cast<juce::int64>(std::ceil(((vocalIndex>=0?eqAudition->duration():duration())+tail)*rate()));const auto pipeline=static_cast<juce::int64>(effectivePluginLatency()+static_cast<int>(limiter.latency()));
        juce::TemporaryFile temp(destination);auto stream=temp.getFile().createOutputStream();if(!stream){result=juce::Result::fail(juce::String::fromUTF8("Không mở được file xuất."));offline=false;return;}
        juce::WavAudioFormat wav;std::unique_ptr<juce::AudioFormatWriter> out(wav.createWriterFor(stream.get(),rate(),2,24,{},0));if(!out){result=juce::Result::fail(juce::String::fromUTF8("Không tạo được WAV xuất."));offline=false;return;}stream.release();juce::AudioBuffer<float> buffer(2,blockSize());auto p=parameters();playbackFx.setParameters(p);monitorFx.setParameters(p);vocalAmbience.setParameters(p);playing.store(true);juce::int64 processed=0,written=0;juce::Random noise(0x4f7531);
        while(processed<frames+pipeline&&!cancel.load()){const int n=static_cast<int>(juce::jmin<juce::int64>(blockSize(),frames+pipeline-processed));buffer.clear();processChunk(nullptr,buffer.getArrayOfWritePointers(),2,n,false,false);const int skip=static_cast<int>(juce::jlimit<juce::int64>(0,n,pipeline-processed));const int valid=static_cast<int>(juce::jmin<juce::int64>(n-skip,frames-written));
            for(int c=0;c<2;++c)for(int i=skip;i<skip+valid;++i)buffer.addSample(c,i,(noise.nextFloat()-noise.nextFloat())/8388608.0f);
            if(valid>0&&!out->writeFromAudioSampleBuffer(buffer,skip,valid)){result=juce::Result::fail(juce::String::fromUTF8("Ổ đĩa không ghi được bản mix đầy đủ."));break;}written+=valid;processed+=n;progress.store(static_cast<float>(written)/static_cast<float>(frames));
        }
        out.reset();playing.store(false);if(cancel.load())result=juce::Result::fail(juce::String::fromUTF8("Đã hủy xuất; file đích cũ không thay đổi."));if(result.wasOk()&&!temp.overwriteTargetFileWithTemporary())result=juce::Result::fail(juce::String::fromUTF8("Không cập nhật được file đích."));
    });return result;
}
void StudioEngine::createDemo(){newProject();const auto folder=juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("VocalStudio-Demo");folder.createDirectory();sessionDirectory=folder;
    for(int type=0;type<2;++type){const int n=48000*12;juce::AudioBuffer<float> audio(type?1:2,n);for(int i=0;i<n;++i){const double t=i/48000.0;float x=0;if(type){const double breath=std::pow(juce::jmax(0.0,std::sin(t*1.6)),2.0);x=static_cast<float>(breath*(.12*std::sin(t*2*vocal::pi*220)+.04*std::sin(t*2*vocal::pi*440)));}else{const double beat=std::fmod(t,.5);x=static_cast<float>(.2*std::exp(-beat*24)*std::sin(2*vocal::pi*65*t)+.04*std::sin(2*vocal::pi*130.81*t)+.025*std::sin(2*vocal::pi*196*t));}for(int c=0;c<audio.getNumChannels();++c)audio.setSample(c,i,x);}
        const auto file=folder.getChildFile(type?"Demo_Vocal_Test.wav":"Demo_Beat_Test.wav");file.deleteFile();auto stream=file.createOutputStream();juce::WavAudioFormat wav;std::unique_ptr<juce::AudioFormatWriter> out(wav.createWriterFor(stream.get(),48000,audio.getNumChannels(),24,{},0));if(out){stream.release();out->writeFromAudioSampleBuffer(audio,0,n);out.reset();std::unique_ptr<StudioTrack> track;if(readTrack(file,type==1,track).wasOk())addTrack(std::move(track));}}
}

void StudioEngine::studioPolish(){const auto personal=eqSettings();selectPreset(4);applyEq(personal);fxBypass=false;}

void StudioEngine::applyVocalSettings(const vocal::VocalParameters& p){
    shortReverb=p.shortReverb;shortDecaySeconds=p.shortDecaySeconds;fxBypass=p.bypass;inputDb=p.inputDb;highPass=p.highPassHz;warmth=p.warmthDb;presence=p.presenceDb;threshold=p.thresholdDb;ratio=p.ratio;makeup=p.makeupDb;deEss=p.deEss;reverb=p.reverb;delay=p.delay;delayMs=p.delayMs;decaySeconds=p.decaySeconds;preDelayMs=p.preDelayMs;damping=p.damping;width=p.width;delayFeedback=p.delayFeedback;deharsh=p.deharsh;leveling=p.leveling;dynamicTame=p.dynamicTame;reverbDuck=p.reverbDuck;wetReturnDb=p.wetReturnDb;
}

void StudioEngine::liveVocalPreset(){
    musicDuckingDb=0;
    const float micGain=inputDb.load();auto p=vocal::preset(5);p.inputDb=micGain;p.highPassHz=60;p.warmthDb=0;p.presenceDb=0;p.deharsh=0;p.deEss=.25f;p.thresholdDb=-20;p.ratio=2.2f;p.makeupDb=3;p.leveling=.4f;p.dynamicTame=.15f;p.shortReverb=.12f;p.reverb=.18f;p.delay=.06f;p.decaySeconds=1.2f;
    applyVocalSettings(p);fxBypass=false;monitorDb=juce::jmax(6.f,monitorDb.load());masterDb=-3;reverbPluginMix=.2f;
    if(plugin&&!isPlaying()&&!isRecording()){auto result=applyNaturalTuning(*plugin,tuneUndo,tuneFixStatus,60);if(result.failed())tuneFixStatus=result.getErrorMessage();}
}
void StudioEngine::smoothLivePreset(){
    auto p=parameters();
    // Keep personal EQ, mic gain and all vendor plugin controls intact.
    p.bypass=false;p.thresholdDb=-24;p.ratio=2.7f;p.makeupDb=3;
    p.leveling=.55f;p.dynamicTame=.45f;p.deEss=juce::jlimit(.3f,.55f,p.deEss);p.deharsh=.12f;
    p.shortReverb=.08f;p.shortDecaySeconds=.35f;p.reverb=.22f;p.decaySeconds=2.3f;
    p.preDelayMs=40;p.damping=.62f;p.width=1;p.delay=.055f;p.delayMs=300;p.delayFeedback=.22f;
    p.reverbDuck=.25f;p.wetReturnDb=6;
    applyVocalSettings(p);musicDuckingDb=3;reverbPluginMix=.15f;
    monitorDb=juce::jmax(6.f,monitorDb.load());
    liveMusic->gain=juce::jmin(.6f,liveMusic->gain.load());
}
void StudioEngine::setVoiceColour(int colour){
    if(colour==1){warmth=0;presence=0;deharsh=.1f;deEss=.35f;}
    if(colour==2){warmth=2;presence=.5f;deharsh=.25f;deEss=.4f;}
    if(colour==3){warmth=-1;presence=2.5f;deharsh=.1f;deEss=.5f;}
}
juce::Result StudioEngine::restoreSetup(const juce::var& state){
    if(!state.isObject()||isRecording()||isPlaying())return juce::Result::fail("Invalid saved setup");
    juce::StringArray failures;
    auto restoreSlot=[&](const char* key,int slot)->juce::Result{
        if(!state[key].isObject())return juce::Result::ok();
        juce::PluginDescription desc;auto xml=juce::parseXML(state[key]["description"].toString());
        if(!xml||!desc.loadFromXml(*xml))return juce::Result::fail("Invalid saved plugin description");
        juce::String error;auto next=pluginFormats.createPluginInstance(desc,rate(),blockSize(),error);
        if(!next)return juce::Result::fail(desc.name+": "+error);
        juce::MemoryBlock bytes;if(!bytes.fromBase64Encoding(state[key]["state"].toString()))return juce::Result::fail(desc.name+": invalid saved state");
        next->setStateInformation(bytes.getData(),static_cast<int>(bytes.getSize()));
        const auto installed=slot==0?installPlugin(std::move(next)):slot==1?installEqPlugin(std::move(next)):installReverbPlugin(std::move(next));
        if(installed.failed())return installed;
        auto* instance=slot==0?plugin.get():slot==1?eqPlugin.get():reverbPlugin.get();
        withAudioStopped([]{},[&]{applyPluginState(*instance,state[key]);});
        if(slot==0){auto link=PluginToneLink::fromState(state["toneLink"]);if(link.complete()&&link.identity==pluginToneIdentity(*plugin))toneLink=link;pluginBypassed=static_cast<bool>(state["pluginBypassed"]);heldForUnknownKey=static_cast<bool>(state["keyHold"])&&pluginBypassed.load();}
        return juce::Result::ok();
    };
    const char* slotNames[]={"plugin","eqPlugin","reverbPlugin"};
    for(int slot=0;slot<3;++slot){try{const auto result=restoreSlot(slotNames[slot],slot);if(result.failed())failures.add(juce::String(slotNames[slot])+": "+result.getErrorMessage());}catch(const std::exception& error){failures.add(juce::String(slotNames[slot])+": "+error.what());}catch(...){failures.add(juce::String(slotNames[slot])+": plugin restore failed");}}
    auto p=parameters();const auto fx=state["fx"];
    if(fx.hasProperty("inputDb")){const float v=static_cast<float>(fx["inputDb"]);if(std::isfinite(v))p.inputDb=v;}
    if(fx.hasProperty("highPass")){const float v=static_cast<float>(fx["highPass"]);if(std::isfinite(v))p.highPassHz=v;}
    if(fx.hasProperty("warmth")){const float v=static_cast<float>(fx["warmth"]);if(std::isfinite(v))p.warmthDb=v;}
    if(fx.hasProperty("presence")){const float v=static_cast<float>(fx["presence"]);if(std::isfinite(v))p.presenceDb=v;}
    if(fx.hasProperty("threshold")){const float v=static_cast<float>(fx["threshold"]);if(std::isfinite(v))p.thresholdDb=v;}
    if(fx.hasProperty("ratio")){const float v=static_cast<float>(fx["ratio"]);if(std::isfinite(v))p.ratio=v;}
    if(fx.hasProperty("makeup")){const float v=static_cast<float>(fx["makeup"]);if(std::isfinite(v))p.makeupDb=v;}
    if(fx.hasProperty("deEss")){const float v=static_cast<float>(fx["deEss"]);if(std::isfinite(v))p.deEss=v;}
    if(fx.hasProperty("reverb")){const float v=static_cast<float>(fx["reverb"]);if(std::isfinite(v))p.reverb=v;}
    if(fx.hasProperty("delay")){const float v=static_cast<float>(fx["delay"]);if(std::isfinite(v))p.delay=v;}
    if(fx.hasProperty("delayMs")){const float v=static_cast<float>(fx["delayMs"]);if(std::isfinite(v))p.delayMs=v;}
    if(fx.hasProperty("decaySeconds")){const float v=static_cast<float>(fx["decaySeconds"]);if(std::isfinite(v))p.decaySeconds=v;}
    if(fx.hasProperty("preDelayMs")){const float v=static_cast<float>(fx["preDelayMs"]);if(std::isfinite(v))p.preDelayMs=v;}
    if(fx.hasProperty("damping")){const float v=static_cast<float>(fx["damping"]);if(std::isfinite(v))p.damping=v;}
    if(fx.hasProperty("width")){const float v=static_cast<float>(fx["width"]);if(std::isfinite(v))p.width=v;}
    if(fx.hasProperty("delayFeedback")){const float v=static_cast<float>(fx["delayFeedback"]);if(std::isfinite(v))p.delayFeedback=v;}
    if(fx.hasProperty("deharsh")){const float v=static_cast<float>(fx["deharsh"]);if(std::isfinite(v))p.deharsh=v;}
    if(fx.hasProperty("leveling")){const float v=static_cast<float>(fx["leveling"]);if(std::isfinite(v))p.leveling=v;}
    if(fx.hasProperty("dynamicTame")){const float v=static_cast<float>(fx["dynamicTame"]);if(std::isfinite(v))p.dynamicTame=v;}
    if(fx.hasProperty("reverbDuck")){const float v=static_cast<float>(fx["reverbDuck"]);if(std::isfinite(v))p.reverbDuck=v;}
    if(fx.hasProperty("wetReturnDb")){const float v=static_cast<float>(fx["wetReturnDb"]);if(std::isfinite(v))p.wetReturnDb=v;}else p.wetReturnDb=0;
    if(fx.hasProperty("shortReverb")){const float v=static_cast<float>(fx["shortReverb"]);if(std::isfinite(v))p.shortReverb=v;}
    if(fx.hasProperty("shortDecaySeconds")){const float v=static_cast<float>(fx["shortDecaySeconds"]);if(std::isfinite(v))p.shortDecaySeconds=v;}
    p.bypass=static_cast<bool>(fx["bypass"]);applyVocalSettings(p);if(state.hasProperty("reverbPluginMix"))reverbPluginMix=juce::jlimit(0.f,1.f,static_cast<float>(state["reverbPluginMix"]));
    musicDuckingDb=state.hasProperty("musicDuckingDb")?juce::jlimit(0.f,6.f,static_cast<float>(state["musicDuckingDb"])):0;
    if(state.hasProperty("monitorDb"))monitorDb=juce::jlimit(-12.0f,18.0f,static_cast<float>(state["monitorDb"]));
    if(state.hasProperty("masterDb")){const float value=static_cast<float>(state["masterDb"]);if(std::isfinite(value))masterDb=juce::jlimit(-30.f,6.f,value);}
    withAudioStopped([]{},[&]{if(plugin&&state["plugin"].isObject())applyPluginState(*plugin,state["plugin"]);if(reverbPlugin&&state["reverbPlugin"].isObject())applyPluginState(*reverbPlugin,state["reverbPlugin"]);if(eqPlugin&&state["eqPlugin"].isObject())applyPluginState(*eqPlugin,state["eqPlugin"]);});
    return failures.isEmpty()?juce::Result::ok():juce::Result::fail(failures.joinIntoString("\n"));
}

juce::Result StudioEngine::installReverbPlugin(std::unique_ptr<juce::AudioPluginInstance> next){
    if(isPlaying()||isRecording())return juce::Result::fail(juce::String::fromUTF8("Dừng phát/thu trước khi đổi vang plugin."));
    if(!next)return juce::Result::fail("Invalid reverb plugin");const auto channels=configureVocalPlugin(*next);if(!channels.first)return juce::Result::fail("Reverb plugin needs mono/stereo buses");
    const auto incoming=capturePlugin(*next);const auto tunerState=plugin?capturePlugin(*plugin):juce::var{};const auto otherState=eqPlugin?capturePlugin(*eqPlugin):juce::var{};withAudioStopped([&]{if(reverbPlugin)reverbPlugin->releaseResources();reverbPlugin=std::move(next);reverbInputs=channels.first;reverbOutputs=channels.second;prepare(rate(),blockSize());},[&]{applyPluginState(*reverbPlugin,incoming);if(plugin)applyPluginState(*plugin,tunerState);if(eqPlugin)applyPluginState(*eqPlugin,otherState);});return juce::Result::ok();
}
void StudioEngine::removeReverbPlugin(){if(isPlaying()||isRecording())return;withAudioStopped([&]{if(reverbPlugin)reverbPlugin->releaseResources();reverbPlugin.reset();reverbPluginLatency=0;reverbPluginTail=0;resetProcessing();});}

void StudioEngine::usePluginKey(){if(heldForUnknownKey){heldForUnknownKey=false;pluginBypassed=false;}toneLinkStatus=juce::String::fromUTF8("Dùng Key/Scale đặt trong plugin; app không gửi đè tone.");}

void StudioEngine::enableTunerForMonitoring(){heldForUnknownKey=false;pluginBypassed=false;if(plugin)if(auto* bypass=plugin->getBypassParameter())bypass->setValueNotifyingHost(0);toneLinkStatus=juce::String::fromUTF8("Auto-Tune đang bật; dùng Key/Scale trong plugin.");}

juce::Result StudioEngine::installEqPlugin(std::unique_ptr<juce::AudioPluginInstance> next){
    if(isPlaying()||isRecording())return juce::Result::fail(juce::String::fromUTF8("Dừng phát/thu trước khi đổi EQ plugin."));
    if(!next)return juce::Result::fail("Invalid reverb plugin");const auto channels=configureVocalPlugin(*next);if(!channels.first)return juce::Result::fail("Reverb plugin needs mono/stereo buses");
    const auto incoming=capturePlugin(*next);const auto tunerState=plugin?capturePlugin(*plugin):juce::var{};const auto otherState=reverbPlugin?capturePlugin(*reverbPlugin):juce::var{};withAudioStopped([&]{if(eqPlugin)eqPlugin->releaseResources();eqPlugin=std::move(next);eqInputs=channels.first;eqOutputs=channels.second;prepare(rate(),blockSize());},[&]{applyPluginState(*eqPlugin,incoming);if(plugin)applyPluginState(*plugin,tunerState);if(reverbPlugin)applyPluginState(*reverbPlugin,otherState);});return juce::Result::ok();
}
void StudioEngine::removeEqPlugin(){if(isPlaying()||isRecording())return;withAudioStopped([&]{if(eqPlugin)eqPlugin->releaseResources();eqPlugin.reset();eqPluginLatency=0;eqPluginTail=0;resetProcessing();});}
