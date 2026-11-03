#include "MainComponent.h"
#include "YouTubeBrowser.h"
#include "include/cef_app.h"
#include "include/cef_sandbox_win.h"
#include <aclapi.h>
#include <sddl.h>
#include <juce_gui_extra/juce_gui_extra.h>
int runStudioSelfTests(const juce::String& commandLine);
class VocalStudioApplication final : public juce::JUCEApplication {
public:
    const juce::String getApplicationName() override {return "VocalStudio";}
    const juce::String getApplicationVersion() override {return "1.2.0";}
    bool moreThanOneInstanceAllowed() override {return false;}
    void initialise(const juce::String& commandLine) override {
        if(commandLine.contains("--self-test")){const int code=runStudioSelfTests(commandLine);setApplicationReturnValue(code);quit();return;}
        window=std::make_unique<Window>();
        if(commandLine.contains("--demo")){window->main->loadDemo();window->main->showQuickMode(false);}
        if(commandLine.contains("--browser-probe")){juce::Timer::callAfterDelay(4000,[this]{if(window)window->main->startBrowserProbe();});juce::Timer::callAfterDelay(11000,[this]{if(!window)return;auto* main=window->main;const auto frames=main->browserCaptured();const auto stats=main->engine.liveMusic.statistics();auto report=juce::File::getCurrentWorkingDirectory().getChildFile("BrowserSelfTest.json");auto* obj=new juce::DynamicObject;obj->setProperty("capturedFrames",static_cast<juce::int64>(frames));obj->setProperty("processedFrames",static_cast<juce::int64>(stats.outputFrames));obj->setProperty("inputFrames",static_cast<juce::int64>(stats.inputFrames));obj->setProperty("sandboxEnabled",true);obj->setProperty("passed",frames>48000&&stats.inputFrames>48000);report.replaceWithText(juce::JSON::toString(juce::var(obj)));setApplicationReturnValue(frames>48000&&stats.inputFrames>48000?0:1);quit();});}
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

namespace {
// Grant only read/execute on this application's runtime folder to Chromium's
// restricted package SID. Portable ZIP extraction does not preserve build ACLs.
bool allowSandboxRuntimeRead(){
    const auto folderName=juce::File::getSpecialLocation(juce::File::currentExecutableFile).getParentDirectory().getFullPathName();const auto folder=folderName.toWideCharPointer();
    PACL oldAcl=nullptr,newAcl=nullptr;PSECURITY_DESCRIPTOR descriptor=nullptr;PSID sid=nullptr;
    if(GetNamedSecurityInfoW(const_cast<wchar_t*>(folder.getAddress()),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,nullptr,nullptr,&oldAcl,nullptr,&descriptor)!=ERROR_SUCCESS)return false;
    bool ok=false;if(ConvertStringSidToSidW(L"S-1-15-2-2",&sid)){EXPLICIT_ACCESSW entry{};entry.grfAccessPermissions=GENERIC_READ|GENERIC_EXECUTE;entry.grfAccessMode=GRANT_ACCESS;entry.grfInheritance=SUB_CONTAINERS_AND_OBJECTS_INHERIT;entry.Trustee.TrusteeForm=TRUSTEE_IS_SID;entry.Trustee.ptstrName=static_cast<LPWSTR>(sid);if(SetEntriesInAclW(1,&entry,oldAcl,&newAcl)==ERROR_SUCCESS)ok=SetNamedSecurityInfoW(const_cast<wchar_t*>(folder.getAddress()),SE_FILE_OBJECT,DACL_SECURITY_INFORMATION,nullptr,nullptr,newAcl,nullptr)==ERROR_SUCCESS;}
    if(newAcl)LocalFree(newAcl);if(sid)LocalFree(sid);if(descriptor)LocalFree(descriptor);return ok;
}
}
// Chromium subprocesses run before JUCE's application/single-instance setup.
CEF_BOOTSTRAP_EXPORT int RunWinMain(HINSTANCE instance,LPWSTR commandLine,int,void* sandbox,cef_version_info_t*){
    CefMainArgs args(instance);const int child=CefExecuteProcess(args,nullptr,sandbox);if(child>=0)return child;
    const bool tests=juce::String(commandLine).contains("--self-test");bool initialized=false;
    if(!tests){allowSandboxRuntimeRead();CefSettings settings;settings.multi_threaded_message_loop=true;settings.log_severity=LOGSEVERITY_WARNING;
        const auto cache=juce::File::getSpecialLocation(juce::File::userApplicationDataDirectory).getChildFile("VocalStudio/YouTubeCache");cache.createDirectory();CefString(&settings.root_cache_path)=cache.getFullPathName().toStdWString();
        if(!sandbox)return 2;if(!CefInitialize(args,settings,nullptr,sandbox))return CefGetExitCode();initialized=true;}
    juce::JUCEApplicationBase::createInstance=[]()->juce::JUCEApplicationBase*{return new VocalStudioApplication();};
    const int result=juce::JUCEApplicationBase::main();if(initialized)CefShutdown();return result;
}

