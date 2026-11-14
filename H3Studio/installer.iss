[Setup]
AppId={{9E26F86F-12DD-4A73-9EBB-2EC45BFF2C62}
AppName=H3 Studio
AppVersion=0.2.0
DefaultDirName={localappdata}\Programs\H3 Studio
DefaultGroupName=H3 Studio
PrivilegesRequired=lowest
OutputDir=..\dist-h3
OutputBaseFilename=H3Studio-0.2.0-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\H3Studio.exe
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
[Files]
Source: "build\H3Studio\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion
[Icons]
Name: "{group}\H3 Studio"; Filename: "{app}\H3Studio.exe"
Name: "{autodesktop}\H3 Studio"; Filename: "{app}\H3Studio.exe"
[Run]
Filename: "{app}\H3Studio.exe"; Description: "Mở H3 Studio"; Flags: nowait postinstall skipifsilent
