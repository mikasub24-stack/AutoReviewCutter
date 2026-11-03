#include "VoiceFit.h"
#include <algorithm>
#include <cmath>
#include <limits>
namespace vocal {namespace {
std::vector<double> reliableNotes(const PitchAnalysis& analysis){
    std::vector<double> notes;if(!analysis.monophonic)return notes;
    for(std::size_t i=1;i+1<analysis.frames.size();++i){const auto& f=analysis.frames[i];if(f.confidence<.9||f.rms<.003||!std::isfinite(f.midi)||f.midi<33||f.midi>96)continue;
        const auto& a=analysis.frames[i-1];const auto& b=analysis.frames[i+1];if(a.confidence<.8||b.confidence<.8)continue;
        if(std::abs(a.midi-b.midi)<1&&std::abs(f.midi-(a.midi+b.midi)*.5)>7)continue;
        notes.push_back(f.midi);
    }return notes;
}
double quantile(std::vector<double> notes,double fraction){std::sort(notes.begin(),notes.end());const double position=fraction*(notes.size()-1);const auto low=static_cast<std::size_t>(position);const auto high=std::min(low+1,notes.size()-1);return notes[low]+(notes[high]-notes[low])*(position-low);}
}
std::string octaveNote(double midi){const int n=static_cast<int>(std::llround(midi));return noteName(n)+std::to_string(n/12-1);}
VoiceProfile measureComfortableRange(const PitchAnalysis& analysis){VoiceProfile result;auto notes=reliableNotes(analysis);if(notes.size()<100||analysis.clippedFraction>.01)return result;result.lowMidi=quantile(notes,.08);result.highMidi=quantile(notes,.92);result.medianMidi=quantile(notes,.5);result.voicedSeconds=notes.size()*.02;result.valid=result.highMidi-result.lowMidi>=4&&result.voicedSeconds>=2;return result;}
SongFit fitSongToVoice(const VoiceProfile& profile,const PitchAnalysis& melody,int maximumShift){
    SongFit result;if(!profile.valid||!melody.monophonic||!std::isfinite(profile.lowMidi)||!std::isfinite(profile.highMidi)||profile.highMidi-profile.lowMidi<4)return result;
    auto notes=reliableNotes(melody);if(notes.size()<50)return result;result.melodyLow=quantile(notes,.03);result.melodyHigh=quantile(notes,.97);double best=std::numeric_limits<double>::infinity();maximumShift=std::clamp(maximumShift,0,12);
    for(int shift=-maximumShift;shift<=maximumShift;++shift)for(int octave=-2;octave<=2;++octave){const double low=result.melodyLow+shift+octave*12,high=result.melodyHigh+shift+octave*12;const double overflow=std::max(0.0,profile.lowMidi-low)+std::max(0.0,high-profile.highMidi);double outside=0;for(double note:notes)if(note+shift+octave*12<profile.lowMidi-.25||note+shift+octave*12>profile.highMidi+.25)outside+=1;outside/=notes.size();const double centre=std::abs((low+high-profile.lowMidi-profile.highMidi)*.5);const double edgeCost=std::max(0.0,profile.lowMidi+1-low)+std::max(0.0,high-(profile.highMidi-1));const double cost=overflow*100+outside*100+edgeCost*.25+centre*.1+std::abs(shift)*.2+std::abs(octave)*.01;
        if(cost<best){best=cost;result.valid=true;result.semitones=shift;result.singingOctaves=octave;result.targetLow=low;result.targetHigh=high;result.outsideFraction=outside;result.fits=overflow<.35&&outside<.05;}
    }return result;
}
}
