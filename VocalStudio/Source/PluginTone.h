#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <array>
#include <vector>
struct PluginToneLink {
    bool enabled=true;
    juce::String identity,keyId,scaleId;
    std::array<float,12> notes;
    float major=-1,minor=-1;
    PluginToneLink(){notes.fill(-1);}
    bool complete() const noexcept;
    juce::var state() const;
    static PluginToneLink fromState(const juce::var&);
};
struct PluginControl {juce::String id,name;float value=0;};
juce::String pluginToneIdentity(const juce::AudioPluginInstance&);
std::vector<PluginControl> pluginToneControls(juce::AudioPluginInstance&);
PluginToneLink discoverPluginTone(juce::AudioPluginInstance&);
juce::Result applyPluginTone(juce::AudioPluginInstance&,const PluginToneLink&,int tonic,bool minor);
