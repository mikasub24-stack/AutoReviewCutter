#include "KaraokePage.h"
namespace {juce::String u(const char* s){return juce::String::fromUTF8(s);}}
KaraokePage::KaraokePage(StudioMain& main):owner(main),browser(main.engine.liveMusic){
    auto& e=owner.engine;auto* settings=owner.settings();e.liveMode=true;e.liveMusic->setSemitones(settings->getIntValue("liveTranspose",0));e.liveMusic->gain=static_cast<float>(settings->getDoubleValue("liveMusicGain",.7));e.monitor=settings->getBoolValue("liveMonitor",false);e.inputChannel=juce::jmax(0,settings->getIntValue("liveInputChannel",0));
    for(juce::Component* c:std::initializer_list<juce::Component*>{&browser,&search,&open,&back,&home,&advanced,&title})addAndMakeVisible(c);
    addAndMakeVisible(sidebar);sidebar.setViewedComponent(&controls,false);sidebar.setScrollBarsShown(true,false);
    for(juce::Component* c:std::initializer_list<juce::Component*>{&warmthLevel,&presenceLevel,&warmthLabel,&presenceLabel,&phonesLevel,&phonesLabel,&hiddenRoom,&hiddenLabel,&musicDuck,&duckLabel,&monitorHint,&down,&up,&reset,&devices,&antares,&mic,&record,&scanTune,&lowLatency,&saveVoice,&monitorLabel,&shortLabel,&compressionLabel,&monitorLevel,&shortRoom,&compression,&offset,&key,&status,&musicLabel,&micLabel,&reverbLabel,&delayLabel,&music,&micGain,&reverb,&delay,&keySelect,&scaleSelect,&autoKey,&keepPluginKey,&input})controls.addAndMakeVisible(c);
    monitorHint.setText(u("Tai nghe: nghe FX qua app.\nDirect Monitor / DSP trên sound card: OFF."),juce::dontSendNotification);monitorHint.setFont(12);
    input.setTextWhenNothingSelected(u("Ngõ micro"));input.onChange=[this]{owner.engine.inputChannel=input.getSelectedItemIndex();};
    title.setText(u("VOCAL STUDIO  /  HÁT VỚI YOUTUBE"),juce::dontSendNotification);title.setFont(juce::Font(22,juce::Font::bold));title.setColour(juce::Label::textColourId,juce::Colour(0xff6fe1c7));
    auto button=[](juce::TextButton& b,const char* text,std::function<void()> action){b.setButtonText(u(text));b.onClick=std::move(action);};
    button(open,"Mở / Tìm",[this]{browser.navigate(search.getText());});button(back,"←",[this]{browser.back();});button(home,"YouTube",[this]{browser.home();});search.setTextToShowWhenEmpty(u("Dán link YouTube hoặc nhập tên bài karaoke…"),juce::Colour(0xff8290a3));search.onReturnKey=[this]{browser.navigate(search.getText());};
    button(down,"−½ cung",[this]{change(-1);});button(up,"+½ cung",[this]{change(1);});button(reset,"Về tone gốc",[this]{owner.engine.liveMusic->setSemitones(0);sendKey();});down.setColour(juce::TextButton::buttonColourId,juce::Colour(0xff19564e));up.setColour(juce::TextButton::buttonColourId,juce::Colour(0xff19564e));
    button(advanced,"Studio nâng cao",[this]{leave();});button(devices,"Sound card",[this]{owner.openSoundCard();});button(antares,"Mở Antares",[this]{owner.openAntaresEditor();});button(mic,"Bật micro",[this]{auto& e=owner.engine;e.monitor=!e.monitor.load();});button(record,"Thu giọng",[this]{owner.record();});
    button(scanTune,"Quét Auto-Tune",[this]{owner.scanPlugins(0);});button(lowLatency,"Kiểm âm ít trễ",[this]{owner.lowLatencyMonitoring();});

    button(saveVoice,"Lưu cấu hình giọng",[this]{if(owner.isBusy())return;if(owner.save())owner.status(owner.savedVoiceSummary());});

    auto slider=[](juce::Slider& s,double lo,double hi,double step){s.setRange(lo,hi,step);s.setSliderStyle(juce::Slider::LinearHorizontal);s.setTextBoxStyle(juce::Slider::TextBoxRight,false,65,22);};slider(music,0,150,1);music.setTextValueSuffix(" %");music.setValue(e.liveMusic->gain.load()*100,juce::dontSendNotification);music.onValueChange=[this]{owner.engine.liveMusic->gain=static_cast<float>(music.getValue()*.01);};slider(micGain,-24,12,.1);micGain.setTextValueSuffix(" dB");micGain.setValue(e.inputDb.load(),juce::dontSendNotification);micGain.onValueChange=[this]{owner.engine.inputDb=static_cast<float>(micGain.getValue());};slider(reverb,0,40,1);reverb.setTextValueSuffix(" %");reverb.onValueChange=[this]{owner.engine.reverb=static_cast<float>(reverb.getValue()*.01);};slider(delay,0,30,1);delay.setTextValueSuffix(" %");delay.onValueChange=[this]{owner.engine.delay=static_cast<float>(delay.getValue()*.01);};

    slider(warmthLevel,-8,6,.5);warmthLevel.setTextValueSuffix(" dB");warmthLevel.onValueChange=[this]{owner.engine.warmth=static_cast<float>(warmthLevel.getValue());};warmthLabel.setText(u("Ấm giọng"),juce::dontSendNotification);
    slider(presenceLevel,-6,8,.5);presenceLevel.setTextValueSuffix(" dB");presenceLevel.onValueChange=[this]{owner.engine.presence=static_cast<float>(presenceLevel.getValue());};presenceLabel.setText(u("Sáng / Rõ"),juce::dontSendNotification);
    slider(phonesLevel,-12,6,.5);phonesLevel.setTextValueSuffix(" dB");phonesLevel.onValueChange=[this]{owner.engine.headphoneDb=static_cast<float>(phonesLevel.getValue());};phonesLabel.setText(u("Âm tai nghe"),juce::dontSendNotification);phonesLevel.setTooltip(u("Cùng tăng/giảm cả nhạc và giọng khi nghe; không tăng mức file xuất. Đỉnh âm vẫn được giới hạn."));
    slider(hiddenRoom,0,20,1);hiddenRoom.setTextValueSuffix(" %");hiddenRoom.onValueChange=[this]{owner.engine.hiddenReverb=static_cast<float>(hiddenRoom.getValue()*.01);};hiddenLabel.setText(u("Vang ẩn"),juce::dontSendNotification);hiddenRoom.setTooltip(u("Nhánh vang ngắn nhẹ, tối, nằm dưới giọng. Dùng chung độ dài với vang ngắn; không phải plugin khác."));
    slider(musicDuck,0,6,.1);musicDuck.setTextValueSuffix(" dB");musicDuck.onValueChange=[this]{owner.engine.musicDuckingDb=static_cast<float>(musicDuck.getValue());};duckLabel.setText(u("Nhạc lùi khi hát"),juce::dontSendNotification);musicDuck.setTooltip(u("0 = tắt. Hạ nhạc tối đa mức này theo giọng khô, không theo đuôi vang. Chọn đúng ngõ micro để tránh bắt nhạc loopback."));
    slider(monitorLevel,-12,18,.5);monitorLevel.setTextValueSuffix(" dB");monitorLevel.onValueChange=[this]{if(owner.isBusy())return;owner.engine.monitorDb=static_cast<float>(monitorLevel.getValue());};
    slider(shortRoom,0,40,1);shortRoom.setTextValueSuffix(" %");shortRoom.onValueChange=[this]{if(owner.isBusy())return;owner.engine.shortReverb=static_cast<float>(shortRoom.getValue()*.01);};
    slider(compression,0,100,1);compression.setTextValueSuffix(" %");compression.onValueChange=[this]{if(owner.isBusy())return;auto& e=owner.engine;const float v=static_cast<float>(compression.getValue()*.01);e.ratio=1+3*v;e.threshold=-14-12*v;e.makeup=4*v;e.leveling=.65f*v;};
    monitorLabel.setText(u("Giọng tai nghe"),juce::dontSendNotification);shortLabel.setText(u("Vang ngắn"),juce::dontSendNotification);compressionLabel.setText(u("Nén giọng"),juce::dontSendNotification);
    musicLabel.setText(u("Âm lượng nhạc"),juce::dontSendNotification);micLabel.setText(u("Gain micro"),juce::dontSendNotification);reverbLabel.setText(u("Vang dài / Reverb"),juce::dontSendNotification);delayLabel.setText(u("Delay / Echo"),juce::dontSendNotification);offset.setFont(juce::Font(36,juce::Font::bold));offset.setJustificationType(juce::Justification::centred);key.setJustificationType(juce::Justification::centred);status.setMultiLine(true);status.setReadOnly(true);status.setScrollbarsShown(true);
    autoKey.setButtonText(u("Tự dò tone → Antares"));autoKey.setToggleState(settings->getBoolValue("liveAutoKey",true),juce::dontSendNotification);autoKey.onClick=[this]{if(autoKey.getToggleState())keepPluginKey.setToggleState(false,juce::dontSendNotification);revision=~std::uint64_t(0);sendKey();owner.save();};
    keepPluginKey.setButtonText(u("Giữ Key/Scale trong Auto-Tune"));keepPluginKey.setToggleState(settings->getBoolValue("liveKeepPluginKey",e.pluginInstance()!=nullptr),juce::dontSendNotification);if(keepPluginKey.getToggleState())autoKey.setToggleState(false,juce::dontSendNotification);keepPluginKey.onClick=[this]{if(keepPluginKey.getToggleState())autoKey.setToggleState(false,juce::dontSendNotification);revision=~std::uint64_t(0);sendKey();owner.save();};
    keySelect.addItemList({"C","C# / Db","D","D# / Eb","E","F","F# / Gb","G","G# / Ab","A","A# / Bb","B"},1);keySelect.setSelectedId(settings->getIntValue("liveManualKey",1),juce::dontSendNotification);scaleSelect.addItem("Major",1);scaleSelect.addItem("Minor",2);scaleSelect.setSelectedId(settings->getIntValue("liveManualScale",1),juce::dontSendNotification);keySelect.onChange=[this]{sendKey();};scaleSelect.onChange=[this]{sendKey();};
    browser.navigate(settings->getValue("liveURL","https://www.youtube.com/"));timerCallback();startTimerHz(10);
}
KaraokePage::~KaraokePage(){stopTimer();persist();}
void KaraokePage::persist(){auto* p=owner.settings();p->setValue("liveTranspose",owner.engine.liveMusic->semitones());p->setValue("liveMusicGain",owner.engine.liveMusic->gain.load());p->setValue("liveMonitor",owner.engine.monitor.load());p->setValue("liveInputChannel",owner.engine.inputChannel.load());p->setValue("liveAutoKey",autoKey.getToggleState());p->setValue("liveKeepPluginKey",keepPluginKey.getToggleState());p->setValue("liveManualKey",keySelect.getSelectedId());p->setValue("liveManualScale",scaleSelect.getSelectedId());if(browser.address().startsWith("https://"))p->setValue("liveURL",browser.address());}
void KaraokePage::leave(){if(owner.engine.isRecording()){owner.status(u("Dừng thu giọng trước khi chuyển Studio."));return;}browser.pause();owner.engine.liveMode=false;setVisible(false);owner.showQuickMode(false);}
void KaraokePage::change(int step){auto& m=*owner.engine.liveMusic;m.setSemitones(m.semitones()+step);sendKey();timerCallback();}
void KaraokePage::sendKey(){auto& e=owner.engine;if(keepPluginKey.getToggleState()){e.usePluginKey();key.setText(u("Key/Scale: đặt trong Auto-Tune"),juce::dontSendNotification);return;}const auto source=e.liveMusic->key();const int base=autoKey.getToggleState()?(browser.advertisement()?-1:source.tonic):keySelect.getSelectedId()-1;const bool minor=autoKey.getToggleState()?source.minor:scaleSelect.getSelectedId()==2;const int note=base<0?-1:(base+e.liveMusic->semitones()+24)%12;if(note!=lastKey||minor!=lastMinor||revision!=source.revision||lastPlugin!=e.pluginInstance()){e.setLiveSongKey(note,minor);lastPlugin=e.pluginInstance();lastKey=note;lastMinor=minor;revision=source.revision;}key.setText(note<0?u("Đang nghe để dò tone…"):u("Tone đang hát: ")+juce::String(vocal::noteName(60+note))+(minor?" minor":" major"),juce::dontSendNotification);}
void KaraokePage::timerCallback(){if(!isVisible())return;auto& e=owner.engine;e.liveMode=true;const auto names=e.inputNames();if(input.getNumItems()!=names.size()||(names.size()>0&&input.getItemText(0)!=names[0])){input.clear(juce::dontSendNotification);input.addItemList(names,1);}input.setSelectedItemIndex(e.inputChannel.load(),juce::dontSendNotification);sendKey();const int n=e.liveMusic->semitones();offset.setText((n>0?"+":"")+juce::String(n)+u(" bán âm"),juce::dontSendNotification);down.setEnabled(n>-12);up.setEnabled(n<12);keySelect.setEnabled(!autoKey.getToggleState()&&!keepPluginKey.getToggleState());scaleSelect.setEnabled(!autoKey.getToggleState()&&!keepPluginKey.getToggleState());mic.setButtonText(e.monitor.load()?u("Micro đang bật · Tắt"):u("Bật micro để hát"));record.setButtonText(e.isRecording()?u("Dừng thu giọng"):u("Thu giọng"));reverb.setValue(e.reverb.load()*100,juce::dontSendNotification);delay.setValue(e.delay.load()*100,juce::dontSendNotification);
    for(juce::Component* control:std::initializer_list<juce::Component*>{&warmthLevel,&presenceLevel,&monitorLevel,&shortRoom,&compression,&musicDuck,&phonesLevel,&hiddenRoom})control->setEnabled(!owner.isBusy());
    const auto tuneName=owner.selectedPluginName(0);
    scanTune.setButtonText(tuneName.isEmpty()?u("Quét Auto-Tune"):tuneName);

    scanTune.setTooltip(u("Quét / chọn Auto-Tune. ")+tuneName);
    scanTune.setEnabled(owner.canEdit());lowLatency.setEnabled(owner.canEdit());
    saveVoice.setEnabled(!owner.isBusy());
    if(!warmthLevel.isMouseButtonDown())warmthLevel.setValue(e.warmth.load(),juce::dontSendNotification);
    if(!presenceLevel.isMouseButtonDown())presenceLevel.setValue(e.presence.load(),juce::dontSendNotification);
    if(!phonesLevel.isMouseButtonDown())phonesLevel.setValue(e.headphoneDb.load(),juce::dontSendNotification);
    if(!hiddenRoom.isMouseButtonDown())hiddenRoom.setValue(e.hiddenReverb.load()*100,juce::dontSendNotification);
    if(!musicDuck.isMouseButtonDown())musicDuck.setValue(e.musicDuckingDb.load(),juce::dontSendNotification);
    if(!music.isMouseButtonDown())music.setValue(e.liveMusic->gain.load()*100,juce::dontSendNotification);
    if(!monitorLevel.isMouseButtonDown())monitorLevel.setValue(e.monitorDb.load(),juce::dontSendNotification);
    if(!shortRoom.isMouseButtonDown())shortRoom.setValue(e.shortReverb.load()*100,juce::dontSendNotification);
    if(!micGain.isMouseButtonDown())micGain.setValue(e.inputDb.load(),juce::dontSendNotification);
    if(!compression.isMouseButtonDown())compression.setValue((e.ratio.load()-1)/3*100,juce::dontSendNotification);
    juce::String info=u("Mở bài trên YouTube rồi hát. Mỗi lần bấm = 1 bán âm; tốc độ nhạc giữ nguyên.\n\n")+e.deviceSummary()+"\n\n"+e.pluginName()+"\n"+e.toneLinkStatus;

    info+=u("\nNhạc đang lùi: ")+juce::String(e.musicDuckReduction.load(),1)+" dB";
    info+=u("\n\nNén đang giảm: ")+juce::String(e.gainReduction.load(),1)+" dB";
    if(e.fxBypass.load())info+=u("\nFX ĐANG TẮT: bấm Giọng tự nhiên để bật nén/vang.");
    if(!e.pluginInstance())info+=u("\nAUTO-TUNE CHƯA NẠP: chưa chỉnh cao độ trực tiếp.");
    else if(e.isPluginBypassed())info+=u("\nAUTO-TUNE ĐANG BYPASS: chưa chỉnh cao độ.");
    else if(!e.toneLink.complete()||!e.toneLink.enabled)info+=u("\nAUTO-TUNE CHƯA GHÉP KEY/SCALE: kiểm tra trong Mở Antares / menu Tone.");
    else info+=u("\nAUTO-TUNE ĐÃ NẠP: kiểm tra Key/Scale và thiết lập trong plugin.");
    if(e.pluginInstance())if(auto* bypass=e.pluginInstance()->getBypassParameter())if(bypass->getValue()>.5f)info+=u("\nBYPASS TRONG PLUGIN ĐANG BẬT: bấm Bật Auto-Tune để nghe chỉnh giọng.");
    info+="\n\n"+owner.userStatus();
    micLabel.setFont(12);micLabel.setText("Mic "+juce::String(vocal::gainToDb(e.inputPeak.load()),0)+" dBFS",juce::dontSendNotification);
    if(e.inputClipped.load())info+=u("\n\nMIC CLIP: giảm núm gain trên UPod Pro. Méo do quá tải đầu vào không thể sửa hoàn toàn bằng phần mềm.");
    if(browser.error().isNotEmpty())info+="\nYouTube: "+browser.error();if(browser.advertisement())info+=u("\nĐang phát quảng cáo · tạm chờ dò tone bài.");
    info+=u("\n\nUPod Pro: Mic with DSP OFF · Mixing OFF. Tắt Direct Out khi kiểm âm phần mềm.\n\nThu giọng lưu WAV micro gốc; mở Studio để mix và xuất file.");if(status.getText()!=info)status.setText(info,false);repaint();
}
void KaraokePage::resized(){
    const int w=getWidth(),h=getHeight(),x=w-310;title.setBounds(20,12,w-330,40);advanced.setBounds(w-190,18,170,30);back.setBounds(20,66,40,32);home.setBounds(68,66,90,32);search.setBounds(168,66,x-282,32);open.setBounds(x-104,66,94,32);browser.setBounds(20,110,x-30,h-130);sidebar.setBounds(x,64,300,h-80);
    const int sx=0;int y=0;auto row=[&](juce::Component& c,int height=30){c.setBounds(sx,y,290,height);y+=height+8;};
    devices.setBounds(sx,y,140,30);mic.setBounds(sx+146,y,144,30);y+=38;row(input,28);row(monitorHint,34);row(lowLatency);row(saveVoice);
    scanTune.setBounds(sx,y,176,30);antares.setBounds(sx+182,y,108,30);y+=38;
    for(auto pair:std::initializer_list<std::pair<juce::Label*,juce::Slider*>>{{&musicLabel,&music},{&phonesLabel,&phonesLevel},{&monitorLabel,&monitorLevel},{&micLabel,&micGain},{&compressionLabel,&compression},{&warmthLabel,&warmthLevel},{&presenceLabel,&presenceLevel},{&hiddenLabel,&hiddenRoom},{&shortLabel,&shortRoom},{&reverbLabel,&reverb},{&delayLabel,&delay},{&duckLabel,&musicDuck}}){pair.first->setBounds(sx,y,92,27);pair.second->setBounds(sx+92,y,198,27);y+=32;}
    row(offset,48);down.setBounds(sx,y,140,44);up.setBounds(sx+150,y,140,44);y+=52;row(reset);row(key,28);row(autoKey,26);row(keepPluginKey,26);keySelect.setBounds(sx,y,140,28);scaleSelect.setBounds(sx+150,y,140,28);y+=36;
    row(record);status.setBounds(sx,y,290,340);controls.setSize(290,y+350);
}
void KaraokePage::paint(juce::Graphics& g){g.fillAll(juce::Colour(0xff10151e));g.setColour(juce::Colour(0xff222c3a));g.drawVerticalLine(getWidth()-322,64,static_cast<float>(getHeight()-20));}

bool KaraokePage::validateControls() const {
    for(const juce::Component* c:std::initializer_list<const juce::Component*>{&warmthLevel,&presenceLevel,&phonesLevel,&hiddenRoom,&musicDuck,&scanTune,&antares,&lowLatency,&saveVoice,&monitorLevel,&shortRoom,&compression,&reverb,&delay,&music,&micGain,&keepPluginKey})
        if(c->getParentComponent()!=&controls||c->getWidth()<=0||c->getHeight()<=0||!controls.getLocalBounds().contains(c->getBounds()))return false;
    return true;
}
