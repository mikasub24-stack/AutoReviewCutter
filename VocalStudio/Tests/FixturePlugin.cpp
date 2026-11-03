#include <juce_audio_processors/juce_audio_processors.h>
#include <array>
#include <cstring>
class Fixture final : public juce::AudioProcessor {
public:
    Fixture():AudioProcessor(BusesProperties().withInput("Input",juce::AudioChannelSet::stereo(),true).withOutput("Output",juce::AudioChannelSet::stereo(),true)){setLatencySamples(64);}
    const juce::String getName() const override{return "VocalStudio Test Gain";}
    void prepareToPlay(double,int) override {reset();}
    void releaseResources() override{}
    void reset() override {for(auto& c:memory)c.fill(0);cursor=0;}
    bool isBusesLayoutSupported(const BusesLayout& b) const override{return b.getMainInputChannelSet()==juce::AudioChannelSet::stereo()&&b.getMainOutputChannelSet()==juce::AudioChannelSet::stereo();}
    void processBlock(juce::AudioBuffer<float>& buffer,juce::MidiBuffer&) override {for(int i=0;i<buffer.getNumSamples();++i){for(int c=0;c<2;++c){const float sample=buffer.getSample(c,i);buffer.setSample(c,i,memory[static_cast<std::size_t>(c)][cursor]*gain);memory[static_cast<std::size_t>(c)][cursor]=sample;}cursor=(cursor+1)%64;}}
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
    void getStateInformation(juce::MemoryBlock& b) override {b.setSize(sizeof(gain));std::memcpy(b.getData(),&gain,sizeof(gain));}
    void setStateInformation(const void* data,int size) override{if(size==sizeof(gain))std::memcpy(&gain,data,sizeof(gain));}
private:
    std::array<std::array<float,64>,2> memory{};std::size_t cursor=0;float gain=.5f;
};
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter(){return new Fixture();}
