#define Version "0.2.0"
[Setup]
AppId={{285EA01D-73D3-4249-B8DC-7F7C89CC2860}
AppName=Cinecode Studio
AppVersion={#Version}
DefaultDirName={localappdata}\Programs\Cinecode Studio
DefaultGroupName=Cinecode Studio
PrivilegesRequired=lowest
OutputDir=..\dist-cinecode
OutputBaseFilename=CinecodeStudio-{#Version}-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\CinecodeStudio.exe
SetupIconFile=icon.ico
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
[Files]
Source: "build\CinecodeStudio\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
[Icons]
Name: "{group}\Cinecode Studio"; Filename: "{app}\CinecodeStudio.exe"
Name: "{autodesktop}\Cinecode Studio"; Filename: "{app}\CinecodeStudio.exe"
[Run]
Filename: "{app}\CinecodeStudio.exe"; Description: "Mở Cinecode Studio"; Flags: nowait postinstall skipifsilent
