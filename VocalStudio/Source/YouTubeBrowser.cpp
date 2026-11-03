#include "YouTubeBrowser.h"
#include "include/cef_app.h"
#include "include/cef_client.h"
#include "include/cef_audio_handler.h"
#include "include/cef_life_span_handler.h"
#include "include/cef_load_handler.h"
#include "include/cef_display_handler.h"
#include "include/cef_permission_handler.h"
#include "include/cef_task.h"
#include "include/cef_sandbox_win.h"
#include <mutex>
#include <windows.h>
namespace {
struct BrowserState {
    explicit BrowserState(vocal::LiveMusic& m):music(m){}
    vocal::LiveMusic& music;std::mutex mutex;CefRefPtr<CefBrowser> browser;
    juce::String url="https://www.youtube.com/",problem,lastSong;
    std::atomic<bool> closing{false},ad{false};std::atomic<std::uint64_t> captured{0};
    std::atomic<int> channels{2};juce::WaitableEvent closed;
    CefRefPtr<CefBrowser> get(){std::lock_guard<std::mutex> lock(mutex);return browser;}
};
class CloseNativeWindow final : public CefTask {
public:explicit CloseNativeWindow(HWND window):window(window){}void Execute() override{if(IsWindow(window))DestroyWindow(window);}
private:HWND window;IMPLEMENT_REFCOUNTING(CloseNativeWindow);
};
class BrowserClient final : public CefClient,public CefAudioHandler,public CefLifeSpanHandler,public CefLoadHandler,public CefDisplayHandler,public CefPermissionHandler {
public:
    explicit BrowserClient(std::shared_ptr<BrowserState> value):state(std::move(value)){}
    CefRefPtr<CefAudioHandler> GetAudioHandler() override{return this;}
    CefRefPtr<CefLifeSpanHandler> GetLifeSpanHandler() override{return this;}
    CefRefPtr<CefLoadHandler> GetLoadHandler() override{return this;}
    CefRefPtr<CefDisplayHandler> GetDisplayHandler() override{return this;}
    CefRefPtr<CefPermissionHandler> GetPermissionHandler() override{return this;}
    bool GetAudioParameters(CefRefPtr<CefBrowser>,CefAudioParameters& p) override{p.channel_layout=CEF_CHANNEL_LAYOUT_STEREO;p.sample_rate=48000;p.frames_per_buffer=480;return true;}
    void OnAudioStreamStarted(CefRefPtr<CefBrowser>,const CefAudioParameters&,int channels) override{state->channels=channels;}
    void OnAudioStreamPacket(CefRefPtr<CefBrowser>,const float** data,int frames,int64_t) override{state->music.push(data,state->channels.load(),frames);state->captured+=frames;}
    void OnAudioStreamStopped(CefRefPtr<CefBrowser>) override{std::array<float,9600> zeros{};const float* data[]={zeros.data(),zeros.data()};state->music.push(data,2,static_cast<int>(zeros.size()));}
    void OnAudioStreamError(CefRefPtr<CefBrowser>,const CefString& message) override{std::lock_guard<std::mutex> lock(state->mutex);state->problem=juce::String::fromUTF8(message.ToString().c_str());}
    void OnAfterCreated(CefRefPtr<CefBrowser> b) override{{std::lock_guard<std::mutex> lock(state->mutex);state->browser=b;}if(state->closing)b->GetHost()->CloseBrowser(true);}
    bool DoClose(CefRefPtr<CefBrowser> browser) override{CefPostTask(TID_UI,new CloseNativeWindow(browser->GetHost()->GetWindowHandle()));return true;}
    void OnBeforeClose(CefRefPtr<CefBrowser>) override{{std::lock_guard<std::mutex> lock(state->mutex);state->browser=nullptr;}state->closed.signal();}
    bool OnBeforePopup(CefRefPtr<CefBrowser> b,CefRefPtr<CefFrame>,int,const CefString& url,const CefString&,WindowOpenDisposition,bool gesture,const CefPopupFeatures&,CefWindowInfo&,CefRefPtr<CefClient>&,CefBrowserSettings&,CefRefPtr<CefDictionaryValue>&,bool*) override{if(gesture&&url.ToString().rfind("https://",0)==0)b->GetMainFrame()->LoadURL(url);return true;}
    void OnAddressChange(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> frame,const CefString& url) override{if(!frame->IsMain())return;const auto value=juce::String::fromUTF8(url.ToString().c_str());const juce::URL parsed(value);const auto song=parsed.getDomain()+parsed.getSubPath()+"?"+parsed.getParameterValues().joinIntoString("&");{std::lock_guard<std::mutex> lock(state->mutex);state->url=value;if(song==state->lastSong)return;state->lastSong=song;}state->music.beginSong();}
    void OnLoadError(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> f,ErrorCode code,const CefString& message,const CefString&) override{if(code==ERR_ABORTED||!f->IsMain())return;std::lock_guard<std::mutex> lock(state->mutex);state->problem=juce::String::fromUTF8(message.ToString().c_str());}
    void OnLoadEnd(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame> frame,int) override{
        if(!frame->IsMain())return;const auto url=frame->GetURL().ToString();if(url.rfind("https://www.youtube.com/",0)!=0)return;
        // Read playback state only. No media extraction or privileged page API.
        frame->ExecuteJavaScript(R"JS((()=>{if(window.__vocalState)return;window.__vocalState=true;let last='',t=0;setInterval(()=>{let v=document.querySelector('video'),ad=!!document.querySelector('.ad-showing');let id=new URL(location.href).searchParams.get('v')||'',seek=v&&Math.abs(v.currentTime-t)>3;let s=id+'|'+ad;if(s!==last||seek){console.log('__VOCAL_PLAYBACK__'+JSON.stringify({id,ad,seek:!!seek}));last=s;}if(v)t=v.currentTime;},500);})())JS",url,0);
    }
    bool OnConsoleMessage(CefRefPtr<CefBrowser> browser,cef_log_severity_t,const CefString& message,const CefString&,int) override{
        const auto url=browser->GetMainFrame()->GetURL().ToString();if(url.rfind("https://www.youtube.com/",0)!=0)return false;const auto msg=juce::String::fromUTF8(message.ToString().c_str());if(!msg.startsWith("__VOCAL_PLAYBACK__"))return false;
        const auto data=juce::JSON::parse(msg.substring(18));if(data.isObject()){state->ad=static_cast<bool>(data["ad"]);state->music.beginSong();}return true;
    }
    bool OnRequestMediaAccessPermission(CefRefPtr<CefBrowser>,CefRefPtr<CefFrame>,const CefString&,uint32_t,CefRefPtr<CefMediaAccessCallback> callback) override{callback->Cancel();return true;}
private:
    std::shared_ptr<BrowserState> state;
    IMPLEMENT_REFCOUNTING(BrowserClient);
};
}
struct YouTubeBrowser::Impl {explicit Impl(vocal::LiveMusic& m):state(std::make_shared<BrowserState>(m)){}std::shared_ptr<BrowserState> state;juce::HWNDComponent child;bool requested=false,attached=false;};
YouTubeBrowser::YouTubeBrowser(vocal::LiveMusic& music):impl(std::make_unique<Impl>(music)){addAndMakeVisible(impl->child);music.start();startTimerHz(10);}
YouTubeBrowser::~YouTubeBrowser(){stopTimer();impl->state->closing=true;impl->child.setHWND(nullptr);if(auto b=impl->state->get())b->GetHost()->CloseBrowser(true);if(impl->requested)impl->state->closed.wait(10000);}
void YouTubeBrowser::timerCallback(){
    if(!impl->requested){auto* peer=getPeer();if(!peer||!isShowing())return;CefWindowInfo info;info.SetAsChild(static_cast<HWND>(peer->getNativeHandle()),CefRect(0,0,juce::jmax(1,getWidth()),juce::jmax(1,getHeight())));info.runtime_style=CEF_RUNTIME_STYLE_ALLOY;CefBrowserSettings settings;settings.background_color=0xff11151d;CefRefPtr<BrowserClient> client=new BrowserClient(impl->state);impl->requested=CefBrowserHost::CreateBrowser(info,client,address().toStdString(),settings,nullptr,nullptr);if(!impl->requested){std::lock_guard<std::mutex> lock(impl->state->mutex);impl->state->problem="Browser could not start";}return;}
    if(!impl->attached)if(auto b=impl->state->get()){impl->child.setHWND(b->GetHost()->GetWindowHandle());impl->attached=true;resized();}
}
void YouTubeBrowser::navigate(const juce::String& input){auto text=input.trim();if(text.isEmpty())return;juce::String url;if(text.startsWithIgnoreCase("https://"))url=text;else if(text.startsWithIgnoreCase("youtube.com/")||text.startsWithIgnoreCase("www.youtube.com/")||text.startsWithIgnoreCase("youtu.be/"))url="https://"+text;else url="https://www.youtube.com/results?search_query="+juce::URL::addEscapeChars(text,true);{std::lock_guard<std::mutex> lock(impl->state->mutex);impl->state->url=url;impl->state->problem.clear();}impl->state->music.beginSong();if(auto b=impl->state->get())b->GetMainFrame()->LoadURL(url.toStdString());}
void YouTubeBrowser::home(){navigate("https://www.youtube.com/");}
void YouTubeBrowser::back(){if(auto b=impl->state->get())b->GoBack();}
void YouTubeBrowser::pause(){if(auto b=impl->state->get())b->GetMainFrame()->ExecuteJavaScript("document.querySelectorAll('video,audio').forEach(v=>v.pause())",b->GetMainFrame()->GetURL(),0);}
void YouTubeBrowser::resized(){impl->child.setBounds(getLocalBounds());}
void YouTubeBrowser::paint(juce::Graphics& g){g.fillAll(juce::Colour(0xff11151d));g.setColour(juce::Colours::white);g.drawText(juce::String::fromUTF8("Đang mở YouTube…"),getLocalBounds(),juce::Justification::centred);}
juce::String YouTubeBrowser::address() const{std::lock_guard<std::mutex> lock(impl->state->mutex);return impl->state->url;}
juce::String YouTubeBrowser::error() const{std::lock_guard<std::mutex> lock(impl->state->mutex);return impl->state->problem;}
bool YouTubeBrowser::advertisement() const{return impl->state->ad.load();}
std::uint64_t YouTubeBrowser::capturedFrames() const{return impl->state->captured.load();}
void YouTubeBrowser::runAudioProbe(){if(auto b=impl->state->get()){const auto html=juce::String("<html><body style='background:#10151e;color:white'><h1>Native browser audio probe</h1><script>let a=new AudioContext({sampleRate:48000}),o=a.createOscillator(),g=a.createGain();o.frequency.value=220;g.gain.value=.15;o.connect(g).connect(a.destination);o.start();a.resume();</script></body></html>");b->GetMainFrame()->LoadURL(("data:text/html;charset=utf-8,"+juce::URL::addEscapeChars(html,true)).toStdString());}}
