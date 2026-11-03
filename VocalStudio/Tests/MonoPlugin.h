#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
// A native hosted-instance fixture for mono-only bus negotiation; no Antares code.
class MonoPluginFixture final : public juce::AudioPluginInstance {
public:
    MonoPluginFixture():AudioPluginInstance(BusesProperties().withInput("Mono input",juce::AudioChannelSet::mono(),true).withOutput("Mono output",juce::AudioChannelSet::mono(),true)){}
    const juce::String getName() const override{return "Mono-only host fixture";}
    void fillInPluginDescription(juce::PluginDescription& d) const override{d.name=getName();d.pluginFormatName="Host test fixture";d.manufacturerName="VocalStudio";d.version="1";d.uniqueId=19876;d.numInputChannels=1;d.numOutputChannels=1;}
    void prepareToPlay(double,int) override{}
    void releaseResources() override{}
    bool isBusesLayoutSupported(const BusesLayout& b) const override{return b.getMainInputChannelSet()==juce::AudioChannelSet::mono()&&b.getMainOutputChannelSet()==juce::AudioChannelSet::mono();}
    void processBlock(juce::AudioBuffer<float>& buffer,juce::MidiBuffer&) override{buffer.applyGain(.5f);}
    double getTailLengthSeconds() const override{return 0;}
    bool acceptsMidi() const override{return false;}
    bool producesMidi() const override{return false;}
    juce::AudioProcessorEditor* createEditor() override{return nullptr;}
    bool hasEditor() const override{return false;}
    int getNumPrograms() override{return 1;}
    int getCurrentProgram() override{return 0;}
    void setCurrentProgram(int) override{}
    const juce::String getProgramName(int) override{return {};}
    void changeProgramName(int,const juce::String&) override{}
    void getStateInformation(juce::MemoryBlock& b) override{b.reset();}
    void setStateInformation(const void*,int) override{}
};
