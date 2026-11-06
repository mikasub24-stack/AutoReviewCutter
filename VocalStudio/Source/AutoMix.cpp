#include "AutoMix.h"
#include <algorithm>
#include <cmath>
namespace vocal {
MixRecommendation recommendMix(const AudioChannels& audio,double rate,const EqSettings& before,std::atomic<bool>& cancel,std::atomic<float>& progress){
    MixRecommendation result;
    auto eq=recommendEq(audio,rate,before,cancel,progress);
    if(!eq.valid||cancel){result.message=eq.message;return result;}
    // Measure active 50 ms windows; pauses must not cause excessive gain boost.
    const auto window=static_cast<std::size_t>(rate*.05);
    std::vector<double> levels;
    double peak=0;
    for(std::size_t start=0;start<audio[0].size();start+=window){
        if(cancel){result.message="Đã hủy tự mix.";return result;}
        double power=0;const auto end=std::min(start+window,audio[0].size());
        for(const auto& channel:audio)for(auto i=start;i<end;++i){
            const double x=channel[i];
            if(!std::isfinite(x)){result.message="Bản thu có mẫu không hợp lệ.";return result;}
            peak=std::max(peak,std::abs(x));power+=x*x;
        }
        levels.push_back(std::sqrt(power/((end-start)*audio.size())));
    }
    const double gate=std::max(.003,peak*.03);
    levels.erase(std::remove_if(levels.begin(),levels.end(),[gate](double v){return v<gate;}),levels.end());
    if(levels.size()<20||peak>=1.0){result.message="Giọng quá nhỏ hoặc có đỉnh vượt mức: kiểm tra gain và thu lại.";return result;}
    std::sort(levels.begin(),levels.end());
    result.activeRmsDb=gainToDb(static_cast<float>(levels[levels.size()/2]));
    result.peakDb=gainToDb(static_cast<float>(peak));
    auto& p=result.settings;p=preset(4);
    const auto& e=eq.suggested;
    p.highPassHz=e.highPass;p.warmthDb=e.warmth;p.presenceDb=e.presence;p.deEss=e.deEss;p.deharsh=e.deharsh;
    // Bounded normalization before gentle compression, leaving room for peaks.
    p.inputDb=std::clamp(-20.0f-result.activeRmsDb,-12.0f,6.0f);
    p.inputDb=std::min(p.inputDb,-3.0f-result.peakDb);
    p.thresholdDb=std::clamp(result.activeRmsDb+p.inputDb-3.0f,-30.0f,-14.0f);
    const float spread=gainToDb(static_cast<float>(levels[levels.size()*9/10]))-gainToDb(static_cast<float>(levels[levels.size()/10]));
    p.ratio=spread>12?3.0f:2.0f;p.makeupDb=1.5f;
    p.leveling=std::clamp(spread/20.0f,.25f,.75f);
    p.dynamicTame=std::clamp(e.deharsh,.15f,.55f);p.bypass=false;
    result.valid=true;
    result.message="Đã phân tích EQ và độ lớn giọng; đặt nén nhẹ, cân câu và vang né giọng. Nghe trước/sau để chọn. Chưa tự cân với beat hoặc mastering; không đổi Antares/Key/Scale.";
    progress=1;return result;
}
}
