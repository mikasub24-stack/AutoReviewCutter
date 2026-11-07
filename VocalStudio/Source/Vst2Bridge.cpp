#include "Vst2Bridge.h"
#include "Vst2BridgeProtocol.h"
#include <cmath>
#if JUCE_WINDOWS && defined(_WIN64)
namespace {
class Bridge;
class BridgeParameter final:public juce::AudioPluginInstance::HostedParameter {
    Bridge& owner;int index;juce::String title,label;float initial;
public:
    BridgeParameter(Bridge& p,int i,const juce::var& meta);
    juce::String getParameterID() const override{return "vst2-"+juce::String(index);}
    float getValue() const override;void setValue(float) override;
    float getDefaultValue() const override{return initial;}
    juce::String getName(int n) const override{return title.substring(0,n);}
    juce::String getLabel() const override{return label;}
    juce::String getText(float v,int n) const override{return juce::String(v,3).substring(0,n);}
    float getValueForText(const juce::String& s) const override{return juce::jlimit(0.f,1.f,s.getFloatValue());}
};
class Bridge final:public juce::AudioPluginInstance {
public:
    HANDLE mapping=nullptr,request=nullptr,response=nullptr;PROCESS_INFORMATION child{};
    vstbridge::Shared* shared=nullptr;juce::PluginDescription description;
    juce::CriticalSection mutex;bool failed=false,prepared=false;juce::MemoryBlock cachedState;
    Bridge():AudioPluginInstance(BusesProperties().withInput("Input",juce::AudioChannelSet::stereo(),true).withOutput("Output",juce::AudioChannelSet::stereo(),true)){}
    ~Bridge() override{
        if(child.hProcess){if(!failed)exchange(vstbridge::quit,1000);if(WaitForSingleObject(child.hProcess,1000)==WAIT_TIMEOUT)TerminateProcess(child.hProcess,1);CloseHandle(child.hProcess);CloseHandle(child.hThread);}
        if(shared)UnmapViewOfFile(shared);if(mapping)CloseHandle(mapping);if(request)CloseHandle(request);if(response)CloseHandle(response);
    }
    bool exchange(vstbridge::Command cmd,DWORD timeout=10000){
        if(failed||!shared||!child.hProcess)return false;
        shared->success=0;shared->command=cmd;ResetEvent(response);SetEvent(request);
        HANDLE handles[]={response,child.hProcess};
        if(WaitForMultipleObjects(2,handles,FALSE,timeout)!=WAIT_OBJECT_0){
            failed=true;
            const auto pluginName=description.name;
            if(pluginName.isNotEmpty())juce::MessageManager::callAsync([pluginName]{juce::AlertWindow::showMessageBoxAsync(juce::MessageBoxIconType::WarningIcon,juce::String::fromUTF8("Plugin 32-bit đã dừng"),pluginName+juce::String::fromUTF8(" không phản hồi hoặc bị lỗi. App giữ tiếng giọng khô. Hãy bỏ plugin rồi nạp lại, hoặc chọn vang khác."));});
            return false;
        }
        if(!shared->success){failed=true;return false;}return true;
    }
    bool initialise(const juce::File& file,juce::String& error){
        const auto id=juce::Uuid().toString();
        const auto mem=vstbridge::name(id,"-memory"),req=vstbridge::name(id,"-request"),ack=vstbridge::name(id,"-response");
        mapping=CreateFileMappingW(INVALID_HANDLE_VALUE,nullptr,PAGE_READWRITE,0,sizeof(vstbridge::Shared),mem.toWideCharPointer());
        request=CreateEventW(nullptr,FALSE,FALSE,req.toWideCharPointer());response=CreateEventW(nullptr,FALSE,FALSE,ack.toWideCharPointer());
        if(mapping)shared=static_cast<vstbridge::Shared*>(MapViewOfFile(mapping,FILE_MAP_ALL_ACCESS,0,0,sizeof(vstbridge::Shared)));
        if(!shared||!request||!response){error="Cannot create 32-bit bridge shared memory";return false;}
        shared->protocol=vstbridge::version;
        auto cmd=vstbridge::helper().getFullPathName().quoted()+" --session "+id+" --plugin "+file.getFullPathName().quoted()+" --parent "+juce::String(static_cast<int>(GetCurrentProcessId()));
        STARTUPINFOW startup{};startup.cb=sizeof(startup);std::vector<wchar_t> buffer(static_cast<size_t>(cmd.length())+1);cmd.copyToUTF16(buffer.data(),buffer.size()*sizeof(wchar_t));
        if(!CreateProcessW(vstbridge::helper().getFullPathName().toWideCharPointer(),buffer.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&startup,&child)){error="Cannot start VocalStudioBridge32.exe";return false;}
        if(!exchange(vstbridge::hello,20000)){error=juce::String::fromUTF8("Plugin 32-bit không phản hồi hoặc bị lỗi khi nạp. App vẫn hoạt động.");return false;}
        if(shared->metadataBytes>=vstbridge::metadataSize){error="Invalid bridge metadata";return false;}
        const auto meta=juce::JSON::parse(juce::String::fromUTF8(shared->metadata,static_cast<int>(shared->metadataBytes)));
        auto xml=juce::parseXML(meta["description"].toString());
        if(!xml||!description.loadFromXml(*xml)||shared->inputs<1||shared->inputs>2||shared->outputs<1||shared->outputs>2||shared->parameterCount>vstbridge::maxParams){error="Invalid 32-bit plugin description";return false;}
        auto layout=getBusesLayout();layout.inputBuses.set(0,juce::AudioChannelSet::canonicalChannelSet(static_cast<int>(shared->inputs)));layout.outputBuses.set(0,juce::AudioChannelSet::canonicalChannelSet(static_cast<int>(shared->outputs)));if(!setBusesLayout(layout)){error="Unsupported bridge channel layout";return false;}
        const auto* params=meta["parameters"].getArray();if(!params||params->size()!=static_cast<int>(shared->parameterCount)){error="Invalid bridge parameter metadata";return false;}
        for(int i=0;i<params->size();++i)addHostedParameter(std::make_unique<BridgeParameter>(*this,i,(*params)[i]));
        setLatencySamples(static_cast<int>(shared->latency));getStateInformation(cachedState);return !failed;
    }
    const juce::String getName() const override{return description.name;}
    void fillInPluginDescription(juce::PluginDescription& d) const override{d=description;}
    bool isBusesLayoutSupported(const BusesLayout& l) const override{return shared&&l.getMainInputChannels()==static_cast<int>(shared->inputs)&&l.getMainOutputChannels()==static_cast<int>(shared->outputs);}
    void prepareToPlay(double rate,int block) override{const juce::ScopedLock lock(mutex);if(!shared||failed)return;shared->rate=rate;shared->block=static_cast<uint32_t>(juce::jlimit(16,vstbridge::maxFrames,block));prepared=exchange(vstbridge::prepare);setLatencySamples(static_cast<int>(shared->latency));}
    void releaseResources() override{const juce::ScopedLock lock(mutex);if(prepared&&!failed)exchange(vstbridge::release);prepared=false;}
    void reset() override{const juce::ScopedLock lock(mutex);if(prepared&&!failed)exchange(vstbridge::reset);}
    void processBlock(juce::AudioBuffer<float>& audio,juce::MidiBuffer&) override{
        // Editor/state requests must not stall the sound card callback while
        // the helper UI opens a window or a plugin performs slow file I/O.
        const juce::ScopedTryLock lock(mutex);if(!lock.isLocked())return;
        const auto n=audio.getNumSamples();
        // On helper crash or timeout leave the dry vocal audible; never wait
        // indefinitely on an external plugin from the audio callback.
        if(!prepared||failed||n>vstbridge::maxFrames)return;
        shared->frames=static_cast<uint32_t>(n);
        for(uint32_t c=0;c<shared->inputs;++c)memcpy(shared->audio[c],audio.getReadPointer(static_cast<int>(c)),static_cast<size_t>(n)*sizeof(float));
        const auto budget=static_cast<DWORD>(isNonRealtime()?10000:juce::jlimit(20.0,200.0,4000.0*n/juce::jmax(1.0,getSampleRate())));
        if(!exchange(vstbridge::process,budget))return;
        for(uint32_t c=0;c<shared->outputs;++c)memcpy(audio.getWritePointer(static_cast<int>(c)),shared->audio[c],static_cast<size_t>(n)*sizeof(float));
    }
    double getTailLengthSeconds() const override{return shared?shared->tail:0;}
    bool acceptsMidi() const override{return false;}bool producesMidi() const override{return false;}
    bool hasEditor() const override{return true;}
    juce::AudioProcessorEditor* createEditor() override;
    int getNumPrograms() override{return 1;}int getCurrentProgram() override{return 0;}
    void setCurrentProgram(int) override{}const juce::String getProgramName(int) override{return "Plugin";}void changeProgramName(int,const juce::String&) override{}
    void getStateInformation(juce::MemoryBlock& data) override{const juce::ScopedLock lock(mutex);if(!failed&&exchange(vstbridge::getState)&&shared->stateBytes<=vstbridge::stateCapacity)cachedState.replaceAll(shared->state,shared->stateBytes);data=cachedState;}
    void setStateInformation(const void* data,int size) override{const juce::ScopedLock lock(mutex);if(failed||size<0||size>vstbridge::stateCapacity)return;memcpy(shared->state,data,static_cast<size_t>(size));shared->stateBytes=static_cast<uint32_t>(size);if(exchange(vstbridge::setState))cachedState.replaceAll(data,static_cast<size_t>(size));}
    void show(bool visible){const juce::ScopedLock lock(mutex);if(!failed)exchange(visible?vstbridge::showEditor:vstbridge::hideEditor);}
};
BridgeParameter::BridgeParameter(Bridge& p,int i,const juce::var& meta):owner(p),index(i),title(meta["name"].toString()),label(meta["label"].toString()),initial(static_cast<float>(meta["default"])){}
float BridgeParameter::getValue() const{return vstbridge::number(InterlockedCompareExchange(&owner.shared->parameterValues[index],0,0));}
void BridgeParameter::setValue(float v){if(!std::isfinite(v))return;const auto b=vstbridge::bits(juce::jlimit(0.f,1.f,v));InterlockedExchange(&owner.shared->parameterValues[index],b);InterlockedExchange(&owner.shared->pendingValues[index],b);InterlockedExchange(&owner.shared->dirty[index],1);}
class BridgeEditor final:public juce::AudioProcessorEditor {
    Bridge& bridge;juce::Label label;juce::TextButton open{juce::String::fromUTF8("Mở cửa sổ vang 32-bit")};
public:
    explicit BridgeEditor(Bridge& p):AudioProcessorEditor(p),bridge(p){label.setText(juce::String::fromUTF8("Plugin 32-bit chạy trong cửa sổ riêng. Đóng cửa sổ này để ẩn plugin."),juce::dontSendNotification);label.setJustificationType(juce::Justification::centred);addAndMakeVisible(label);addAndMakeVisible(open);open.onClick=[this]{bridge.show(true);};setSize(510,120);bridge.show(true);}
    ~BridgeEditor() override{bridge.show(false);}
    void resized() override{label.setBounds(10,10,getWidth()-20,55);open.setBounds(100,75,getWidth()-200,30);}
};
juce::AudioProcessorEditor* Bridge::createEditor(){return new BridgeEditor(*this);}
}
std::unique_ptr<juce::AudioPluginInstance> createBridgedVst2(const juce::File& file,juce::String& error){auto result=std::make_unique<Bridge>();if(!result->initialise(file,error))return {};return result;}
#else
std::unique_ptr<juce::AudioPluginInstance> createBridgedVst2(const juce::File&,juce::String& error){error="32-bit bridge requires Windows x64";return {};}
#endif
