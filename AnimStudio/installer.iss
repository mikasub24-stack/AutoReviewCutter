; Trinh cai dat AnimStudio (Inno Setup 6, https://jrsoftware.org/isdl.php). build.bat tu goi:
;   ISCC.exe installer.iss "/DAppVer=1.4.7" "/DAppName=AnimStudio" "/DAppSlug=AnimStudio"
; Dong goi thu muc dist\<AppSlug>\ (ban da build) thanh dist\<AppSlug>_Setup_<AppVer>.exe
; - Cai vao thu muc NGUOI DUNG (%LOCALAPPDATA%\Programs\<AppSlug>), KHONG can quyen admin.
; - Cung AppId: chay Setup ban moi len ban cu = cap nhat tai cho (giu nguyen anh tu bo vao characters\custom, backgrounds\custom).
; - Du lieu nguoi dung (du an, anh da ve, giong, cau hinh, ban quyen, dang nhap Flow) nam o C:\Users\<ban>\AnimStudioData
;   nen cai lai / go cai dat KHONG lam mat; go cai dat chi xoa thu muc chuong trinh.
; TEP NAY LUU DANG UTF-8 CO BOM (de chu tieng Viet co dau hien dung).

#ifndef AppVer
  #define AppVer "1.4.7"
#endif
#ifndef AppName
  #define AppName "AnimStudio"
#endif
#ifndef AppSlug
  #define AppSlug "AnimStudio"
#endif

[Setup]
AppId={{6B1E4F52-3A7C-4D19-9E08-A2C5D7F31B64}
AppName={#AppName}
AppVersion={#AppVer}
AppVerName={#AppName} {#AppVer}
AppPublisher={#AppName}
DefaultDirName={autopf}\{#AppSlug}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist
OutputBaseFilename={#AppSlug}_Setup_{#AppVer}
SetupIconFile=animstudio.ico
UninstallDisplayIcon={app}\{#AppSlug}.exe
Compression=lzma2/fast
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
UsePreviousAppDir=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Messages]
ButtonNext=Tiếp tục >
ButtonBack=< Quay lại
ButtonInstall=Cài đặt
ButtonCancel=Hủy
ButtonFinish=Hoàn tất
WelcomeLabel1=Cài đặt [name]
WelcomeLabel2=Trình cài đặt sẽ cài [name/ver] vào máy của bạn. Cài xong là mở chương trình dùng được ngay (có dùng thử 4 giờ).%n%nNên đóng các chương trình khác trước khi tiếp tục.
SelectDirLabel3=Chương trình sẽ được cài vào thư mục sau.
SelectDirBrowseLabel=Bấm Tiếp tục để cài vào thư mục này, hoặc bấm Duyệt để chọn thư mục khác.
FinishedHeadingLabel=Đã cài xong [name]
FinishedLabelNoIcons=Đã cài xong [name].
FinishedLabel=Đã cài xong [name]. Bạn có thể mở chương trình từ Start Menu hoặc biểu tượng ngoài Desktop.

[CustomMessages]
english.DesktopIcon=Tạo biểu tượng ngoài Desktop
english.LaunchApp=Mở {#AppName} ngay

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\{#AppSlug}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppSlug}.exe"; IconFilename: "{app}\animstudio.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppSlug}.exe"; IconFilename: "{app}\animstudio.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppSlug}.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent
