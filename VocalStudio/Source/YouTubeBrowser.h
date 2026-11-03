#pragma once
#include <juce_gui_extra/juce_gui_extra.h>
#include "LiveMusic.h"
class YouTubeBrowser final : public juce::Component,private juce::Timer {
public:
    explicit YouTubeBrowser(std::shared_ptr<vocal::LiveMusic>);
    ~YouTubeBrowser() override;
    void navigate(const juce::String& searchOrURL);
    void back();void pause();void home();
    void resized() override;
    void paint(juce::Graphics&) override;
    juce::String address() const;
    juce::String error() const;
    bool advertisement() const;
    std::uint64_t capturedFrames() const;
    void runAudioProbe();
private:
    struct Impl;std::unique_ptr<Impl> impl;
    void timerCallback() override;
};
// Called by the sandboxed Chromium bootstrap before JUCE's single-instance code.
int runBrowserApplication(void* instance,wchar_t* commandLine,int show,void* sandbox);
