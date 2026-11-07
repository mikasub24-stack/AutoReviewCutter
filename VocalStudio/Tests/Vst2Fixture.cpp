#include "vestige/vestige.h"
#include <algorithm>
#include <cstring>
#include <cstddef>
#include <cstdlib>
#if defined(_WIN64)
static_assert(offsetof(AEffect,processReplacing)==120);
#endif
struct Fixture {
    AEffect effect{};audioMasterCallback host=nullptr;float gain=.25f;double rate=48000;int block=256,pos=0;float delay[2][16]{};
    static Fixture& self(AEffect* e){return *static_cast<Fixture*>(e->object);}
    static intptr_t __cdecl dispatch(AEffect* e,int op,int,intptr_t value,void* ptr,float opt){auto& s=self(e);switch(op){
        case effOpen:return 1;
        case effClose:delete &s;return 1;
        case effSetSampleRate:s.rate=opt;return 1;
        case effSetBlockSize:s.block=static_cast<int>(value);return 1;
        case effMainsChanged:if(!value){s.pos=0;for(auto& c:s.delay)std::fill_n(c,16,0.f);}return 1;
        case effGetEffectName:std::strcpy(static_cast<char*>(ptr),"Vocal VST2 Gain Delay Fixture");return 1;
        case effGetVendorString:std::strcpy(static_cast<char*>(ptr),"VocalStudio");return 1;
        case effGetParamName:std::strcpy(static_cast<char*>(ptr),"Gain");return 1;
        case 6:std::strcpy(static_cast<char*>(ptr),"");return 1;
        case 7:std::strcpy(static_cast<char*>(ptr),"fixture");return 1;
        case 23:*static_cast<void**>(ptr)=&s.gain;return sizeof(float);
        case 24:if(value==sizeof(float))std::memcpy(&s.gain,ptr,sizeof(float));return 1;
        default:return 0;
    }}
    static void __cdecl set(AEffect* e,int,float v){self(e).gain=v;}
    static float __cdecl get(AEffect* e,int){return self(e).gain;}
    static void __cdecl process(AEffect* e,float** in,float** out,int n){auto& s=self(e);
#if defined(_WIN32) && !defined(_WIN64)
        if(s.gain>.99f)std::_Exit(77);
#endif
        const bool valid=s.host(e,audioMasterGetSampleRate,0,0,nullptr,0)==static_cast<intptr_t>(s.rate)&&s.host(e,audioMasterGetBlockSize,0,0,nullptr,0)==s.block&&s.host(e,audioMasterGetTime,0,0,nullptr,0)!=0;
        for(int i=0;i<n;++i){for(int c=0;c<2;++c){out[c][i]=valid?s.delay[c][s.pos]*s.gain:-.9f;s.delay[c][s.pos]=in[c][i];}s.pos=(s.pos+1)%16;}
    }
};
#if defined(_WIN32)
#define EXPORT __declspec(dllexport)
#else
#define EXPORT __attribute__((visibility("default")))
#endif
extern "C" EXPORT AEffect* __cdecl VSTPluginMain(audioMasterCallback host){
    if(!host||host(nullptr,audioMasterVersion,0,0,nullptr,0)<2400)return nullptr;
    auto* s=new Fixture;s->host=host;auto& e=s->effect;e.magic=kEffectMagic;e.dispatcher=Fixture::dispatch;e.setParameter=Fixture::set;e.getParameter=Fixture::get;e.numPrograms=1;e.numParams=1;e.numInputs=e.numOutputs=2;e.flags=effFlagsCanReplacing|32;e.object=s;e.uniqueID=0x76467432;e.version=1;e.processReplacing=Fixture::process;e.initialDelay=16;return &e;
}
