#pragma once
#include <juce_events/juce_events.h>
namespace voiceSetup {
inline constexpr const char* slots[]={"plugin","eqPlugin","reverbPlugin"};
inline juce::String argument(const char* key){const auto args=juce::StringArray::fromTokens(juce::JUCEApplicationBase::getCommandLineParameters(),true);const int i=args.indexOf(key);return i>=0&&i+1<args.size()?args[i+1].unquoted():juce::String{};}
inline juce::var merge(const juce::var& current,const juce::var& retained){auto result=current.clone();if(auto* object=result.getDynamicObject())for(const auto* key:slots)if(!result[key].isObject()&&retained[key].isObject())object->setProperty(key,retained[key].clone());if(result.isObject()&&!current["plugin"].isObject()&&retained["plugin"].isObject())for(const auto* key:{"toneLink","pluginBypassed","keyHold","songTonic","songMinor","songKeySource"})if(retained.hasProperty(key))result.getDynamicObject()->setProperty(key,retained[key].clone());return result;}
inline juce::var profile(const juce::var& state){auto result=state.clone();if(auto* object=result.getDynamicObject()){object->setProperty("tracks",juce::Array<juce::var>{});for(const auto* key:{"recoveringTake","recoveringStart","recoveringCalibration"})object->removeProperty(key);}return result;}
inline juce::Result write(const juce::File& file,const juce::var& state,bool backup=false){
    const auto json=juce::JSON::toString(state,true);
    if(file.existsAsFile()&&file.loadFileAsString()==json)return juce::Result::ok();
    if(file.getParentDirectory().createDirectory().failed())return juce::Result::fail("Cannot create settings directory: "+file.getParentDirectory().getFullPathName());
    juce::TemporaryFile temporary(file);
    if(!temporary.getFile().replaceWithText(json))return juce::Result::fail("Cannot write settings: "+file.getFullPathName());
    if(backup&&file.existsAsFile()&&juce::JSON::parse(file).isObject()&&!file.copyFileTo(file.getSiblingFile(file.getFileName()+".previous")))return juce::Result::fail("Cannot back up settings: "+file.getFullPathName());
    return temporary.overwriteTargetFileWithTemporary()?juce::Result::ok():juce::Result::fail("Cannot replace settings: "+file.getFullPathName());
}
inline juce::var read(const juce::File& file){auto state=juce::JSON::parse(file);if(!state.isObject())state=juce::JSON::parse(file.getSiblingFile(file.getFileName()+".previous"));return state;}
}
