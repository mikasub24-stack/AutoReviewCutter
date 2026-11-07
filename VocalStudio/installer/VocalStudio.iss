#ifndef SourceDir
#define SourceDir "..\..\build\vocal\VocalStudio_artefacts\Release"
#endif
#ifndef OutputDir
#define OutputDir "..\..\dist"
#endif
[Setup]
AppId={{3BEE7FF2-E9DE-47C8-A770-B8D4E2E3AE1C}
AppName=Vocal Studio
AppVersion=1.9.2
AppPublisher=VocalStudio
DefaultDirName={localappdata}\Programs\VocalStudio
DefaultGroupName=Vocal Studio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=VocalStudio-1.9.2-Setup
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
UninstallDisplayIcon={app}\VocalStudio.ico
WizardStyle=modern
SetupIconFile=..\Assets\VocalStudio.ico
LicenseFile=..\LICENSE.txt
[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; Flags: checkedonce
[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.lib,*.pdb,*.exp,bootstrap.exe,bootstrapc.exe,Browser*.json,Browser*.log,debug.log"
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\THIRD_PARTY.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\JUCE-LICENSE.md"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "..\ThirdParty\Signalsmith-Stretch-LICENSE.txt"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "..\ThirdParty\Signalsmith-Linear-LICENSE.txt"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "..\ThirdParty\VeSTige-LICENSE.txt"; DestDir: "{app}\licenses"; Flags: ignoreversion
[Icons]
Name: "{group}\Vocal Studio"; Filename: "{app}\VocalStudio.exe"; IconFilename: "{app}\VocalStudio.ico"
Name: "{group}\Vocal Studio - Recovery"; Filename: "{app}\VocalStudio.exe"; Parameters: "--safe-mode"; IconFilename: "{app}\VocalStudio.ico"
Name: "{autodesktop}\Vocal Studio"; Filename: "{app}\VocalStudio.exe"; Tasks: desktopicon; IconFilename: "{app}\VocalStudio.ico"
[Run]
Filename: "{app}\VocalStudio.exe"; Description: "Open Vocal Studio"; Flags: nowait postinstall skipifsilent
