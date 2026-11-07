#pragma once
#include "MainComponent.h"
#include "YouTubeBrowser.h"
class KaraokePage final : public juce::Component,private juce::Timer {
public:
    explicit KaraokePage(StudioMain&);
    ~KaraokePage() override;
    void resized() override;
    void paint(juce::Graphics&) override;
    void leave();
    void persist();
    bool validateControls() const;
    void pauseMusic(){browser.pause();}
    void probe(){browser.runAudioProbe();}
    float capturedPeak() const{return browser.capturedPeak();}
    std::uint64_t captured() const{return browser.capturedFrames();}
private:
    StudioMain& owner;YouTubeBrowser browser;
    juce::TextEditor search;
    juce::TextButton open,back,home,down,up,reset,advanced,devices,fx,antares,loadPlugin,mic,record,softReverb,autoEq,polish,fixTune,livePreset,loadReverb,editReverb,removeReverb,saveVoice,scanTune,scanEq,scanReverb,editEq,removeEq,lowLatency,enableTune,smoothPreset;
    juce::Label reverbPluginMixLabel,monitorHint,title,offset,key,musicLabel,micLabel,reverbLabel,delayLabel,monitorLabel,shortLabel,compressionLabel,colourLabel,duckLabel;
    juce::TextEditor status;
    juce::Viewport sidebar;juce::Component controls;
    juce::ComboBox input,colour;
    juce::AudioPluginInstance* lastPlugin=nullptr;
    juce::Slider music,micGain,reverb,delay,monitorLevel,shortRoom,compression,reverbMix,musicDuck;
    juce::ComboBox keySelect,scaleSelect;
    juce::ToggleButton autoKey,keepPluginKey;
    std::uint64_t revision=~std::uint64_t(0);int lastKey=-2;bool lastMinor=false;
    void change(int);void timerCallback() override;void sendKey();
};
