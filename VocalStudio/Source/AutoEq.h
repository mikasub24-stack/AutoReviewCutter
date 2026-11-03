#pragma once
#include "Dsp.h"
#include "Pitch.h"
#include <array>
namespace vocal {
struct EqSettings {float highPass=80,warmth=-2,presence=2,deharsh=0,deEss=.35f,inputDb=0;bool valid() const noexcept;};
bool sameEq(const EqSettings&,const EqSettings&) noexcept;
struct EqRecommendation {bool valid=false;EqSettings suggested;double voicedSeconds=0,clippedFraction=0,matchDb=0;std::array<double,6> bandDb{};std::string message;};
// A conservative starting point from the user's dry solo microphone recording.
// This does not infer a studio target, change pitch, or separate a backing mix.
EqRecommendation recommendEq(const AudioChannels&,double,const EqSettings&,std::atomic<bool>&,std::atomic<float>&);
}
