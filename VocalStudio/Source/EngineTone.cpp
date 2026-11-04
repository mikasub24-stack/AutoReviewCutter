#include "Engine.h"
#include <cmath>
namespace {juce::String u(const char* s){return juce::String::fromUTF8(s);}}
void StudioEngine::replaceTracks(std::vector<std::pair<int,std::unique_ptr<StudioTrack>>> replacements){withAudioStopped([&]{for(auto& entry:replacements)if(juce::isPositiveAndBelow(entry.first,static_cast<int>(tracks.size()))&&entry.second)tracks[static_cast<std::size_t>(entry.first)]=std::move(entry.second);resetProcessing();});}
bool StudioEngine::isAntaresActive() const {if(!plugin||isPluginBypassed())return false;const auto description=plugin->getPluginDescription();const auto name=(description.name+" "+description.manufacturerName).toLowerCase();return (toneLink.enabled&&toneLink.complete())||name.contains("antares")||name.contains("auto-tune")||name.contains("autotune");}
void StudioEngine::setPluginBypassed(bool bypass){if(isPlaying()||isRecording())return;heldForUnknownKey=false;withAudioStopped([&]{pluginBypassed=bypass;resetProcessing();});if(!bypass&&toneLink.complete()&&toneLink.enabled&&songTonic>=0)sendSongKey();}
void StudioEngine::scanToneLink(){if(!plugin){toneLink=PluginToneLink{};toneLinkStatus=u("Nạp Antares VST3 trước. Không kèm plugin hoặc giấy phép Antares.");return;}toneLink=discoverPluginTone(*plugin);toneLinkStatus=toneLink.complete()?u("Đã nhận diện đủ 12 Key và Major/Minor từ nhãn plugin. Có thể tự gửi tone."):u("Chưa tự nhận diện đủ Key/Scale. Chọn tham số và học các giá trị từ giao diện Antares; không đoán thứ tự núm.");}
juce::Result StudioEngine::setSongKey(int tonic,bool minor,const juce::String& source){
    if(tonic<0||tonic>11){songTonic=-1;songKeySource=source;const bool shouldHold=toneLink.enabled&&plugin&&(!isPluginBypassed()||heldForUnknownKey);if(shouldHold){setPluginBypassed(true);heldForUnknownKey=true;}toneLinkStatus=u("Chưa rõ tone bài mới. Không dùng tone cũ; ")+(shouldHold?u("đã tạm bypass Antares, chọn Key/Scale hoặc dò lại."):u("chọn Key/Scale bằng tay trước khi chỉnh phô."));return juce::Result::fail(toneLinkStatus);}
    songTonic=tonic;songMinor=minor;songKeySource=source;
    if(heldForUnknownKey&&toneLink.enabled&&toneLink.complete()){withAudioStopped([&]{pluginBypassed=false;resetProcessing();});heldForUnknownKey=false;}
    if(toneLink.enabled&&plugin&&!isPluginBypassed()){const auto result=sendSongKey();if(result.failed()){setPluginBypassed(true);heldForUnknownKey=true;toneLinkStatus=u("Đã tạm bypass để tránh chỉnh sai tone: ")+result.getErrorMessage();}return result;}
    toneLinkStatus=u("Đã lưu tone bài. Nạp/bật Antares và ghép Key/Scale để tự gửi.");return juce::Result::ok();
}
juce::Result StudioEngine::sendSongKey(){if(isPlaying()||isRecording())return juce::Result::fail(u("Dừng phát/thu trước khi gửi Key/Scale."));if(!plugin)return juce::Result::fail(u("Chưa nạp Antares VST3."));if(isPluginBypassed())return juce::Result::fail(u("Plugin đang bypass. Bật plugin trước khi gửi tone."));juce::Result result=juce::Result::ok();withAudioStopped([&]{auto link=toneLink;link.enabled=true;result=applyPluginTone(*plugin,link,songTonic,songMinor);});toneLinkStatus=result.wasOk()?u("Đã gửi và đọc lại xác nhận: ")+juce::String(vocal::noteName(60+songTonic))+(songMinor?" minor":" major")+u(" → ")+plugin->getName():result.getErrorMessage();return result;}

// GUI-thread controller updates use the VST3 parameter queue; audio keeps running.
// Never release/reprepare a plug-in or detach the device callback during singing.
juce::Result StudioEngine::setLiveSongKey(int tonic,bool minor){
    songTonic=tonic;songMinor=minor;songKeySource="YouTube live";
    if(!plugin||!toneLink.enabled)return juce::Result::ok();
    if(tonic<0||tonic>11){if(!pluginBypassed.load()||heldForUnknownKey){pluginBypassed=true;heldForUnknownKey=true;}toneLinkStatus=u("Đang nghe nhạc để dò tone · Antares tạm bypass");return juce::Result::ok();}
    if(pluginBypassed.load()&&!heldForUnknownKey)return juce::Result::ok();
    auto result=applyPluginTone(*plugin,toneLink,tonic,minor);
    if(result.wasOk()){pluginBypassed=false;heldForUnknownKey=false;toneLinkStatus=u("Đã gửi Key/Scale: ")+juce::String(vocal::noteName(60+tonic))+(minor?" minor":" major");}
    else{pluginBypassed=true;heldForUnknownKey=true;toneLinkStatus=result.getErrorMessage();}return result;
}

juce::Result StudioEngine::fixTuneArtifacts(){
    auto fail=[this](const juce::String& text){tuneFixStatus=text;return juce::Result::fail(text);};
    if(isPlaying()||isRecording()||isEqListening())return fail(u("Dừng phát/thu/nghe bản thu trước khi Fix méo Auto-Tune."));
    if(!plugin)return fail(u("Nạp Antares VST3 đã cài trên máy trước."));
    if(isPluginBypassed())return fail(u("Antares đang bypass. Chọn tone đúng rồi bật plugin để nghe; Fix méo không tự bật plugin."));
    if(songTonic<0||!toneLink.enabled||!toneLink.complete())return fail(u("Chưa rõ tone hoặc chưa ghép Key/Scale. Dò/chọn tone bài và ghép Antares trước; không đoán tone."));
    if(!tuneUndo.empty())return fail(u("Đã có một lần Fix méo. Hoàn tác trước nếu muốn áp dụng lại."));
    juce::Result result=juce::Result::ok();juce::String report;
    withAudioStopped([&]{auto checked=applyPluginTone(*plugin,toneLink,songTonic,songMinor);if(checked.failed()){result=checked;return;}result=applyNaturalTuning(*plugin,tuneUndo,report);resetProcessing();});
    tuneFixStatus=result.wasOk()?u("Đã xác nhận Key/Scale hiện tại và áp dụng kiểu kéo nhẹ. Không phải bộ cứu clipping.\n")+report+u("\nChỉ một tuner realtime trên vocal; tool đã chặn chỉnh phô offline khi Antares hoạt động. Vocal đã in Auto-Tune từ trước phải dùng WAV gốc. Nghe thử rồi Hoàn tác nếu không hợp."):result.getErrorMessage();
    return result;
}
juce::Result StudioEngine::undoTuneArtifacts(){
    if(isPlaying()||isRecording()||isEqListening())return juce::Result::fail(u("Dừng phát/thu/nghe bản thu trước khi hoàn tác."));
    if(!plugin)return juce::Result::fail(u("Không còn plugin để hoàn tác."));
    juce::Result result=juce::Result::ok();withAudioStopped([&]{result=undoNaturalTuning(*plugin,tuneUndo);if(result.wasOk()){tuneUndo.clear();resetProcessing();}});tuneFixStatus=result.wasOk()?u("Đã hoàn tác tham số Fix méo. Key/Scale vẫn theo bài hiện tại."):result.getErrorMessage();return result;
}
