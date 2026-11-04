#include "MainComponent.h"
namespace {juce::String u(const char* s){return juce::String::fromUTF8(s);}}
class TuneFixPanel final : public juce::Component,private juce::Timer {
    StudioMain& owner;juce::Label title,help;juce::TextEditor report;juce::TextButton apply,undo,editor,setup;
public:
    explicit TuneFixPanel(StudioMain& main):owner(main){
        for(juce::Component* c:std::initializer_list<juce::Component*>{&title,&help,&report,&apply,&undo,&editor,&setup})addAndMakeVisible(c);
        title.setText(u("FIX MÉO AUTO-TUNE · GIỮ GIỌNG TỰ NHIÊN"),juce::dontSendNotification);title.setFont(juce::Font(22,juce::Font::bold));
        help.setText(u("Giảm kiểu kéo nốt gắt, không phải cứu tiếng mic quá tải. Dừng thu/phát trước khi áp dụng.\nXác nhận tone bài sau nâng/hạ cung; kiểm tra Major/Minor bằng tai nếu dò chưa chắc."),juce::dontSendNotification);
        apply.setButtonText(u("Áp dụng · Kéo nhẹ hơn"));undo.setButtonText(u("Hoàn tác Fix méo"));editor.setButtonText(u("Mở Antares"));setup.setButtonText(u("Ghép Key/Scale / FX"));
        apply.onClick=[this]{if(!owner.canEdit())return;auto r=owner.engine.fixTuneArtifacts();owner.status(r.wasOk()?u("Đã áp dụng Fix méo Auto-Tune; nghe thử và đối chiếu."):r.getErrorMessage());if(r.wasOk())owner.save();timerCallback();};
        undo.onClick=[this]{if(!owner.canEdit())return;auto r=owner.engine.undoTuneArtifacts();owner.status(r.wasOk()?u("Đã hoàn tác Fix méo Auto-Tune."):r.getErrorMessage());if(r.wasOk())owner.save();timerCallback();};
        editor.onClick=[this]{owner.openAntaresEditor();};setup.onClick=[this]{owner.showVocalTools();};
        report.setMultiLine(true);report.setReadOnly(true);report.setScrollbarsShown(true);setSize(850,600);timerCallback();startTimerHz(5);
    }
    ~TuneFixPanel() override{stopTimer();}
    void paint(juce::Graphics& g) override{g.fillAll(juce::Colour(0xff10151e));}
    void resized() override{const int w=getWidth();title.setBounds(20,14,w-40,36);help.setBounds(20,57,w-40,64);apply.setBounds(20,137,260,36);undo.setBounds(295,137,225,36);editor.setBounds(535,137,w-555,36);setup.setBounds(20,187,260,32);report.setBounds(20,236,w-40,getHeight()-256);}
    void timerCallback() override{
        auto& e=owner.engine;const bool editable=owner.canEdit()&&!e.isEqListening();apply.setEnabled(editable&&!e.canUndoTuneArtifacts());undo.setEnabled(editable&&e.canUndoTuneArtifacts());editor.setEnabled(!owner.isBusy()&&e.pluginInstance()!=nullptr);setup.setEnabled(!owner.isBusy());
        juce::String text=e.pluginName()+"\n"+e.toneLinkStatus+"\n\n";
        text+=e.songTonic>=0?u("Tone đang gửi: ")+juce::String(vocal::noteName(60+e.songTonic))+(e.songMinor?" minor":" major"):u("Chưa có tone bài rõ; chờ dò hoặc chọn tay trên màn hình hát.");
        text+=u("\n\nKhi plugin hỗ trợ và xác minh được nhãn/đơn vị:\n• Retune Speed: tối thiểu 35 ms, không làm nhanh hơn mức bạn đã đặt.\n• Humanize: tối thiểu 50%; Flex-Tune: tối thiểu 20%.\n• Formant: bật nếu có nhãn On/Off rõ. Không đổi quãng giọng, transpose hay formant shift.\n\nTham số không công khai/không rõ đơn vị sẽ được giữ nguyên và báo lại. Nếu không xác minh Retune Speed thì không đổi nhóm tham số kéo giọng. Không tự bật plugin đang bypass.\n\n");
        text+=e.tuneFixStatus.isNotEmpty()?e.tuneFixStatus:u("Chưa áp dụng. Đây là thiết lập khởi đầu để nghe thử, không đảm bảo hết mọi méo hoặc tự xác định đúng tone 100%. Chỉ hoàn tác lần Fix trong phiên hiện tại; không ghi đè nếu bạn đã chỉnh tham số đó trong Antares.");
        if(e.inputClipped.load())text+=u("\n\nMIC CLIP: giảm gain trên sound card. Fix Auto-Tune không cứu overload đầu vào.");
        if(report.getText()!=text)report.setText(text,false);
    }
};
juce::Component* createTuneFixPanel(StudioMain& owner){return new TuneFixPanel(owner);}
