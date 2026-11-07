#pragma once
#include "Engine.h"
#include <deque>

class StudioLook final : public juce::LookAndFeel_V4 {
public:
    StudioLook();
    void drawRotarySlider(juce::Graphics&,int,int,int,int,float,float,float,juce::Slider&) override;
};
class StudioMain;
class TrackCanvas final : public juce::Component {
public:
    explicit TrackCanvas(StudioMain&);
    void paint(juce::Graphics&) override;
    void mouseDown(const juce::MouseEvent&) override;
    void mouseDrag(const juce::MouseEvent&) override;
    void mouseUp(const juce::MouseEvent&) override;
    void mouseWheelMove(const juce::MouseEvent&,const juce::MouseWheelDetails&) override;
    double zoom=65,scrollSeconds=0;
    bool dragging=false;
    static constexpr int headerWidth=178,rowHeight=92,rulerHeight=36;
private:
    StudioMain& owner;
    int dragMode=0,dragTrack=-1;
    double originalStart=0,originalIn=0,originalOut=0;
    float mouseStart=0;
};
struct SongFitPlan {vocal::SongFit fit;std::vector<int> beats;std::vector<juce::String> beatTokens;int melody=-1,tonic=-1;bool minor=false;juce::String melodyToken;vocal::VoiceProfile profile;};
class StudioMain final : public juce::Component,private juce::Timer,private juce::ScrollBar::Listener,public juce::FileDragAndDropTarget {
public:
    explicit StudioMain(bool recoveryMode=false);
    ~StudioMain() override;
    void paint(juce::Graphics&) override;
    void resized() override;
    bool keyPressed(const juce::KeyPress&) override;
    bool isInterestedInFileDrag(const juce::StringArray&) override;
    void filesDropped(const juce::StringArray&,int,int) override;
    void selectTrack(int);
    void importAudio(const juce::File&,bool vocal);
    void record();
    void stop();
    bool save();
    void status(const juce::String&);
    juce::String userStatus() const{return currentStatus;}
    bool isBusy() const noexcept {return busy;}
    bool isExporting() const noexcept {return exporting;}
    bool canEdit() const {return !busy&&!engine.isPlaying()&&!engine.isRecording();}
    void refreshTracks();
    void rememberEdit(int,double,double,double,double,double,double);
    void prepareToClose(std::function<void()>);
    void loadDemo();
    void showVocalTools();
    void showAutoEq();
    void showPolish();void exportVocal();
    void autoMixVocal();void previewAutoMix(bool);
    bool hasAutoMix() const {return mixReady&&mixSession==projectFile.getFullPathName();}
    void showTuneFix();
    void listenAutoEq();void pauseMusicForEq();
    void recordAutoEq();void analyseAutoEq();void previewAutoEq(bool);void saveAutoEq();void loadAutoEq();void cancelAutoEq();
    vocal::EqRecommendation eqSuggestion;juce::String eqStatus;
    bool eqRecording=false,eqPreview=false;

    void learnVoiceFromSelected();
    void recordVoiceSample();
    void planSongFit(int beat,int melody,bool allBacking);
    void applySongFitPlan();
    void loadVoicePreference();
    void setComfortableRange(double low,double high);
    void finishCalibration(bool success);
    void openSoundCard(){showDevices();}
    juce::PropertiesFile* settings(){return preferences.getUserSettings();}
    void showQuickMode(bool);
    bool validateQuickControls() const;
    void startBrowserProbe();
    std::uint64_t browserCaptured() const;
    float browserPeak() const;
    void chooseAntaresPlugin(){choosePlugin();}
    void openAntaresEditor(){showPlugin();}
    void chooseReverbPlugin(){choosePlugin(1);}
    void chooseEqPlugin(){choosePlugin(2);}
    void openEqEditor();void clearEqPlugin();
    void scanPlugins(int slot);
    juce::String selectedPluginName(int slot);
    juce::String savedVoiceSummary();
    int persistenceProbe(const juce::String&);
    void lowLatencyMonitoring();
    void openReverbEditor();
    void clearReverbPlugin();
    std::shared_ptr<SongFitPlan> fitPlan;
    juce::String fitStatus;
    void analyseSelected();
    void applyPitch(const vocal::PitchOptions&);
    void restorePitch();
    void cancelToolsWork(){cancelExport.store(true);}
    float toolsProgress() const {return exportProgress.load();}
    void saveToolScreenshots(const juce::File&);
    std::shared_ptr<const vocal::PitchAnalysis> pitchAnalysis;
    juce::String toneStatus;
    StudioEngine engine;
    TrackCanvas canvas;
    int selected=-1;
private:
    bool mixReady=false;
    juce::String mixSession;
    vocal::VocalParameters mixBefore,mixAfter;
    struct Edit {int track;double beforeStart,beforeIn,beforeOut,afterStart,afterIn,afterOut;};
    struct Knob {juce::Label label;juce::Slider slider;std::atomic<float>* value=nullptr;};
    std::unique_ptr<juce::Component> karaoke;
    juce::TextButton quickButton{"YouTube / Hat"};
    StudioLook look;
    juce::ApplicationProperties preferences;
    juce::ThreadPool jobs{1};
    juce::Viewport viewport;
    juce::ScrollBar horizontal{false};
    juce::TextButton playButton{juce::String::fromUTF8("Phát")},stopButton{juce::String::fromUTF8("Dừng")},recordButton{"THU"},importButton{juce::String::fromUTF8("Nhập beat")},saveButton{juce::String::fromUTF8("Lưu")},openButton{juce::String::fromUTF8("Mở")},newButton{juce::String::fromUTF8("Mới")},exportButton{juce::String::fromUTF8("Xuất WAV")},deviceButton{"Sound card"},undoButton{juce::String::fromUTF8("Hoàn tác")};
    juce::TextButton toolsButton{juce::String::fromUTF8("Vang / Tone / Chỉnh phô")};
    juce::TextButton pluginButton{juce::String::fromUTF8("Nạp VST2/3")},editorButton{juce::String::fromUTF8("Mở FX")},removePluginButton{juce::String::fromUTF8("Bỏ VST3")};
    juce::ToggleButton monitoring{juce::String::fromUTF8("Kiểm âm FX")},bypass{"Bypass vocal FX"},mute{"Mute"},solo{"Solo"},vocalType{juce::String::fromUTF8("Track giọng hát")};
    juce::ComboBox inputSelect,presetSelect;
    juce::Slider trackGain,trackPan,master,zoom;
    juce::Label trackTitle,trackInfo,positionLabel,deviceLabel,statusLabel,pluginLabel,gainLabel,panLabel,masterLabel;
    std::array<std::unique_ptr<Knob>,10> knobs;
    std::unique_ptr<juce::FileChooser> chooser;
    std::unique_ptr<juce::DocumentWindow> deviceWindow,pluginWindow,reverbWindow,eqPluginWindow,toolsWindow,eqWindow,polishWindow,tuneFixWindow;
    vocal::EqSettings eqBefore,eqRestore,eqLast;
    juce::String eqSession,eqSourceFile;int eqSource=-1;
    juce::File projectFile;
    std::deque<Edit> undo,redo;
    std::deque<std::pair<juce::File,bool>> importQueue;
    std::atomic<bool> cancelExport{false};
    std::atomic<float> exportProgress{0};
    bool busy=false,exporting=false,closing=false,calibrating=false;
    double calibrationDeadline=0;
    bool setupRestoreFailed=false,startupLoading=true;
    juce::var retainedPluginSetup;
    int autosaveTicks=0;
    float shownInput=0,shownOutput=0;
    juce::String currentStatus;
    void timerCallback() override;
    void scrollBarMoved(juce::ScrollBar*,double start) override {canvas.scrollSeconds=start;canvas.repaint();}
    void chooseAudio();
    void chooseProject();
    void chooseExport();
    void choosePlugin(int slot=0);
    void loadPluginPath(const juce::File&,int slot);
    void showDevices();
    void showPlugin();
    void newSession();
    void refreshInspector();
    void syncKnobs();
    void undoEdit(bool redoIt=false);
    void runJob(std::function<void()>,std::function<void()>);
    void finishTake(std::function<void()> after={});
    void setBusy(bool,const juce::String& message={});
    void persistDeviceSettings();
    void addKnob(int,const juce::String&,std::atomic<float>&,double,double,double,const juce::String& suffix={});
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(StudioMain)
};
