#pragma once
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_audio_processors/juce_audio_processors.h>
#include "Dsp.h"
#include "LiveMusic.h"
#include "Pitch.h"
#include "VoiceFit.h"
#include "PluginTone.h"
#include <atomic>
#include <functional>
#include <memory>
#include <vector>

struct StudioTrack {
    juce::File file,originalFile;
    double originalTrimIn=0,originalTrimOut=0;
    juce::String name;
    juce::AudioBuffer<float> audio;
    std::vector<float> peaks;
    double sourceRate=48000, start=0, trimIn=0, trimOut=0;
    bool vocal=false;
    std::atomic<float> gainDb{0}, pan{0};
    std::atomic<bool> mute{false}, solo{false};
    float leftGain=1,rightGain=1;
    double duration() const noexcept {return juce::jmax(0.0,trimOut-trimIn);}
};

class StudioEngine final : public juce::AudioIODeviceCallback {
public:
    StudioEngine();
    ~StudioEngine() override;
    juce::AudioDeviceManager devices;
    juce::AudioFormatManager formats;
    juce::AudioPluginFormatManager pluginFormats;
    juce::String openDevice(const juce::String& savedXml={});
    void prepareForTest(double sampleRate=48000,int blockSize=256);
    void withAudioStopped(const std::function<void()>& edit);
    juce::Result readTrack(const juce::File&,bool vocal,std::unique_ptr<StudioTrack>& result);
    void addTrack(std::unique_ptr<StudioTrack>);
    void removeTrack(int index);
    void replaceTrack(int,std::unique_ptr<StudioTrack>);
    void replaceTracks(std::vector<std::pair<int,std::unique_ptr<StudioTrack>>>);
    juce::Result analyseTrack(int,vocal::PitchAnalysis&,std::atomic<bool>&,std::atomic<float>&);
    juce::Result renderPitchTrack(int,const vocal::PitchOptions&,std::unique_ptr<StudioTrack>&,std::atomic<bool>&,std::atomic<float>&);
    juce::Result restoreOriginalTrack(int,std::unique_ptr<StudioTrack>&);
    const std::vector<std::unique_ptr<StudioTrack>>& getTracks() const noexcept {return tracks;}
    juce::Result play();
    juce::Result ensureSampleRate();
    void stop();
    void seek(double seconds);
    bool isPlaying() const noexcept {return playing.load();}
    bool isRecording() const noexcept {return recording.load();}
    bool hasUnfinishedTake() const noexcept {return writer!=nullptr;}
    double position() const noexcept {return static_cast<double>(positionFrames.load())/sampleRate.load();}
    double duration() const noexcept;
    double effectTailSeconds() const noexcept;
    juce::Result startRecording(const juce::File& directory);
    juce::Result finishRecording(juce::File& completed,double& startSeconds);
    juce::Result exportMix(const juce::File&,std::atomic<bool>& cancel,std::atomic<float>& progress);
    juce::Result installPlugin(std::unique_ptr<juce::AudioPluginInstance>);
    void removePlugin();
    std::shared_ptr<vocal::LiveMusic> liveMusic=std::make_shared<vocal::LiveMusic>();
    std::atomic<bool> liveMode{false};
    juce::Result setLiveSongKey(int tonic,bool minor);
    vocal::VoiceProfile voiceProfile;
    PluginToneLink toneLink;
    int songTonic=-1;bool songMinor=false;
    juce::String songKeySource,toneLinkStatus;
    bool isPluginBypassed() const noexcept {return pluginBypassed.load();}
    bool isAntaresActive() const;
    void setPluginBypassed(bool);
    juce::Result setSongKey(int tonic,bool minor,const juce::String& source);
    juce::Result sendSongKey();
    void scanToneLink();
    int effectivePluginLatency() const noexcept {return (pluginBypassed.load()||calibrationInputOnly.load())?0:pluginLatency.load();}
    juce::AudioPluginInstance* pluginInstance() const noexcept {return plugin.get();}
    juce::String pluginName() const {return plugin ? plugin->getName() : juce::String::fromUTF8("VST3: chưa chọn");}
    juce::StringArray inputNames() const;
    double rate() const noexcept {return sampleRate.load();}
    int blockSize() const noexcept {return currentBlock.load();}
    double latencyMs() const noexcept;
    juce::String deviceSummary() const;
    void selectPreset(int index);
    void setSessionDirectory(juce::File dir) {sessionDirectory=std::move(dir);}
    const juce::File& session() const noexcept {return sessionDirectory;}
    juce::Result saveProject(const juce::File&);
    juce::Result loadProject(const juce::File&);
    void newProject();
    juce::var projectState() const;
    void createDemo();

    std::atomic<bool> calibrationInputOnly{false};
    std::atomic<bool> monitor{false},fxBypass{false},latencyCompensation{true};
    std::atomic<int> inputChannel{0},recordingFault{0};
    std::atomic<float> inputDb{0},highPass{80},warmth{-2},presence{2},threshold{-18},ratio{3},makeup{2},deEss{.35f},reverb{.10f},delay{.04f},delayMs{240},masterDb{-3},manualOffsetMs{0};
    std::atomic<float> decaySeconds{1.2f},preDelayMs{20},damping{.65f},width{1},delayFeedback{.27f},deharsh{0};
    std::atomic<float> inputPeak{0},outputPeak{0},inputRms{0},gainReduction{0};
    std::atomic<bool> inputClipped{false},inputPresent{false};
    std::atomic<juce::int64> capturedFrames{0};
    juce::String lastDeviceError;
    void audioDeviceIOCallbackWithContext(const float* const*,int,float* const*,int,int,const juce::AudioIODeviceCallbackContext&) override;
    void audioDeviceAboutToStart(juce::AudioIODevice*) override;
    void audioDeviceStopped() override;
    void audioDeviceError(const juce::String&) override;
private:
    void prepare(double,int);
    void resetProcessing();
    void processChunk(const float*,float* const*,int,int,bool,bool);
    vocal::VocalParameters parameters() const noexcept;
    std::vector<std::unique_ptr<StudioTrack>> tracks;
    std::atomic<double> sampleRate{48000},pluginTailSeconds{0};
    std::atomic<int> pluginInputs{2},pluginOutputs{2};
    std::atomic<int> currentBlock{256},driverInputLatency{0},driverOutputLatency{0},pluginLatency{0};
    std::atomic<juce::int64> positionFrames{0};
    std::atomic<bool> playing{false},recording{false},pluginBypassed{false};
    juce::TimeSliceThread diskThread{"Vocal recording writer"};
    std::unique_ptr<juce::AudioFormatWriter::ThreadedWriter> writer;
    std::atomic<juce::AudioFormatWriter::ThreadedWriter*> activeWriter{nullptr};
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    juce::AudioBuffer<float> vocalBus,musicBus,monoInput;
    juce::MidiBuffer midi;
    vocal::VocalChain playbackFx,monitorFx,vocalAmbience;
    vocal::Limiter limiter;
    std::array<vocal::Delay,2> musicDelay;
    juce::File sessionDirectory,recordFile;
    double recordStart=0;
    float currentMaster=1,smoothing=.001f;
    bool callbackAttached=false,offline=false,testMode=false,heldForUnknownKey=false;
    std::atomic<bool> suspending{false};
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(StudioEngine)
};
