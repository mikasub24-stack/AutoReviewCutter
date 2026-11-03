#include "MainComponent.h"
#include <juce_gui_extra/juce_gui_extra.h>
int runStudioSelfTests(const juce::String& commandLine);
class VocalStudioApplication final : public juce::JUCEApplication {
public:
    const juce::String getApplicationName() override {return "VocalStudio";}
    const juce::String getApplicationVersion() override {return "1.0.0";}
    bool moreThanOneInstanceAllowed() override {return false;}
    void initialise(const juce::String& commandLine) override {
        if(commandLine.contains("--self-test")){const int code=runStudioSelfTests(commandLine);setApplicationReturnValue(code);quit();return;}
        window=std::make_unique<Window>();
        if(commandLine.contains("--demo"))window->main->loadDemo();
        const auto args=juce::StringArray::fromTokens(commandLine,true);const int shot=args.indexOf("--screenshot");
        if(shot>=0&&shot+1<args.size()){const auto file=juce::File(args[shot+1].unquoted());juce::Timer::callAfterDelay(1200,[this,file]{if(!window)return;auto image=window->main->createComponentSnapshot(window->main->getLocalBounds());file.getParentDirectory().createDirectory();auto stream=file.createOutputStream();if(stream){juce::JPEGImageFormat format;format.setQuality(.9f);format.writeImageToStream(image,*stream);}window->main->saveToolScreenshots(file.getParentDirectory());window.reset();quit();});}
    }
    void shutdown() override {window.reset();}
    void systemRequestedQuit() override {if(window)window->main->prepareToClose([this]{quit();});else quit();}
    void anotherInstanceStarted(const juce::String&) override {if(window){window->setVisible(true);window->toFront(true);}}
private:
    class Window final : public juce::DocumentWindow {
    public:
        Window():DocumentWindow(juce::String::fromUTF8("Vocal Studio · Thu hát và mix vocal"),juce::Colour(0xff10151e),DocumentWindow::allButtons){setUsingNativeTitleBar(true);main=new StudioMain();setContentOwned(main,true);setResizable(true,true);setResizeLimits(1180,720,2560,1600);centreWithSize(getWidth(),getHeight());setVisible(true);main->grabKeyboardFocus();}
        void closeButtonPressed() override {juce::JUCEApplication::getInstance()->systemRequestedQuit();}
        StudioMain* main=nullptr;
    };
    std::unique_ptr<Window> window;
};
START_JUCE_APPLICATION(VocalStudioApplication)
