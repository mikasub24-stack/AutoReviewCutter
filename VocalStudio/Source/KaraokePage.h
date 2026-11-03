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
    void probe(){browser.runAudioProbe();}
    std::uint64_t captured() const{return browser.capturedFrames();}
private:
    StudioMain& owner;YouTubeBrowser browser;
    juce::TextEditor search;
    juce::TextButton open,back,home,down,up,reset,advanced,devices,fx,antares,loadPlugin,mic,record,softReverb;
    juce::Label title,offset,key,status,musicLabel,micLabel,reverbLabel,delayLabel;
    juce::Slider music,micGain,reverb,delay;
    juce::ComboBox keySelect,scaleSelect;
    juce::ToggleButton autoKey;
    std::uint64_t revision=~std::uint64_t(0);int lastOffset=99,lastKey=-2;bool lastMinor=false,lastAd=false;
    void change(int);void timerCallback() override;void sendKey();
};
