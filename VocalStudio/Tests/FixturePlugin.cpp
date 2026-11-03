#include <juce_audio_processors/juce_audio_processors.h>
#include <array>
#include <cstring>
// Some tuning controls are public controller values but disallow continuous automation.
class PublicStaticChoice final : public juce::AudioParameterChoice {public:using juce::AudioParameterChoice::AudioParameterChoice;bool isAutomatable() const noexcept override{return false;}};
class Fixture final : public juce::AudioProcessor {
public:
    Fixture():AudioProcessor(BusesProperties().withInput("Input",juce::AudioChannelSet::stereo(),true).withOutput("Output",juce::AudioChannelSet::stereo(),true)){setLatencySamples(64);root=new PublicStaticChoice("rootKey","Key",juce::StringArray{"A","Bb","B","C","Db","D","Eb","E","F","Gb","G","Ab"},3);scale=new PublicStaticChoice("tuneScale","Scale",juce::StringArray{"Chromatic","Minor","Major"},2);addParameter(root);addParameter(scale);addParameter(new juce::AudioParameterChoice("presetDistractor","Preset",juce::StringArray{"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"},0));}
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
    void getStateInformation(juce::MemoryBlock& b) override {juce::MemoryOutputStream out(b,false);out.writeFloat(gain);out.writeInt(root->getIndex());out.writeInt(scale->getIndex());}
    void setStateInformation(const void* data,int size) override{if(size>=12){juce::MemoryInputStream in(data,static_cast<std::size_t>(size),false);gain=in.readFloat();*root=juce::jlimit(0,11,in.readInt());*scale=juce::jlimit(0,2,in.readInt());}}
private:
    juce::AudioParameterChoice* root=nullptr;juce::AudioParameterChoice* scale=nullptr;
    std::array<std::array<float,64>,2> memory{};std::size_t cursor=0;float gain=.5f;
};
juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter(){return new Fixture();}
