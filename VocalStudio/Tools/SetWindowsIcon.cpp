// Customize only the icon resources in our copied CEF launcher, never the SDK.
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
struct Group {std::wstring name;WORD id=0,language=0;bool named=false;};
static BOOL CALLBACK language(HMODULE,LPCWSTR,LPCWSTR name,WORD lang,LONG_PTR context){
    auto& groups=*reinterpret_cast<std::vector<Group>*>(context);Group group;group.language=lang;
    group.named=!IS_INTRESOURCE(name);if(group.named)group.name=name;else group.id=static_cast<WORD>(reinterpret_cast<ULONG_PTR>(name));groups.push_back(group);return TRUE;
}
static BOOL CALLBACK names(HMODULE module,LPCWSTR type,LPWSTR name,LONG_PTR context){EnumResourceLanguagesW(module,type,name,language,context);return TRUE;}
static uint16_t u16(const unsigned char* p){return static_cast<uint16_t>(p[0]|p[1]<<8);}
static uint32_t u32(const unsigned char* p){return static_cast<uint32_t>(p[0])|static_cast<uint32_t>(p[1])<<8|static_cast<uint32_t>(p[2])<<16|static_cast<uint32_t>(p[3])<<24;}
int wmain(int argc,wchar_t** argv){
    if(argc!=3)return 2;
    std::ifstream input(argv[2],std::ios::binary|std::ios::ate);if(!input)return 3;
    const auto length=input.tellg();if(length<22||length>16*1024*1024)return 4;
    std::vector<unsigned char> icon(static_cast<size_t>(length));input.seekg(0);input.read(reinterpret_cast<char*>(icon.data()),static_cast<std::streamsize>(icon.size()));
    const auto count=u16(icon.data()+4);if(u16(icon.data())||u16(icon.data()+2)!=1||count<1||count>32||6u+16u*count>icon.size())return 5;
    std::vector<Group> groups;HMODULE module=LoadLibraryExW(argv[1],nullptr,LOAD_LIBRARY_AS_DATAFILE|LOAD_LIBRARY_AS_IMAGE_RESOURCE);if(!module)return 6;
    EnumResourceNamesW(module,RT_GROUP_ICON,names,reinterpret_cast<LONG_PTR>(&groups));FreeLibrary(module);
    if(groups.empty())groups.push_back(Group{L"",1,0,false});
    auto update=BeginUpdateResourceW(argv[1],FALSE);if(!update)return 7;
    std::vector<unsigned char> group(6u+14u*count);memcpy(group.data(),icon.data(),6);
    bool ok=true;
    for(WORD i=0;i<count&&ok;++i){
        const auto* entry=icon.data()+6+16*i;const auto size=u32(entry+8),offset=u32(entry+12);
        if(!size||offset>icon.size()||size>icon.size()-offset){ok=false;break;}
        auto* target=group.data()+6+14*i;memcpy(target,entry,12);const WORD id=static_cast<WORD>(1000+i);target[12]=static_cast<unsigned char>(id&255);target[13]=static_cast<unsigned char>(id>>8);
        ok=UpdateResourceW(update,RT_ICON,MAKEINTRESOURCEW(id),0,icon.data()+offset,size)!=FALSE;
    }
    for(const auto& item:groups)if(ok)ok=UpdateResourceW(update,RT_GROUP_ICON,item.named?item.name.c_str():MAKEINTRESOURCEW(item.id),item.language,group.data(),static_cast<DWORD>(group.size()))!=FALSE;
    if(!EndUpdateResourceW(update,ok?FALSE:TRUE)||!ok)return 8;
    module=LoadLibraryExW(argv[1],nullptr,LOAD_LIBRARY_AS_DATAFILE|LOAD_LIBRARY_AS_IMAGE_RESOURCE);if(!module)return 9;
    for(const auto& item:groups){auto resource=FindResourceExW(module,RT_GROUP_ICON,item.named?item.name.c_str():MAKEINTRESOURCEW(item.id),item.language);auto data=resource?LoadResource(module,resource):nullptr;auto* bytes=data?static_cast<const unsigned char*>(LockResource(data)):nullptr;if(!bytes||SizeofResource(module,resource)!=group.size()||memcmp(bytes,group.data(),group.size())){FreeLibrary(module);return 10;}}
    FreeLibrary(module);std::cout<<"Verified "<<count<<" icon sizes in launcher resources\n";return 0;
}
