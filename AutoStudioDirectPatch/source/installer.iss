; Trinh cai dat Auto Studio (Inno Setup 6, https://jrsoftware.org/isdl.php). build.bat tu goi:
;   ISCC.exe installer.iss "/DAppVer=2.0.0" "/DAppName=Auto Studio" "/DAppSlug=AutoStudio"
; Dong goi thu muc dist\<AppSlug>\ (ban da build + da tu kiem tra) thanh dist\<AppSlug>_Setup_<AppVer>.exe
; - Cai vao thu muc NGUOI DUNG (%LOCALAPPDATA%\Programs\<AppSlug>), KHONG can quyen admin -> tu cap nhat ghi de duoc.
; - Cung AppId: chay Setup ban moi len ban cu = cap nhat tai cho. Chay voi /SILENT hoac /VERYSILENT (tu cap nhat trong app) thi cai im lang roi tu mo lai chuong trinh.
; - CAI XONG LA DU APP + DU LIEU: sau khi chep tep, Setup chay  AutoStudio.exe --hub-install-all  (an) de tai ffmpeg, mo hinh AI, thu vien GPU, moi truong giong Ninh Don...
;   va ve tien do len CHINH thanh tien trinh cua Setup (doc tep van ban 1 dong do app ghi, giao thuc o datahub\installall.py - hai ben phai khop nhau).
;   Nguoi dung bo chon tac vu "getdata" hoac bam Huy luc dang tai -> bo qua buoc nay, app van cai xong, thieu gi thi tab "Tai du lieu can thiet" tai tiep.
;   Cai im lang (tu cap nhat) thi KHONG tai du lieu (app tu hoi neu thieu).
; - Go cai dat chi xoa thu muc chuong trinh; du lieu / cai dat / mo hinh da tai (C:\Users\<ban>\AutoStudioData, SmartCutData) duoc GIU LAI.
; TEP NAY LUU DANG UTF-8 CO BOM (de chu tieng Viet co dau hien dung).

#ifndef AppVer
  #define AppVer "2.5.50"
#endif
#ifndef AppName
  #define AppName "Auto Studio"
#endif
#ifndef AppSlug
  #define AppSlug "AutoStudio"
#endif

[Setup]
AppId={{4637A9DB-628F-4B48-9409-E1B4174241BE}
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
SetupIconFile=autostudio.ico
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
WelcomeLabel2=Trình cài đặt sẽ cài [name/ver] vào máy của bạn rồi tự tải luôn dữ liệu cần thiết (cần Internet, vài GB). Cài xong là mở chương trình dùng được ngay.%n%nNên đóng các chương trình khác trước khi tiếp tục.
SelectDirLabel3=Chương trình sẽ được cài vào thư mục sau.
SelectDirBrowseLabel=Bấm Tiếp tục để cài vào thư mục này, hoặc bấm Duyệt để chọn thư mục khác.
FinishedHeadingLabel=Đã cài xong [name]
FinishedLabelNoIcons=Đã cài xong [name].
FinishedLabel=Đã cài xong [name]. Bạn có thể mở chương trình từ Start Menu hoặc biểu tượng ngoài Desktop.

[CustomMessages]
english.DesktopIcon=Tạo biểu tượng ngoài Desktop
english.LaunchApp=Mở {#AppName} ngay
english.DataGroup=Dữ liệu cần thiết:
english.GetData=Tải luôn dữ liệu cần thiết ngay khi cài (khoảng 3–6 GB, cần Internet). Bỏ chọn thì tải sau trong chương trình.

[Tasks]
Name: "getdata"; Description: "{cm:GetData}"; GroupDescription: "{cm:DataGroup}"
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "dist\{#AppSlug}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

Source: "ytdl\douyin_direct\vendor\APACHE-2.0.txt"; DestDir: "{app}\licenses\Douyin-Direct"; Flags: ignoreversion
Source: "ytdl\douyin_direct\vendor\NOTICE.txt"; DestDir: "{app}\licenses\Douyin-Direct"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppSlug}.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppSlug}.exe"; Tasks: desktopicon

[Run]
; cai thuong: hien o trang cuoi, nguoi dung tich de mo
Filename: "{app}\{#AppSlug}.exe"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent
; cai im lang (tu cap nhat trong app): tu mo lai chuong trinh sau khi cai xong
Filename: "{app}\{#AppSlug}.exe"; Parameters: "--after-restart"; Flags: nowait; Check: WizardSilent

[Code]
{ ---- Tai du lieu ngay trong Setup. Tep tien do 1 dong, 8 truong cach nhau '|':
       TRANG_THAI|phan_nghin|nhip|so_thu_tu|tong_so|khoa_goi|phan_tram|MB
       R dang chay · D xong · F xong nhung co goi loi (khoa_goi = danh sach, cach nhau dau phay) · C bi huy · E khong du o dia (phan_tram = MB con trong, MB = MB can) ---- }
var
  HubRunning: Boolean;
  HubSkip: Boolean;
  HubNote: String;
  HubSt, HubKy: String;
  HubPm, HubTick, HubIx, HubNn, HubPc, HubMb: Integer;

{ ---- Giu giao dien phan hoi trong vong lap cho: Inno Setup moi KHONG con doi tuong Application (chi con WizardForm / UninstallProgressForm)
       nen goi thang Windows API (PeekMessage / DispatchMessage). Bo dem TMsgBuf 64 byte lon hon MSG that (28 byte x86 / 48 byte x64). ---- }
type
  TMsgBuf = record
    f0, f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15: Longint;
  end;

function PeekMessageW(var lpMsg: TMsgBuf; hWnd: Longint; wMsgFilterMin, wMsgFilterMax, wRemoveMsg: Longint): Longint;
  external 'PeekMessageW@user32.dll stdcall';
function TranslateMessage(var lpMsg: TMsgBuf): Longint;
  external 'TranslateMessage@user32.dll stdcall';
function DispatchMessageW(var lpMsg: TMsgBuf): Longint;
  external 'DispatchMessageW@user32.dll stdcall';

procedure PumpMessages;
var
  M: TMsgBuf;
  N: Integer;
begin
  N := 0;
  while (N < 200) and (PeekMessageW(M, 0, 0, 0, 1) <> 0) do
  begin
    TranslateMessage(M);
    DispatchMessageW(M);
    N := N + 1;
  end;
end;

function HubName(const K: String): String;
begin
  if K = 'ffmpeg' then Result := 'ffmpeg (xử lý video, âm thanh)'
  else if K = 'whisper_medium' then Result := 'mô hình nghe giọng nói'
  else if K = 'embed' then Result := 'mô hình hiểu ý câu'
  else if K = 'clip' then Result := 'mô hình hiểu hình ảnh'
  else if K = 'cuda' then Result := 'thư viện GPU NVIDIA'
  else if K = 'nd_env' then Result := 'môi trường giọng nói Ninh Đôn'
  else if K = 'nd_model' then Result := 'mô hình giọng Ninh Đôn'
  else Result := K;
end;

function HubNames(S: String): String;
var
  P: Integer;
  K: String;
begin
  Result := '';
  while S <> '' do
  begin
    P := Pos(',', S);
    if P = 0 then
    begin
      K := S;
      S := '';
    end
    else
    begin
      K := Copy(S, 1, P - 1);
      S := Copy(S, P + 1, Length(S));
    end;
    if Result <> '' then
      Result := Result + ', ';
    Result := Result + HubName(K);
  end;
end;

function NextField(var S: String): String;
var
  P: Integer;
begin
  P := Pos('|', S);
  if P = 0 then
  begin
    Result := S;
    S := '';
  end
  else
  begin
    Result := Copy(S, 1, P - 1);
    S := Copy(S, P + 1, Length(S));
  end;
end;

function HubReadLine(const F: String): String;
var
  L: TArrayOfString;
begin
  Result := '';
  try
    if LoadStringsFromFile(F, L) then
      if GetArrayLength(L) > 0 then
        Result := L[0];
  except
    Result := '';
  end;
end;

function HubParse(S: String): Boolean;
begin
  Result := False;
  HubSt := NextField(S);
  if (HubSt <> 'R') and (HubSt <> 'D') and (HubSt <> 'F') and (HubSt <> 'C') and (HubSt <> 'E') then
    Exit;
  HubPm := StrToIntDef(NextField(S), -1);
  HubTick := StrToIntDef(NextField(S), -1);
  HubIx := StrToIntDef(NextField(S), -1);
  HubNn := StrToIntDef(NextField(S), -1);
  HubKy := NextField(S);
  HubPc := StrToIntDef(NextField(S), -1);
  HubMb := StrToIntDef(S, -1);
  Result := (HubPm >= 0) and (HubTick >= 0) and (HubIx >= 0) and (HubNn >= 0) and (HubPc >= 0) and (HubMb >= 0);
end;

procedure HubShow;
begin
  if HubPm > 1000 then
    HubPm := 1000;
  WizardForm.ProgressGauge.Position := HubPm;
  if (HubIx = 0) or (HubKy = '') then
  begin
    WizardForm.StatusLabel.Caption := 'Đang chuẩn bị tải dữ liệu cần thiết…';
    WizardForm.FilenameLabel.Caption := 'Cần Internet. Bấm Hủy để bỏ qua bước này và tải sau trong chương trình.';
  end
  else
  begin
    WizardForm.StatusLabel.Caption := 'Đang tải dữ liệu cần thiết (' + IntToStr(HubIx) + '/' + IntToStr(HubNn) + '): ' + HubName(HubKy);
    WizardForm.FilenameLabel.Caption := 'Mục này ' + IntToStr(HubPc) + '% · tổng cộng ' + IntToStr(HubPm div 10) + '%. Có thể mất vài chục phút, đừng tắt máy. Bấm Hủy để bỏ qua và tải sau.';
  end;
end;

procedure HubFinishNote;
begin
  if HubSt = 'D' then
    HubNote := ''
  else if HubSt = 'F' then
    HubNote := 'Chưa tải được: ' + HubNames(HubKy) + '.' + #13#10#13#10 + 'Thường do mạng yếu hoặc bị chặn. Nhật ký: thư mục AutoStudioData\hub\install.log trong thư mục người dùng.' + #13#10 + 'Chương trình vẫn dùng được; mở chương trình, vào «Tải dữ liệu cần thiết» để tải tiếp mục còn thiếu.'
  else if HubSt = 'E' then
    HubNote := 'Ổ đĩa không đủ chỗ để tải dữ liệu: còn khoảng ' + IntToStr(HubPc div 1024) + ' GB, cần khoảng ' + IntToStr(HubMb div 1024) + ' GB.' + #13#10#13#10 + 'Chương trình đã cài xong. Giải phóng ổ đĩa rồi mở chương trình, vào «Tải dữ liệu cần thiết» để tải.'
  else
    HubNote := 'Đã bỏ qua phần tải dữ liệu (một số mục có thể chưa tải xong).' + #13#10#13#10 + 'Chương trình đã cài xong. Mở chương trình, vào «Tải dữ liệu cần thiết» để tải tiếp phần còn thiếu.';
end;

procedure HubInstall;
var
  PF, CF, Line, Last: String;
  Rc, Idle, Waited: Integer;
  Done: Boolean;
begin
  PF := ExpandConstant('{tmp}\hub_progress.txt');
  CF := PF + '.cancel';
  DeleteFile(PF);
  DeleteFile(CF);
  HubSt := 'R';
  HubKy := '';
  HubIx := 0;
  HubNn := 0;
  HubPm := 0;
  HubPc := 0;
  HubMb := 0;
  WizardForm.ProgressGauge.Min := 0;
  WizardForm.ProgressGauge.Max := 1000;
  WizardForm.ProgressGauge.Position := 0;
  HubShow;
  if not Exec(ExpandConstant('{app}\{#AppSlug}.exe'), '--hub-install-all "' + PF + '"', '', SW_HIDE, ewNoWait, Rc) then
  begin
    HubNote := 'Không chạy được bước tải dữ liệu.' + #13#10#13#10 + 'Chương trình đã cài xong. Mở chương trình, vào «Tải dữ liệu cần thiết» để tải.';
    Exit;
  end;
  HubRunning := True;
  Last := '';
  Idle := 0;
  Done := False;
  while not Done do
  begin
    Sleep(250);
    PumpMessages;
    if HubSkip then
    begin
      SaveStringToFile(CF, '1', False);
      WizardForm.StatusLabel.Caption := 'Đang dừng tải…';
      WizardForm.FilenameLabel.Caption := 'Phần đã tải được giữ lại để tải tiếp sau.';
      Waited := 0;
      while Waited < 48 do
      begin
        Sleep(250);
        PumpMessages;
        if HubParse(HubReadLine(PF)) then
          if HubSt <> 'R' then
            Break;
        Waited := Waited + 1;
      end;
      if HubSt = 'R' then
        HubSt := 'C';
      Done := True;
    end
    else
    begin
      Line := HubReadLine(PF);
      if (Line <> '') and (Line <> Last) and HubParse(Line) then
      begin
        Last := Line;
        Idle := 0;
        HubShow;
        if HubSt <> 'R' then
          Done := True;
      end
      else
      begin
        Idle := Idle + 1;
        if Idle > 720 then
        begin
          SaveStringToFile(CF, '1', False);
          HubNote := 'Bước tải dữ liệu không phản hồi nên đã dừng.' + #13#10#13#10 + 'Chương trình đã cài xong. Mở chương trình, vào «Tải dữ liệu cần thiết» để tải.';
          Exit;
        end;
      end;
    end;
  end;
  WizardForm.ProgressGauge.Position := 1000;
  WizardForm.FilenameLabel.Caption := '';
  HubFinishNote;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
begin
  if HubRunning then
  begin
    Cancel := False;
    Confirm := False;
    HubSkip := True;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if (not WizardSilent) and WizardIsTaskSelected('getdata') then
    begin
      try
        HubInstall;
      except
        HubNote := 'Bước tải dữ liệu gặp lỗi (' + GetExceptionMessage + ').' + #13#10#13#10 + 'Chương trình đã cài xong. Mở chương trình, vào «Tải dữ liệu cần thiết» để tải.';
      end;
      HubRunning := False;
      if HubNote <> '' then
        MsgBox(HubNote, mbInformation, MB_OK);
    end;
  end;
end;
