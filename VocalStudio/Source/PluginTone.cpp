#include "PluginTone.h"
#include <cmath>
namespace {
juce::String u(const char* s){return juce::String::fromUTF8(s);}
int noteIndex(juce::String text){text=text.trim().toUpperCase().replace(juce::String::fromUTF8("♯"),"#").replace(juce::String::fromUTF8("♭"),"B");const juce::StringArray names{"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};int n=names.indexOf(text);if(n>=0)return n;const juce::StringArray flats{"DB","EB","GB","AB","BB"};const int i=flats.indexOf(text);constexpr int values[]={1,3,6,8,10};return i>=0?values[i]:-1;}
int scaleIndex(juce::String text){text=text.trim().toLowerCase();if(text=="major"||text=="major scale"||text=="ionian")return 0;if(text=="minor"||text=="natural minor"||text=="minor scale"||text=="aeolian")return 1;return -1;}
bool valid(float x){return std::isfinite(x)&&x>=0&&x<=1;}
juce::AudioPluginInstance::HostedParameter* find(juce::AudioPluginInstance& plugin,const juce::String& id){for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i))if(p->getParameterID()==id)return p;return nullptr;}
}
bool PluginToneLink::complete() const noexcept {if(identity.isEmpty()||keyId.isEmpty()||scaleId.isEmpty()||keyId==scaleId||!valid(major)||!valid(minor)||std::abs(major-minor)<.00001f)return false;for(std::size_t i=0;i<notes.size();++i){if(!valid(notes[i]))return false;for(std::size_t j=0;j<i;++j)if(std::abs(notes[i]-notes[j])<.00001f)return false;}return true;}
juce::var PluginToneLink::state() const {auto* obj=new juce::DynamicObject;obj->setProperty("enabled",enabled);obj->setProperty("identity",identity);obj->setProperty("keyId",keyId);obj->setProperty("scaleId",scaleId);obj->setProperty("major",major);obj->setProperty("minor",minor);juce::Array<juce::var> values;for(float x:notes)values.add(x);obj->setProperty("notes",values);return juce::var(obj);}
PluginToneLink PluginToneLink::fromState(const juce::var& value){PluginToneLink link;if(!value.isObject())return link;link.enabled=static_cast<bool>(value["enabled"]);link.identity=value["identity"].toString();link.keyId=value["keyId"].toString();link.scaleId=value["scaleId"].toString();link.major=static_cast<float>(value["major"]);link.minor=static_cast<float>(value["minor"]);if(const auto* notes=value["notes"].getArray())if(notes->size()==12)for(int i=0;i<12;++i)link.notes[static_cast<std::size_t>(i)]=static_cast<float>((*notes)[i]);return link;}
juce::String pluginToneIdentity(const juce::AudioPluginInstance& plugin){const auto description=plugin.getPluginDescription();return description.createIdentifierString()+"|"+description.version;}
std::vector<PluginControl> pluginToneControls(juce::AudioPluginInstance& plugin){std::vector<PluginControl> result;for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i))result.push_back({p->getParameterID(),p->getName(256),p->getValue()});return result;}
PluginToneLink discoverPluginTone(juce::AudioPluginInstance& plugin){PluginToneLink link;link.identity=pluginToneIdentity(plugin);int roots=0,scales=0;for(int i=0;i<plugin.getParameters().size();++i){auto* p=plugin.getHostedParameter(i);if(!p)continue;const auto name=p->getName(256).toLowerCase().retainCharacters("abcdefghijklmnopqrstuvwxyz");const bool root=name=="key"||name=="root"||name=="rootkey"||name=="tonickey"||name=="keysignature",scale=name=="scale"||name=="scaletype"||name=="mode";if(!root&&!scale)continue;const int count=p->getNumSteps();
        std::array<float,12> notes;notes.fill(-1);float major=-1,minor=-1;if(count>=2&&count<=128)for(int n=0;n<count;++n){const float value=static_cast<float>(n)/(count-1);const auto label=p->getText(value,128);if(root){const int note=noteIndex(label);if(note>=0)notes[static_cast<std::size_t>(note)]=value;}if(scale){const int mode=scaleIndex(label);if(mode==0)major=value;if(mode==1)minor=value;}}
        if(count<2||count>128){if(root){const juce::StringArray names{"C","C#","D","D#","E","F","F#","G","G#","A","A#","B"};for(int n=0;n<12;++n){const float value=p->getValueForText(names[n]);if(valid(value)&&noteIndex(p->getText(value,128))==n)notes[static_cast<std::size_t>(n)]=value;}}if(scale){for(const auto& label:juce::StringArray{"Major","Minor","Natural Minor"}){const float value=p->getValueForText(label);const int mode=scaleIndex(p->getText(value,128));if(valid(value)&&mode==scaleIndex(label)){if(mode==0)major=value;if(mode==1)minor=value;}}}}
        bool all=true;for(float value:notes)if(!valid(value))all=false;if(root&&all){++roots;link.keyId=p->getParameterID();link.notes=notes;}if(scale&&valid(major)&&valid(minor)){++scales;link.scaleId=p->getParameterID();link.major=major;link.minor=minor;}
    }if(roots!=1)link.keyId={};if(scales!=1)link.scaleId={};return link;
}
juce::Result applyPluginTone(juce::AudioPluginInstance& plugin,const PluginToneLink& link,int tonic,bool minor){if(tonic<0||tonic>11)return juce::Result::fail(u("Chưa có tone bài hợp lệ."));if(!link.enabled||!link.complete()||link.identity!=pluginToneIdentity(plugin))return juce::Result::fail(u("Chưa ghép đủ Key/Scale cho đúng plugin và phiên bản này."));auto* key=find(plugin,link.keyId);auto* scale=find(plugin,link.scaleId);if(!key||!scale)return juce::Result::fail(u("Plugin không công khai Key/Scale đã ghép. Không gửi giá trị đoán."));const float rootValue=link.notes[static_cast<std::size_t>(tonic)],scaleValue=minor?link.minor:link.major;
    const float oldRoot=key->getValue(),oldScale=scale->getValue();auto write=[](auto* p,float value){p->beginChangeGesture();p->setValueNotifyingHost(value);p->endChangeGesture();};write(scale,scaleValue);write(key,rootValue);if(std::abs(key->getValue()-rootValue)>.001f||std::abs(scale->getValue()-scaleValue)>.001f){write(scale,oldScale);write(key,oldRoot);return juce::Result::fail(u("Plugin không xác nhận Key/Scale. Đã trả về giá trị cũ."));}return juce::Result::ok();}

namespace {
using Parameter=juce::AudioPluginInstance::HostedParameter;
juce::String compact(juce::String text){return text.toLowerCase().retainCharacters("abcdefghijklmnopqrstuvwxyz");}
Parameter* uniqueControl(juce::AudioPluginInstance& plugin,const juce::StringArray& names){Parameter* found=nullptr;for(int i=0;i<plugin.getParameters().size();++i)if(auto* p=plugin.getHostedParameter(i))if(names.contains(compact(p->getName(256)))){if(found)return nullptr;found=p;}return found;}
bool number(const juce::String& text,float& out){const auto s=text.trim();if(s.isEmpty()||!juce::String("0123456789+-.").containsChar(s[0]))return false;out=s.getFloatValue();return std::isfinite(out);}
void writeControl(Parameter& p,float value){p.beginChangeGesture();p.setValueNotifyingHost(value);p.endChangeGesture();}
bool numericTarget(Parameter& p,float minimum,bool milliseconds,float& result){
    if(!valid(p.getValue()))return false;
    const auto label=p.getLabel().toLowerCase();const auto current=p.getText(p.getValue(),128).toLowerCase();float now=0,low=0,high=0;
    if(!number(current,now)||!number(p.getText(0,128),low)||!number(p.getText(1,128),high))return false;
    if(milliseconds){if(!label.contains("ms")&&!current.contains("ms"))return false;}
    else if(!label.contains("%")&&!current.contains("%")&&(std::abs(low)>.01f||std::abs(high-100)>.01f))return false;
    // Never speed up an already gentle retune or reduce an existing humanize amount.
    const float target=std::max(now,minimum);if(target>std::max(low,high)+.01f)return false;
    result=p.getValueForText(juce::String(target,2)+(milliseconds?" ms":" %"));float decoded=0;
    return valid(result)&&number(p.getText(result,128),decoded)&&std::abs(decoded-target)<.51f;
}
}
juce::Result applyNaturalTuning(juce::AudioPluginInstance& plugin,std::vector<PluginTuneChange>& changes,juce::String& report,float retuneMinimumMs){
    changes.clear();report={};auto* retune=uniqueControl(plugin,{"retunespeed","retune"});float value=0;
    if(!retune||!numericTarget(*retune,retuneMinimumMs,true,value))return juce::Result::fail(u("Không nhận diện chắc Retune Speed theo ms. Mở Antares và chỉnh Retune khoảng 35 ms hoặc chậm hơn; tool chưa đổi tham số nào."));
    std::vector<PluginTuneChange> planned;
    auto plan=[&](Parameter* p,float v){const float before=p->getValue();report+=p->getName(128)+": "+p->getText(before,128)+" → "+p->getText(v,128)+"\n";if(std::abs(before-v)>.00001f)planned.push_back({p->getParameterID(),before,v});};plan(retune,value);
    for(const auto& spec:std::vector<std::pair<juce::StringArray,float>>{{{"humanize"},50},{{"flextune","flex"},20}}){auto* p=uniqueControl(plugin,spec.first);if(p&&numericTarget(*p,spec.second,false,value))plan(p,value);else report+=spec.first[0]+u(": không có/không xác minh được đơn vị; giữ nguyên, chỉnh trong Antares nếu có.\n");}
    auto* formant=uniqueControl(plugin,{"formant","formantcorrection","formantpreservation","preserveformants"});bool mapped=false;
    if(formant)for(const auto& text:juce::StringArray{"On","Enabled","True"}){const float v=formant->getValueForText(text);const auto back=compact(formant->getText(v,128));if(valid(v)&&(back=="on"||back=="enabled"||back=="true")){plan(formant,v);mapped=true;break;}}
    if(!mapped)report+=u("Formant On: không có nhãn bật/tắt rõ; giữ nguyên. Không đổi Formant Shift/Input Type/Transpose.\n");
    for(const auto& c:planned){auto* p=find(plugin,c.id);if(!p)return juce::Result::fail(u("Danh sách tham số plugin đã thay đổi; chưa áp dụng."));}
    for(const auto& c:planned)writeControl(*find(plugin,c.id),c.after);
    for(const auto& c:planned)if(!valid(find(plugin,c.id)->getValue())||std::abs(find(plugin,c.id)->getValue()-c.after)>.001f){for(const auto& old:planned)writeControl(*find(plugin,old.id),old.before);return juce::Result::fail(u("Plugin không xác nhận giá trị; đã trả tham số về trước khi áp dụng."));}
    changes=std::move(planned);return juce::Result::ok();
}
juce::Result undoNaturalTuning(juce::AudioPluginInstance& plugin,const std::vector<PluginTuneChange>& changes){
    if(changes.empty())return juce::Result::fail(u("Không có thay đổi Fix méo để hoàn tác."));
    for(const auto& c:changes){auto* p=find(plugin,c.id);if(!p||!valid(p->getValue())||std::abs(p->getValue()-c.after)>.001f)return juce::Result::fail(u("Bạn đã đổi tham số trong plugin sau Fix méo; không ghi đè thay đổi mới. Chỉnh lại trong Antares."));}
    for(const auto& c:changes)writeControl(*find(plugin,c.id),c.before);
    for(const auto& c:changes)if(!valid(find(plugin,c.id)->getValue())||std::abs(find(plugin,c.id)->getValue()-c.before)>.001f){for(const auto& old:changes)writeControl(*find(plugin,old.id),old.after);return juce::Result::fail(u("Plugin không xác nhận hoàn tác; đã trả về trạng thái Fix méo."));}
    return juce::Result::ok();
}
