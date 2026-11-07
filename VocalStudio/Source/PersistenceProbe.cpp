#include "MainComponent.h"
#include "VoiceSetup.h"
#include <cmath>
int StudioMain::persistenceProbe(const juce::String& mode){
    if(voiceSetup::argument("--test-settings-directory").isEmpty())return 2;
    const auto directory=juce::File(voiceSetup::argument("--test-settings-directory"));
    auto* report=new juce::DynamicObject;juce::String error;
    auto check=[&](bool valid,const char* message){if(!valid&&error.isEmpty())error=message;};
    const bool legacySeed=mode=="seed-legacy";
    if(legacySeed){
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
        engine.basicLivePreset();
        check(engine.pluginInstance()&&std::abs(engine.pluginInstance()->getParameters()[0]->getValue()-.31f)<.0001f,"basic preset changed tuner controls");
        check(engine.eqPluginInstance()&&std::abs(engine.eqPluginInstance()->getParameters()[0]->getValue()-.47f)<.0001f,"basic preset changed EQ plugin controls");
        check(engine.reverbPluginInstance()&&std::abs(engine.reverbPluginInstance()->getParameters()[0]->getValue()-.63f)<.0001f,"basic preset changed reverb plugin controls");
        engine.monitorDb=7;engine.shortReverb=.15f;engine.wetReturnDb=5;engine.musicDuckingDb=2.5f;engine.headphoneDb=2;engine.hiddenReverb=.035f;engine.masterDb=-2;
    }else{
        auto* tune=engine.pluginInstance();auto* eq=engine.eqPluginInstance();auto* verb=engine.reverbPluginInstance();
        const bool recovery=mode=="recovery";
        check(recovery?!tune:tune!=nullptr,"startup lost tuner");
        check(!eq&&!verb,"removed EQ/reverb plugins were restored into the app");
        check(std::abs(engine.headphoneDb.load()-2)<.001f&&std::abs(engine.hiddenReverb.load()-.035f)<.001f,"headphone/hidden room settings lost on restart");
        check(std::abs(engine.wetReturnDb.load()-5)<.001f&&std::abs(engine.musicDuckingDb.load()-2.5f)<.001f,"ambience return or music duck setting lost on app restart");
        if(!recovery){
            if(tune)check(std::abs(tune->getParameters()[0]->getValue()-.31f)<.0001f,"tuner parameter lost on app restart");
            if(eq)check(std::abs(eq->getParameters()[0]->getValue()-.47f)<.0001f,"EQ parameter lost on app restart");
            if(verb)check(std::abs(verb->getParameters()[0]->getValue()-.63f)<.0001f,"x86 reverb parameter lost on app restart");
            check(std::abs(engine.monitorDb.load()-7)<.001f&&std::abs(engine.shortReverb.load()-.15f)<.001f,"vocal controls lost on app restart");
        }
    }
    if(legacySeed){
        // Simulate a profile written by an older build with all three slots.
        // Subsequent real app launches must migrate it to tuner-only.
        const auto legacy=engine.projectState();
        check(engine.saveProject(projectFile).wasOk(),"write legacy project");
        const auto profile=voiceSetup::profile(legacy);
        check(voiceSetup::write(settings()->getFile().getSiblingFile("VoiceSetup.json"),profile).wasOk(),"write legacy voice profile");
        settings()->setValue("lastProject",projectFile.getFullPathName());settings()->setValue("rememberedSetup",juce::JSON::toString(profile));
        check(settings()->saveIfNeeded(),"write legacy preferences");
    }else check(save(),"UI save failed");
    const auto persisted=voiceSetup::read(settings()->getFile().getSiblingFile("VoiceSetup.json"));
    check(persisted["plugin"].isObject(),"save erased selected tuner");
    if(!legacySeed)check(!persisted["eqPlugin"].isObject()&&!persisted["reverbPlugin"].isObject(),"save retained removed auxiliary slots");
    const auto session=juce::JSON::parse(projectFile);check(session["plugin"].isObject(),"session erased retained tuner");if(!legacySeed)check(!session["eqPlugin"].isObject()&&!session["reverbPlugin"].isObject(),"session kept removed auxiliary slots");
    report->setProperty("mode",mode);report->setProperty("passed",error.isEmpty());report->setProperty("error",error);
    report->setProperty("tuner",selectedPluginName(0));report->setProperty("eq",selectedPluginName(1));report->setProperty("reverb",selectedPluginName(2));
    directory.getChildFile("Persistence-"+mode+".json").replaceWithText(juce::JSON::toString(juce::var(report)));
    return error.isEmpty()?0:1;
}
