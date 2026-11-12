#define Version "0.3.1"
[Setup]
AppId={{AB8D6D18-541F-437B-86DA-9183FD483629}
AppName=Hunyuan Local Studio
AppVersion={#Version}
DefaultDirName={localappdata}\Programs\Wan Local Studio
DefaultGroupName=Hunyuan Local Studio
UsePreviousGroup=no
PrivilegesRequired=lowest
OutputDir=..\dist-wan
OutputBaseFilename=HunyuanLocalStudio-{#Version}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\WanLocalStudio.exe
SetupIconFile=icon.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
[Files]
Source: "build\WanLocalStudio\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
[Icons]
Name: "{group}\Hunyuan Local Studio"; Filename: "{app}\WanLocalStudio.exe"
Name: "{autodesktop}\Hunyuan Local Studio"; Filename: "{app}\WanLocalStudio.exe"
[InstallDelete]
Type: files; Name: "{userprograms}\Wan Local Studio\Wan Local Studio.lnk"
Type: dirifempty; Name: "{userprograms}\Wan Local Studio"
Type: files; Name: "{app}\vendor\wan22-official-template.json"
Type: files; Name: "{autodesktop}\Wan Local Studio.lnk"
Type: files; Name: "{group}\Wan Local Studio.lnk"
[Run]
Filename: "{app}\WanLocalStudio.exe"; Description: "Mở Hunyuan Local Studio"; Flags: nowait postinstall skipifsilent
