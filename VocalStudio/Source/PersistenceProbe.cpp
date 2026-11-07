#include "MainComponent.h"
#include "VoiceSetup.h"
#include <cmath>
int StudioMain::persistenceProbe(const juce::String& mode){
    if(voiceSetup::argument("--test-settings-directory").isEmpty())return 2;
    const auto directory=juce::File(voiceSetup::argument("--test-settings-directory"));
    auto* report=new juce::DynamicObject;juce::String error;
    auto check=[&](bool valid,const char* message){if(!valid&&error.isEmpty())error=message;};
    if(mode=="seed"){
        const char* filenames[]={"Tune.dll","Eq.dll","Verb32.dll"};
        const float values[]={.31f,.47f,.63f};
        for(int slot=0;slot<3;++slot){
            juce::OwnedArray<juce::PluginDescription> found;
            for(int i=0;i<engine.pluginFormats.getNumFormats();++i)if(engine.pluginFormats.getFormat(i)->getName()=="VST2")engine.pluginFormats.getFormat(i)->findAllTypesForFile(found,directory.getChildFile(filenames[slot]).getFullPathName());
            check(found.size()==1,"fixture scan failed");if(found.isEmpty())break;
            juce::String failure;auto plugin=engine.pluginFormats.createPluginInstance(*found[0],engine.rate(),engine.blockSize(),failure);check(plugin!=nullptr,"fixture load failed");if(!plugin)break;
            const auto result=slot==0?engine.installPlugin(std::move(plugin)):slot==1?engine.installEqPlugin(std::move(plugin)):engine.installReverbPlugin(std::move(plugin));
            check(result.wasOk(),"fixture install failed");
            auto* active=slot==0?engine.pluginInstance():slot==1?engine.eqPluginInstance():engine.reverbPluginInstance();
            if(active)active->getParameters()[0]->setValue(values[slot]);
        }
        engine.monitorDb=7;engine.shortReverb=.15f;engine.masterDb=-2;
    }else{
        auto* tune=engine.pluginInstance();auto* eq=engine.eqPluginInstance();auto* verb=engine.reverbPluginInstance();
        const bool recovery=mode=="recovery";
        check(recovery?(!tune&&!eq&&!verb):(tune&&verb),"startup lost expected plugin slots");
        if(!recovery){
            check(mode=="missing-eq"?!eq:eq!=nullptr,"EQ restore availability mismatch");
            if(tune)check(std::abs(tune->getParameters()[0]->getValue()-.31f)<.0001f,"tuner parameter lost on app restart");
            if(eq)check(std::abs(eq->getParameters()[0]->getValue()-.47f)<.0001f,"EQ parameter lost on app restart");
            if(verb)check(std::abs(verb->getParameters()[0]->getValue()-.63f)<.0001f,"x86 reverb parameter lost on app restart");
            check(std::abs(engine.monitorDb.load()-7)<.001f&&std::abs(engine.shortReverb.load()-.15f)<.001f,"vocal controls lost on app restart");
        }
    }
    check(save(),"UI save failed");
    const auto persisted=voiceSetup::read(settings()->getFile().getSiblingFile("VoiceSetup.json"));
    for(const auto* slot:voiceSetup::slots)check(persisted[slot].isObject(),"save erased a selected plugin slot");
    const auto session=juce::JSON::parse(projectFile);for(const auto* slot:voiceSetup::slots)check(session[slot].isObject(),"session save erased retained plugin");
    report->setProperty("mode",mode);report->setProperty("passed",error.isEmpty());report->setProperty("error",error);
    report->setProperty("tuner",selectedPluginName(0));report->setProperty("eq",selectedPluginName(1));report->setProperty("reverb",selectedPluginName(2));
    directory.getChildFile("Persistence-"+mode+".json").replaceWithText(juce::JSON::toString(juce::var(report)));
    return error.isEmpty()?0:1;
}
