#include "Vst2Host.h"
#include "Vst2BridgeProtocol.h"
#include <juce_gui_extra/juce_gui_extra.h>
#include <atomic>
#include <thread>
class BridgeApplication final:public juce::JUCEApplication {
    class EditorWindow final:public juce::DocumentWindow {
    public:
        EditorWindow(juce::AudioPluginInstance& plugin):DocumentWindow(plugin.getName(),juce::Colours::darkgrey,closeButton){setUsingNativeTitleBar(true);auto* editor=plugin.createEditorIfNeeded();if(!editor)editor=new juce::GenericAudioProcessorEditor(plugin);setContentOwned(editor,true);centreWithSize(juce::jmax(320,editor->getWidth()),juce::jmax(200,editor->getHeight()));setVisible(true);}
        void closeButtonPressed() override{setVisible(false);}
    };
    HANDLE mapping=nullptr,request=nullptr,response=nullptr,parent=nullptr;
    vstbridge::Shared* shared=nullptr;std::unique_ptr<juce::AudioPluginInstance> plugin;
    std::unique_ptr<EditorWindow> editor;std::thread worker;std::atomic<bool> stopping{false};
    bool prepared=false;juce::AudioBuffer<float> audio;juce::MidiBuffer midi;
    void syncParameters(bool apply){
        for(int i=0;i<plugin->getParameters().size();++i){auto* p=plugin->getParameters()[i];if(apply&&InterlockedExchange(&shared->dirty[i],0)!=0)p->setValue(vstbridge::number(InterlockedCompareExchange(&shared->pendingValues[i],0,0)));InterlockedExchange(&shared->parameterValues[i],vstbridge::bits(p->getValue()));}
    }
    void command(uint32_t cmd){
        shared->success=0;
        if(!plugin){shared->success=0;return;}
        if(cmd==vstbridge::process){
            if(!prepared||shared->frames>shared->block||shared->frames>vstbridge::maxFrames)return;
            syncParameters(true);float* channels[]={shared->audio[0],shared->audio[1]};
            audio.setDataToReferTo(channels,static_cast<int>(juce::jmax(shared->inputs,shared->outputs)),static_cast<int>(shared->frames));midi.clear();plugin->processBlock(audio,midi);syncParameters(false);shared->success=1;return;
        }
        // Administrative calls and native editors run on the helper UI thread.
        switch(cmd){
            case vstbridge::hello:break;
            case vstbridge::prepare:
                if(shared->block<16||shared->block>vstbridge::maxFrames||shared->rate<8000||shared->rate>384000)return;
                plugin->setPlayConfigDetails(static_cast<int>(shared->inputs),static_cast<int>(shared->outputs),shared->rate,static_cast<int>(shared->block));plugin->prepareToPlay(shared->rate,static_cast<int>(shared->block));prepared=true;break;
            case vstbridge::release:plugin->releaseResources();prepared=false;break;
            case vstbridge::reset:plugin->reset();break;
            case vstbridge::getState:{syncParameters(true);juce::MemoryBlock state;plugin->getStateInformation(state);if(state.getSize()>vstbridge::stateCapacity)return;shared->stateBytes=static_cast<uint32_t>(state.getSize());memcpy(shared->state,state.getData(),state.getSize());break;}
            case vstbridge::setState:if(shared->stateBytes>vstbridge::stateCapacity)return;for(int i=0;i<plugin->getParameters().size();++i)InterlockedExchange(&shared->dirty[i],0);plugin->setStateInformation(shared->state,static_cast<int>(shared->stateBytes));break;
            case vstbridge::showEditor:if(!editor)editor=std::make_unique<EditorWindow>(*plugin);editor->setVisible(true);editor->toFront(true);break;
            case vstbridge::hideEditor:if(editor)editor->setVisible(false);break;
            case vstbridge::quit:stopping=true;juce::MessageManager::callAsync([]{juce::JUCEApplication::getInstance()->quit();});break;
            default:return;
        }
        shared->latency=static_cast<uint32_t>(juce::jlimit(0,768000,plugin->getLatencySamples()));shared->tail=plugin->getTailLengthSeconds();syncParameters(false);shared->success=1;
    }
public:
    const juce::String getApplicationName() override{return "VocalStudioBridge32";}
    const juce::String getApplicationVersion() override{return "1.9.0";}
    bool moreThanOneInstanceAllowed() override{return true;}
    void initialise(const juce::String& commandLine) override{
        const auto args=juce::StringArray::fromTokens(commandLine,true);
        auto arg=[&](const char* key){const int i=args.indexOf(key);return i>=0&&i+1<args.size()?args[i+1].unquoted():juce::String{};};
        const auto id=arg("--session");if(id.isEmpty()){setApplicationReturnValue(1);quit();return;}
        mapping=OpenFileMappingW(FILE_MAP_ALL_ACCESS,FALSE,vstbridge::name(id,"-memory").toWideCharPointer());
        request=OpenEventW(SYNCHRONIZE|EVENT_MODIFY_STATE,FALSE,vstbridge::name(id,"-request").toWideCharPointer());response=OpenEventW(SYNCHRONIZE|EVENT_MODIFY_STATE,FALSE,vstbridge::name(id,"-response").toWideCharPointer());
        parent=OpenProcess(SYNCHRONIZE,FALSE,static_cast<DWORD>(arg("--parent").getLargeIntValue()));
        if(mapping)shared=static_cast<vstbridge::Shared*>(MapViewOfFile(mapping,FILE_MAP_ALL_ACCESS,0,0,sizeof(vstbridge::Shared)));
        if(!shared||!request||!response||!parent||shared->protocol!=vstbridge::version){setApplicationReturnValue(2);quit();return;}
        auto format=createVst2Format();juce::OwnedArray<juce::PluginDescription> descriptions;format->findAllTypesForFile(descriptions,arg("--plugin"));
        if(descriptions.isEmpty()){setApplicationReturnValue(3);quit();return;}
        juce::String error;juce::AudioPluginFormatManager manager;manager.addFormat(format.release());plugin=manager.createPluginInstance(*descriptions[0],48000,256,error);
        if(!plugin||plugin->getParameters().size()>vstbridge::maxParams){setApplicationReturnValue(4);quit();return;}
        auto* meta=new juce::DynamicObject;meta->setProperty("description",plugin->getPluginDescription().createXml()->toString());
        juce::Array<juce::var> params;
        for(auto* p:plugin->getParameters()){auto* v=new juce::DynamicObject;v->setProperty("name",p->getName(256));v->setProperty("label",p->getLabel());v->setProperty("default",p->getDefaultValue());params.add(juce::var(v));}
        meta->setProperty("parameters",params);const auto json=juce::JSON::toString(juce::var(meta));
        if(json.getNumBytesAsUTF8()>=vstbridge::metadataSize){setApplicationReturnValue(5);quit();return;}
        shared->metadataBytes=static_cast<uint32_t>(json.getNumBytesAsUTF8());memcpy(shared->metadata,json.toRawUTF8(),shared->metadataBytes);
        shared->inputs=static_cast<uint32_t>(plugin->getTotalNumInputChannels());shared->outputs=static_cast<uint32_t>(plugin->getTotalNumOutputChannels());shared->parameterCount=static_cast<uint32_t>(plugin->getParameters().size());syncParameters(false);
        worker=std::thread([this]{HANDLE events[]={request,parent};while(!stopping){const auto event=WaitForMultipleObjects(2,events,FALSE,500);if(event==WAIT_TIMEOUT)continue;if(event!=WAIT_OBJECT_0){juce::MessageManager::callAsync([]{juce::JUCEApplication::getInstance()->quit();});break;}if(stopping)break;
                const auto cmd=shared->command;
                if(cmd==vstbridge::process){try{command(cmd);}catch(...){shared->success=0;}}
                else{
                    const auto done=CreateEventW(nullptr,FALSE,FALSE,nullptr);
                    if(!done)break;
                    juce::MessageManager::callAsync([this,cmd,done]{try{command(cmd);}catch(...){shared->success=0;}SetEvent(done);});
                    WaitForSingleObject(done,INFINITE);CloseHandle(done);
                }
                SetEvent(response);}});
    }
    void shutdown() override{
        stopping=true;if(worker.joinable()){SetEvent(request);while(!workerDone()){MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}juce::Thread::sleep(1);}worker.join();}
        editor.reset();if(plugin)plugin->releaseResources();plugin.reset();
        if(shared)UnmapViewOfFile(shared);if(mapping)CloseHandle(mapping);if(request)CloseHandle(request);if(response)CloseHandle(response);if(parent)CloseHandle(parent);
    }
    bool workerDone(){return WaitForSingleObject(static_cast<HANDLE>(worker.native_handle()),0)==WAIT_OBJECT_0;}
    void anotherInstanceStarted(const juce::String&) override{}
};
START_JUCE_APPLICATION(BridgeApplication)
