#pragma once
#include "Pitch.h"
namespace vocal {
struct VoiceProfile {
    bool valid=false;
    double lowMidi=0,highMidi=0,medianMidi=0,voicedSeconds=0;
};
struct SongFit {
    bool valid=false,fits=false;
    int semitones=0,singingOctaves=0;
    double melodyLow=0,melodyHigh=0,targetLow=0,targetHigh=0,outsideFraction=1;
};
VoiceProfile measureComfortableRange(const PitchAnalysis&);
SongFit fitSongToVoice(const VoiceProfile&,const PitchAnalysis& melody,int maximumShift=6);
std::string octaveNote(double midi);
}
