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
class StudioMain final : public juce::Component,private juce::Timer,private juce::ScrollBar::Listener,public juce::FileDragAndDropTarget {
public:
    StudioMain();
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
    void save();
    void status(const juce::String&);
    bool canEdit() const {return !busy&&!engine.isPlaying()&&!engine.isRecording();}
    void refreshTracks();
    void rememberEdit(int,double,double,double,double,double,double);
    void prepareToClose(std::function<void()>);
    void loadDemo();
    StudioEngine engine;
    TrackCanvas canvas;
    int selected=-1;
private:
    struct Edit {int track;double beforeStart,beforeIn,beforeOut,afterStart,afterIn,afterOut;};
    struct Knob {juce::Label label;juce::Slider slider;std::atomic<float>* value=nullptr;};
    StudioLook look;
    juce::ApplicationProperties preferences;
    juce::ThreadPool jobs{1};
    juce::Viewport viewport;
    juce::ScrollBar horizontal{false};
    juce::TextButton playButton{"Phát"},stopButton{"Dừng"},recordButton{"THU"},importButton{"Nhập beat"},saveButton{"Lưu"},openButton{"Mở"},newButton{"Mới"},exportButton{"Xuất WAV"},deviceButton{"Sound card"},undoButton{"Hoàn tác"};
    juce::TextButton pluginButton{"Nạp VST3"},editorButton{"Mở FX"},removePluginButton{"Bỏ VST3"};
    juce::ToggleButton monitoring{"Kiểm âm FX"},bypass{"Bypass vocal FX"},mute{"Mute"},solo{"Solo"},vocalType{"Track giọng hát"};
    juce::ComboBox inputSelect,presetSelect;
    juce::Slider trackGain,trackPan,master,zoom;
    juce::Label trackTitle,trackInfo,positionLabel,deviceLabel,statusLabel,pluginLabel,gainLabel,panLabel,masterLabel;
    std::array<std::unique_ptr<Knob>,10> knobs;
    std::unique_ptr<juce::FileChooser> chooser;
    std::unique_ptr<juce::DocumentWindow> deviceWindow,pluginWindow;
    juce::File projectFile;
    std::deque<Edit> undo,redo;
    std::deque<std::pair<juce::File,bool>> importQueue;
    std::atomic<bool> cancelExport{false};
    std::atomic<float> exportProgress{0};
    bool busy=false,exporting=false,closing=false;
    int autosaveTicks=0;
    float shownInput=0,shownOutput=0;
    juce::String currentStatus;
    void timerCallback() override;
    void scrollBarMoved(juce::ScrollBar*,double start) override {canvas.scrollSeconds=start;canvas.repaint();}
    void chooseAudio();
    void chooseProject();
    void chooseExport();
    void choosePlugin();
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
