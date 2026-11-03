#pragma once
#include <array>
#include <atomic>
#include <string>
#include <vector>
namespace vocal {
struct PitchFrame {double seconds=0,midi=0,confidence=0,rms=0;};
struct PitchAnalysis {
    std::vector<PitchFrame> frames;
    std::array<double,12> chroma{};
    int tonic=-1;bool minor=false;
    double keyConfidence=0,voicedFraction=0,medianHz=0,clippedFraction=0;
    std::string alternative;
};
struct PitchOptions {
    float semitones=0,cents=0,correction=0,retuneMs=80,toleranceCents=12;
    int tonic=-1;bool minor=false,preserveFormants=true,autoKey=false,repairLightClip=false;
};
using AudioChannels=std::vector<std::vector<float>>;
PitchAnalysis analysePitch(const AudioChannels&,double rate,bool monophonic,std::atomic<bool>& cancel,std::atomic<float>& progress);
AudioChannels repairLightClipping(const AudioChannels&,double rate);
AudioChannels processPitch(const AudioChannels&,double rate,const PitchOptions&,const PitchAnalysis*,std::atomic<bool>& cancel,std::atomic<float>& progress);
std::string noteName(double midi);
double nearestScaleNote(double midi,int tonic,bool minor);
}
