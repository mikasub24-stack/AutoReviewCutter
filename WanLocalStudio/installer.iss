#define Version "0.3.0"
[Setup]
AppId={{AB8D6D18-541F-437B-86DA-9183FD483629}
AppName=Wan Local Studio
AppVersion={#Version}
DefaultDirName={localappdata}\Programs\Wan Local Studio
DefaultGroupName=Wan Local Studio
PrivilegesRequired=lowest
OutputDir=..\dist-wan
OutputBaseFilename=WanLocalStudio-{#Version}-Setup
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
Name: "{group}\Wan Local Studio"; Filename: "{app}\WanLocalStudio.exe"
Name: "{autodesktop}\Wan Local Studio"; Filename: "{app}\WanLocalStudio.exe"
[Run]
Filename: "{app}\WanLocalStudio.exe"; Description: "Mở Wan Local Studio"; Flags: nowait postinstall skipifsilent
