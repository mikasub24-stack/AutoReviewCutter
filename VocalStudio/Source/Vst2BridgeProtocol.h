#pragma once
#if JUCE_WINDOWS
#include <windows.h>
#include <cstdint>
namespace vstbridge {
constexpr uint32_t version=1;
constexpr int maxFrames=16384,maxParams=8192,metadataSize=1024*1024,stateCapacity=48*1024*1024;
enum Command:uint32_t { hello=1,prepare,release,reset,process,getState,setState,showEditor,hideEditor,quit };
// Fixed-width, pointer-free protocol shared by x64 app and x86 helper.
struct Shared {
    uint32_t protocol,command,success,frames,block,inputs,outputs,parameterCount,stateBytes,metadataBytes,latency;
    double rate,tail;
    volatile LONG parameterValues[maxParams],pendingValues[maxParams],dirty[maxParams];
    float audio[2][maxFrames];
    char metadata[metadataSize];
    char state[stateCapacity];
};
static_assert(offsetof(Shared,rate)==48);
static_assert(offsetof(Shared,parameterValues)==64);
inline LONG bits(float f){LONG b;static_assert(sizeof(b)==sizeof(f));memcpy(&b,&f,sizeof(b));return b;}
inline float number(LONG b){float f;memcpy(&f,&b,sizeof(f));return f;}
inline juce::String name(const juce::String& id,const char* suffix){return "Local\\VocalStudioBridge-"+id+suffix;}
inline juce::File helper(){return juce::File::getSpecialLocation(juce::File::currentExecutableFile).getSiblingFile("VocalStudioBridge32.exe");}
}
#endif
