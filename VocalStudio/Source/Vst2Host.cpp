#include "Vst2Host.h"
namespace legacy {
#include "vestige/vestige.h"
}
#include <cmath>
#include <cstring>
#include <cstddef>
static_assert(sizeof(void*)!=8||offsetof(legacy::AEffect,processReplacing)==120);
#if JUCE_WINDOWS
#include <windows.h>
#endif
namespace {
constexpr int getLabel=6,getDisplay=7,getChunk=23,setChunk=24,getTail=52,chunkFlag=32;
struct Rect {short top,left,bottom,right;};
class Vst2Instance;
thread_local Vst2Instance* constructing=nullptr;
class Vst2Parameter final : public juce::AudioPluginInstance::HostedParameter {
public:
    Vst2Parameter(Vst2Instance& p,int i);
    juce::String getParameterID() const override{return "vst2-"+juce::String(index);}
    float getValue() const override;void setValue(float) override;
    float getDefaultValue() const override{return initial;}
    juce::String getName(int) const override;juce::String getLabel() const override;
    juce::String getText(float,int) const override;
    float getValueForText(const juce::String& s) const override{return juce::jlimit(0.f,1.f,s.getFloatValue());}
private:Vst2Instance& owner;int index;float initial=0;
};
class Vst2Instance final : public juce::AudioPluginInstance {
public:
    juce::DynamicLibrary module;legacy::AEffect* effect=nullptr;juce::PluginDescription description;
    juce::AudioBuffer<float> inputs,outputs;
    legacy::VstTimeInfo time{};juce::String directory;
    bool opened=false,prepared=false;double sampleRate=48000;int blockSize=256;
    juce::AudioProcessorEditor* editor=nullptr;
    Vst2Instance():AudioPluginInstance(BusesProperties().withInput("Input",juce::AudioChannelSet::stereo(),true).withOutput("Output",juce::AudioChannelSet::stereo(),true)){time.sampleRate=48000;time.tempo=120;time.timeSigNumerator=4;time.timeSigDenominator=4;time.flags=kVstTempoValid|kVstTimeSigValid;}
    ~Vst2Instance() override{releaseResources();if(effect&&opened)dispatch(effClose);effect=nullptr;}
    intptr_t dispatch(int op,int index=0,intptr_t value=0,void* ptr=nullptr,float opt=0) const{return effect&&effect->dispatcher?effect->dispatcher(effect,op,index,value,ptr,opt):0;}
    juce::String text(int opcode,int index=0) const {char buffer[512]{};dispatch(opcode,index,0,buffer);buffer[511]=0;return juce::String::fromUTF8(buffer);}
    static intptr_t __cdecl host(legacy::AEffect*,int32_t,int32_t,intptr_t,void*,float);
    bool initialise(const juce::File& file,juce::String& error){
        error=checkVst2Binary(file);if(error.isNotEmpty())return false;
        directory=file.getParentDirectory().getFullPathName();
        if(!module.open(file.getFullPathName())){error=juce::String::fromUTF8("Không mở được DLL hoặc thiếu thư viện phụ thuộc: ")+file.getFileName();return false;}
        using Entry=legacy::AEffect* (__cdecl*)(legacy::audioMasterCallback);
        auto entry=reinterpret_cast<Entry>(module.getFunction("VSTPluginMain"));
        if(!entry)entry=reinterpret_cast<Entry>(module.getFunction("main"));
        if(!entry){error=juce::String::fromUTF8("DLL này không có VSTPluginMain; không phải plugin VST2.");return false;}
        constructing=this;try{effect=entry(host);}catch(...){constructing=nullptr;throw;}constructing=nullptr;
        if(!effect||effect->magic!=kEffectMagic||!effect->dispatcher){effect=nullptr;error="Invalid VST2 effect";return false;}
        effect->user=this;dispatch(effOpen);opened=true;
        if((effect->flags&effFlagsIsSynth)||dispatch(effGetPlugCategory)==10||effect->numInputs<1||effect->numInputs>2||effect->numOutputs<1||effect->numOutputs>2||effect->numParams<0||effect->numParams>8192||!effect->processReplacing||!(effect->flags&effFlagsCanReplacing)||(effect->numParams>0&&(!effect->getParameter||!effect->setParameter))){error=juce::String::fromUTF8("Chỉ hỗ trợ VST2 effect mono/stereo, không hỗ trợ synth, shell hoặc plugin không có processReplacing.");return false;}
        auto layout=getBusesLayout();layout.inputBuses.set(0,juce::AudioChannelSet::canonicalChannelSet(effect->numInputs));layout.outputBuses.set(0,juce::AudioChannelSet::canonicalChannelSet(effect->numOutputs));if(!setBusesLayout(layout)){error="Unsupported VST2 buses";return false;}
        for(int i=0;i<effect->numParams;++i)addHostedParameter(std::make_unique<Vst2Parameter>(*this,i));
        description.name=text(effGetEffectName);if(description.name.isEmpty())description.name=file.getFileNameWithoutExtension();
        description.descriptiveName=description.name;description.pluginFormatName="VST2";description.fileOrIdentifier=file.getFullPathName();description.manufacturerName=text(effGetVendorString);description.version=juce::String(effect->version);description.uniqueId=effect->uniqueID;description.deprecatedUid=effect->uniqueID;description.numInputChannels=effect->numInputs;description.numOutputChannels=effect->numOutputs;description.lastFileModTime=file.getLastModificationTime();
        setLatencySamples(juce::jlimit(0,96000,effect->initialDelay));return true;
    }
    const juce::String getName() const override{return description.name;}
    void fillInPluginDescription(juce::PluginDescription& d) const override{d=description;}
    bool isBusesLayoutSupported(const BusesLayout& layout) const override{return effect&&layout.getMainInputChannels()==effect->numInputs&&layout.getMainOutputChannels()==effect->numOutputs;}
    void prepareToPlay(double rate,int size) override{
        releaseResources();if(effect->numInputs<1||effect->numInputs>2||effect->numOutputs<1||effect->numOutputs>2)return;sampleRate=rate;blockSize=juce::jmax(16,size);inputs.setSize(effect->numInputs,blockSize);outputs.setSize(effect->numOutputs,blockSize);
        dispatch(effSetSampleRate,0,0,nullptr,static_cast<float>(rate));dispatch(effSetBlockSize,0,blockSize);dispatch(effMainsChanged,0,1);dispatch(effStartProcess);prepared=true;time={};time.sampleRate=rate;time.tempo=120;time.timeSigNumerator=4;time.timeSigDenominator=4;time.flags=kVstTempoValid|kVstTimeSigValid|kVstPpqPosValid;
        setLatencySamples(juce::jlimit(0,static_cast<int>(rate*2),effect->initialDelay));
    }
    void releaseResources() override{if(prepared){dispatch(effStopProcess);dispatch(effMainsChanged,0,0);prepared=false;}}
    void reset() override{if(prepared){dispatch(effStopProcess);dispatch(effMainsChanged,0,0);dispatch(effMainsChanged,0,1);dispatch(effStartProcess);}time.samplePos=0;}
    void processBlock(juce::AudioBuffer<float>& buffer,juce::MidiBuffer&) override{
        juce::ScopedNoDenormals noDenormals;
        if(!prepared){buffer.clear();return;}
        const int n=buffer.getNumSamples();
        if(n>blockSize||!effect->processReplacing||effect->numInputs!=inputs.getNumChannels()||effect->numOutputs!=outputs.getNumChannels()){buffer.clear();return;}
        for(int c=0;c<effect->numInputs;++c)inputs.copyFrom(c,0,buffer,c,0,n);
        outputs.clear();time.ppqPos=time.samplePos/sampleRate*2;
        float* ins[2]={inputs.getWritePointer(0),effect->numInputs>1?inputs.getWritePointer(1):nullptr};float* outs[2]={outputs.getWritePointer(0),effect->numOutputs>1?outputs.getWritePointer(1):nullptr};effect->processReplacing(effect,ins,outs,n);
        for(int c=0;c<effect->numOutputs;++c)buffer.copyFrom(c,0,outputs,c,0,n);
        time.samplePos+=n;
    }
    double getTailLengthSeconds() const override{const auto n=dispatch(getTail);return n>1?juce::jlimit(0.0,30.0,n/sampleRate):0;}
    bool acceptsMidi() const override{return false;}bool producesMidi() const override{return false;}
    bool hasEditor() const override{return (effect->flags&effFlagsHasEditor)!=0;}
    juce::AudioProcessorEditor* createEditor() override;
    int getNumPrograms() override{return juce::jmax(1,effect->numPrograms);}
    int getCurrentProgram() override{return static_cast<int>(dispatch(effGetProgram));}
    void setCurrentProgram(int i) override{if(i>=0&&i<effect->numPrograms)dispatch(effSetProgram,0,i);}
    const juce::String getProgramName(int i) override{return i==getCurrentProgram()?text(effGetProgramName):juce::String(i+1);}
    void changeProgramName(int,const juce::String&) override{}
    void getStateInformation(juce::MemoryBlock& out) override{
        auto* state=new juce::DynamicObject;state->setProperty("uid",effect->uniqueID);state->setProperty("program",getCurrentProgram());
        void* data=nullptr;const auto size=(effect->flags&chunkFlag)?dispatch(getChunk,0,0,&data):0;
        if(size>0&&size<=32*1024*1024&&data)state->setProperty("chunk",juce::MemoryBlock(data,static_cast<size_t>(size)).toBase64Encoding());
        juce::Array<juce::var> values;for(int i=0;i<effect->numParams;++i)values.add(effect->getParameter(effect,i));state->setProperty("parameters",values);
        const auto json=juce::JSON::toString(juce::var(state));out.replaceAll(json.toRawUTF8(),json.getNumBytesAsUTF8());
    }
    void setStateInformation(const void* data,int size) override{
        if(size<=0||size>48*1024*1024)return;const auto state=juce::JSON::parse(juce::String::fromUTF8(static_cast<const char*>(data),size));
        if(!state.isObject()||static_cast<int>(state["uid"])!=effect->uniqueID)return;
        setCurrentProgram(static_cast<int>(state["program"]));
        juce::MemoryBlock chunk;if((effect->flags&chunkFlag)&&chunk.fromBase64Encoding(state["chunk"].toString())&&chunk.getSize()>0&&chunk.getSize()<=32*1024*1024){dispatch(setChunk,0,static_cast<intptr_t>(chunk.getSize()),chunk.getData());return;}
        if(const auto* values=state["parameters"].getArray())if(values->size()==effect->numParams)for(int i=0;i<effect->numParams;++i){const auto v=static_cast<float>((*values)[i]);if(std::isfinite(v))effect->setParameter(effect,i,juce::jlimit(0.f,1.f,v));}
    }
};
Vst2Parameter::Vst2Parameter(Vst2Instance& p,int i):owner(p),index(i),initial(getValue()){}
float Vst2Parameter::getValue() const {const float v=owner.effect->getParameter(owner.effect,index);return std::isfinite(v)?juce::jlimit(0.f,1.f,v):0;}
void Vst2Parameter::setValue(float v){if(std::isfinite(v))owner.effect->setParameter(owner.effect,index,juce::jlimit(0.f,1.f,v));}
juce::String Vst2Parameter::getName(int length) const{return owner.text(effGetParamName,index).substring(0,length);}
juce::String Vst2Parameter::getLabel() const{return owner.text(::getLabel,index);}
juce::String Vst2Parameter::getText(float value,int length) const{
    // VST2 only exposes display text for the current value. Never modify a live
    // parameter to guess enum/Key/Scale labels at another value.
    return (std::abs(value-getValue())<.00001f?owner.text(getDisplay,index):juce::String(value,3)).substring(0,length);
}
#if JUCE_WINDOWS
class Vst2Editor final : public juce::AudioProcessorEditor,private juce::Timer {
    Vst2Instance& owner;juce::HWNDComponent surface;HWND handle=nullptr;bool opened=false;
    void timerCallback() override{
        if(!opened&&getPeer()&&isShowing()){
            handle=CreateWindowExW(0,L"STATIC",L"",WS_CHILD|WS_VISIBLE,0,0,getWidth(),getHeight(),static_cast<HWND>(getPeer()->getNativeHandle()),nullptr,GetModuleHandleW(nullptr),nullptr);
            if(!handle)return;surface.setHWND(handle);owner.dispatch(effEditOpen,0,0,handle);opened=true;
            Rect* rect=nullptr;owner.dispatch(effEditGetRect,0,0,&rect);
            if(rect&&rect->right>rect->left&&rect->bottom>rect->top)setSize(juce::jlimit(100,2560,rect->right-rect->left),juce::jlimit(80,1600,rect->bottom-rect->top));
        }
        if(opened)owner.dispatch(effEditIdle);
    }
public:
    explicit Vst2Editor(Vst2Instance& p):AudioProcessorEditor(p),owner(p){owner.editor=this;addAndMakeVisible(surface);setSize(750,550);startTimerHz(30);}
    ~Vst2Editor() override{stopTimer();owner.editor=nullptr;if(opened)owner.dispatch(effEditClose);surface.setHWND(nullptr);if(handle&&IsWindow(handle))DestroyWindow(handle);}
    void resized() override{surface.setBounds(getLocalBounds());}
};
#endif
juce::AudioProcessorEditor* Vst2Instance::createEditor(){
#if JUCE_WINDOWS
    if(hasEditor())return new Vst2Editor(*this);
#endif
    return new juce::GenericAudioProcessorEditor(*this);
}
intptr_t __cdecl Vst2Instance::host(legacy::AEffect* effect,int32_t opcode,int32_t index,intptr_t value,void* ptr,float opt){
    auto* instance=constructing?constructing:(effect?static_cast<Vst2Instance*>(effect->user):nullptr);
    switch(opcode){
        case audioMasterVersion:return 2400;
        case audioMasterGetSampleRate:return instance?static_cast<intptr_t>(instance->sampleRate):48000;
        case audioMasterGetBlockSize:return instance?instance->blockSize:256;
        case audioMasterGetTime:return instance?reinterpret_cast<intptr_t>(&instance->time):0;
        case audioMasterGetVendorString:case audioMasterGetProductString:if(ptr)juce::String("VocalStudio").copyToUTF8(static_cast<char*>(ptr),64);return 1;
        case audioMasterGetVendorVersion:return 1700;
        case audioMasterCanDo:if(ptr){const auto* name=static_cast<const char*>(ptr);if(std::strcmp(name,"sizeWindow")==0||std::strcmp(name,"sendVstTimeInfo")==0||std::strcmp(name,"startStopProcess")==0)return 1;}return 0;
        case audioMasterWillReplaceOrAccumulate:return 1;
        case audioMasterGetCurrentProcessLevel:return 2;
        case audioMasterGetLanguage:return kVstLangEnglish;
        case audioMasterAutomate:if(instance&&index>=0&&index<instance->getParameters().size())instance->getParameters()[index]->sendValueChangedMessageToListeners(opt);return 0;
        case audioMasterGetDirectory:return instance?reinterpret_cast<intptr_t>(instance->directory.toRawUTF8()):0;
        case audioMasterIOChanged:if(instance&&effect->numInputs==instance->getTotalNumInputChannels()&&effect->numOutputs==instance->getTotalNumOutputChannels()){instance->setLatencySamples(juce::jlimit(0,96000,effect->initialDelay));return 1;}return 0;
        case audioMasterSizeWindow:
            if(instance&&instance->editor&&index>0&&index<=2560&&value>0&&value<=1600){juce::Component::SafePointer<juce::AudioProcessorEditor> safe(instance->editor);juce::MessageManager::callAsync([safe,index,value]{if(safe)safe->setSize(index,static_cast<int>(value));});return 1;}return 0;
        default:return 0;
    }
}
class Vst2Format final : public juce::AudioPluginFormat {
public:
    juce::String getName() const override{return "VST2";}
    void findAllTypesForFile(juce::OwnedArray<juce::PluginDescription>& results,const juce::String& path) override{juce::String error;auto plugin=load(path,error);if(plugin)results.add(new juce::PluginDescription(plugin->description));}
    bool fileMightContainThisPluginType(const juce::String& path) override{return juce::File(path).hasFileExtension("dll")&&checkVst2Binary(juce::File(path)).isEmpty();}
    juce::String getNameOfPluginFromIdentifier(const juce::String& path) override{return juce::File(path).getFileNameWithoutExtension();}
    bool pluginNeedsRescanning(const juce::PluginDescription& d) override{return juce::File(d.fileOrIdentifier).getLastModificationTime()!=d.lastFileModTime;}
    bool doesPluginStillExist(const juce::PluginDescription& d) override{return juce::File(d.fileOrIdentifier).existsAsFile();}
    bool canScanForPlugins() const override{return true;}bool isTrivialToScan() const override{return false;}
    juce::StringArray searchPathsForPlugins(const juce::FileSearchPath& paths,bool recursive,bool) override{juce::StringArray result;for(int i=0;i<paths.getNumPaths();++i)for(const auto& file:paths[i].findChildFiles(juce::File::findFiles,recursive,"*.dll"))if(fileMightContainThisPluginType(file.getFullPathName()))result.addIfNotAlreadyThere(file.getFullPathName());return result;}
    juce::FileSearchPath getDefaultLocationsToSearch() override{juce::FileSearchPath paths;const auto root=juce::File::getSpecialLocation(juce::File::globalApplicationsDirectory);paths.add(root.getChildFile("VstPlugins"));paths.add(root.getChildFile("Steinberg/VstPlugins"));return paths;}
    bool requiresUnblockedMessageThreadDuringCreation(const juce::PluginDescription&) const override{return false;}
protected:
    void createPluginInstance(const juce::PluginDescription& desc,double rate,int size,PluginCreationCallback callback) override{juce::String error;auto instance=load(desc.fileOrIdentifier,error);if(instance&&instance->description.uniqueId!=desc.uniqueId){instance.reset();error="VST2 plugin identity changed";}if(instance)instance->setRateAndBufferSizeDetails(rate,size);callback(std::move(instance),error);}
private:
    static std::unique_ptr<Vst2Instance> load(const juce::String& path,juce::String& error){auto result=std::make_unique<Vst2Instance>();if(!result->initialise(juce::File(path),error))return {};return result;}
};
}
juce::String checkVst2Binary(const juce::File& file){
    juce::FileInputStream input(file);if(!input.openedOk())return juce::String::fromUTF8("Không đọc được DLL.");
    if(input.readShort()!=0x5a4d)return juce::String::fromUTF8("Không phải DLL Windows PE.");
    input.setPosition(0x3c);const auto offset=input.readInt();if(offset<64||offset>file.getSize()-24)return "Invalid PE header";
    input.setPosition(offset);if(input.readInt()!=0x4550)return "Invalid PE signature";
    const auto machine=static_cast<unsigned short>(input.readShort());
    if(machine==0x14c)return juce::String::fromUTF8("Đây là VST2 32-bit. App x64 cần DLL 64-bit; chưa có cầu nối 32-bit.");
    if(machine!=0x8664)return juce::String::fromUTF8("Chỉ hỗ trợ VST2 DLL Windows x64.");
    // Check exports without executing DllMain when scanning a folder full of
    // dependency DLLs. Only load binaries exposing the VST entry point.
    const auto optional=static_cast<juce::int64>(offset)+24;
    input.setPosition(offset+6);const int sectionCount=static_cast<unsigned short>(input.readShort());
    input.setPosition(offset+20);const int optionalSize=static_cast<unsigned short>(input.readShort());
    if(sectionCount<1||sectionCount>96||optionalSize<120)return "Invalid PE sections";
    input.setPosition(optional);if(static_cast<unsigned short>(input.readShort())!=0x20b)return "Invalid x64 PE optional header";
    input.setPosition(optional+112);const auto exportRva=static_cast<juce::uint32>(input.readInt());
    const auto sections=optional+optionalSize;
    auto offsetFor=[&](juce::uint32 rva)->juce::int64{
        for(int n=0;n<sectionCount;++n){input.setPosition(sections+40*n+12);const auto address=static_cast<juce::uint32>(input.readInt());const auto length=static_cast<juce::uint32>(input.readInt());const auto raw=static_cast<juce::uint32>(input.readInt());if(rva>=address&&static_cast<juce::uint64>(rva)-address<length){const auto value=static_cast<juce::int64>(raw)+rva-address;if(value>=0&&value<file.getSize())return value;}}
        return -1;
    };
    const auto exports=offsetFor(exportRva);if(!exportRva||exports<0)return juce::String::fromUTF8("DLL không có VSTPluginMain; không phải VST2 effect.");
    input.setPosition(exports+24);const auto count=static_cast<juce::uint32>(input.readInt());input.setPosition(exports+32);const auto names=offsetFor(static_cast<juce::uint32>(input.readInt()));
    if(names<0||count>65536||names+4LL*count>file.getSize())return "Invalid PE exports";
    for(juce::uint32 i=0;i<count;++i){input.setPosition(names+4LL*i);const auto name=offsetFor(static_cast<juce::uint32>(input.readInt()));if(name<0)continue;input.setPosition(name);char text[64]{};input.read(text,63);if(std::strcmp(text,"VSTPluginMain")==0||std::strcmp(text,"main")==0)return {};}
    return juce::String::fromUTF8("DLL không có VSTPluginMain; không phải VST2 effect.");
}
std::unique_ptr<juce::AudioPluginFormat> createVst2Format(){return std::make_unique<Vst2Format>();}
