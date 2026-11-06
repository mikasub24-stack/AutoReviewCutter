#pragma once
#include "AutoEq.h"
namespace vocal {
struct MixRecommendation {
    bool valid=false;
    VocalParameters settings;
    float activeRmsDb=-120, peakDb=-120;
    std::string message;
};
MixRecommendation recommendMix(const AudioChannels&,double,const EqSettings&,std::atomic<bool>&,std::atomic<float>&);
}
