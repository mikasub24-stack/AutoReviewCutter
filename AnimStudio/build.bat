@echo off
chcp 65001 >nul
title Build AnimStudio
cd /d "%~dp0"
echo === Build AnimStudio ===
echo  Mac dinh: BIEN DICH toan bo ma ra ma may bang Nuitka (BAO MAT: trong ban phat hanh khong con ma Python doc duoc),
echo  tu thu ban vua build (--selftest), roi tao Setup.exe neu may co Inno Setup 6. Lan dau mat khoang 15-40 phut.
echo  Nuitka loi hoac ban bien dich khong dat tu kiem tra -^> TU QUAY VE cach dong goi cu (PyInstaller: nhanh, it bao mat) va noi ro.
echo  Muon ban nhanh khong bao mat:  set NO_NUITKA=1  roi chay build.bat
echo.
where python >nul 2>nul || (echo Chua cai Python 3.10+ . Tai tai https://www.python.org/downloads/ roi tick "Add to PATH". & pause & exit /b 1)
python -m pip install --upgrade pip
python -m pip install numpy pillow scipy playwright edge-tts pyinstaller || (echo Loi cai thu vien & pause & exit /b 1)
python -m pip install --upgrade edge-tts || echo [Canh bao] Khong cap nhat duoc edge-tts: neu giong Microsoft bao loi 403 thi chay lai khi co mang.
python -c "import importlib.metadata as m;print('edge-tts',m.version('edge-tts'))" 2>nul
python -c "import sys;print('Python',sys.version.split()[0]);sys.exit(0 if sys.version_info<(3,13) else 1)" || echo [Luu y] Python 3.13 tro len co the chua co ban vieneu. Neu cai vieneu loi, dung Python 3.11 hoac 3.12.
if "%NO_NUITKA%"=="1" goto nonuitkainstall
python -m pip install nuitka ordered-set zstandard || (echo [Canh bao] Khong cai duoc Nuitka - se dong goi bang PyInstaller ^(khong bao mat^). & set NO_NUITKA=1)
:nonuitkainstall
echo Dang cai VieNeu (nhan ban giong tu thu muc voices, co the lau, bo qua neu loi)...
python -m pip install vieneu || echo [Canh bao] Khong cai duoc vieneu: giong cua ban se tam doc bang giong Microsoft.
set EXTRA=
set NEXTRA=
set EXPECT=
python -m pip install pywebview || echo [Canh bao] Khong cai duoc pywebview: se mo bang trinh duyet
python -c "import webview" >nul 2>nul && (set EXTRA=%EXTRA% --collect-all webview & set "EXPECT=%EXPECT%,webview" & echo [OK] pywebview - mo cua so app rieng) || echo [CHUA CO] pywebview - se mo bang trinh duyet
python -c "import edge_tts" >nul 2>nul && (echo [OK] edge-tts) || (echo [LOI] chua co edge-tts - giong Microsoft se khong chay)
python -c "import vieneu" >nul 2>nul && (set EXTRA=%EXTRA% --collect-all vieneu & set "NEXTRA=%NEXTRA% --include-package=vieneu --include-package-data=vieneu" & set "EXPECT=%EXPECT%,vieneu" & echo [OK] vieneu - dung duoc giong Tung Dang / Adam / VN / EN) || echo [CHUA CO] vieneu - giong cua ban se doc tam bang giong Microsoft
set EXTRA_BASE=%EXTRA%
set NEXTRA_BASE=%NEXTRA%
rem VieNeu goi them nhieu thu vien co file du lieu (tu dien, tokenizer, DLL): dong goi luon, neu khong .exe bao "The system cannot find the file specified (os error 2)"
python -c "import vieneu" >nul 2>nul && (for /f "usebackq delims=" %%a in (`python collect_deps.py vieneu`) do call set "EXTRA=%%EXTRA%% %%a")
python -c "import vieneu" >nul 2>nul && (for /f "usebackq delims=" %%a in (`python collect_deps.py vieneu --nuitka`) do call set "NEXTRA=%%NEXTRA%% %%a")
python -c "import webview" >nul 2>nul && (for /f "usebackq delims=" %%a in (`python collect_deps.py pywebview --nuitka`) do call set "NEXTRA=%%NEXTRA%% %%a")
echo Dong goi them cac thu vien phu thuoc cua VieNeu:
python collect_deps.py vieneu --list 2>nul
if not exist ffmpeg.exe (
  echo Dang tai ffmpeg...
  powershell -NoProfile -ExecutionPolicy Bypass -File download_ffmpeg.ps1
)
if not exist ffmpeg.exe (echo [LOI] Khong co ffmpeg.exe - khong tai duoc. Tai ffmpeg.exe ^(ban essentials^) bo vao thu muc nay roi chay lai. & pause & exit /b 1)
if not exist animstudio.ico (echo [LOI] Thieu file animstudio.ico - hay giai nen DAY DU ban moi, ghi de ca build.bat & pause & exit /b 1)
findstr /c:"--noconsole" build.bat >nul || (echo [LOI] build.bat nay la ban CU, chua co --noconsole. Hay giai nen ghi de ban moi & pause & exit /b 1)
echo [OK] build.bat ban moi: co icon animstudio.ico, khong cua so den
for /f "delims=" %%i in ('python thongtin_ban.py') do set APPVER=%%i
if "%APPVER%"=="" (echo [LOI] Khong doc duoc so phien ban trong animstudio\__init__.py & pause & exit /b 1)
set APPNAME=AnimStudio
set APPSLUG=AnimStudio
echo Phien ban: %APPVER%
rem Tu kiem tra TU MA NGUON truoc khi build (vai chuc giay): loi hien ra ngay, khong phai doi 30 phut. Bo qua: set SKIP_PRESELFTEST=1
if "%SKIP_PRESELFTEST%"=="1" goto preselfdone
echo.
echo Dang tu kiem tra tu ma nguon truoc khi build...
python AnimStudio.py --selftest
if errorlevel 1 (
  echo.
  echo [DUNG] Tu kiem tra tu ma nguon BAO LOI - dung truoc khi build. Xem cac dong LOI o tren.
  echo        Neu ban chac day chi la loi cua rieng cach chay tu ma nguon, bo qua bang:  set SKIP_PRESELFTEST=1  roi chay lai build.bat
  pause
  exit /b 1
)
echo [OK] Tu kiem tra tu ma nguon dat.
:preselfdone
rem Bat dau build MOI: xoa Setup cu trong dist (de khong ai cai nham Setup cu); Setup moi chi duoc tao o cuoi, tu ban vua build va dat kiem tra
del /q "dist\%APPSLUG%_Setup_*.exe" >nul 2>nul
rem Xoa thu muc tam dist_new con sot lai tu lan build truoc. Windows / diet virus / AnimStudio.exe dang chay co the giu file trong do: thu lai vai lan, van khong xoa duoc thi DUNG ngay voi huong dan (khong build tiep roi bao loi kho hieu).
set DTRIES=0
:rmdistnew
if not exist dist_new goto distnewgone
rmdir /s /q dist_new >nul 2>nul
if not exist dist_new goto distnewgone
set /a DTRIES+=1
if %DTRIES% GEQ 6 goto distnewfail
echo Windows con giu thu muc dist_new, doi 3 giay roi xoa lai (lan %DTRIES%/5)...
timeout /t 3 /nobreak >nul
goto rmdistnew
:distnewfail
echo.
echo [LOI] Khong xoa duoc thu muc dist_new - dang bi chuong trinh khac giu.
echo       Tat AnimStudio.exe dang chay (Task Manager), dong cua so Explorer / terminal dang mo trong thu muc dist_new, roi chay lai build.bat.
echo       Hoac tu xoa thu muc dist_new bang tay roi chay lai.
pause
exit /b 1
:distnewgone
if "%NO_NUITKA%"=="1" goto pyinst

rem ================================================================== CACH 1: Nuitka (bao mat)
:nuitka
set MODE=Nuitka
echo.
echo ===== Bien dich bang Nuitka - lan dau 15-40 phut. Cho nhanh hon: them thu muc nay va %%LOCALAPPDATA%%\Nuitka vao ngoai le Windows Defender. =====
taskkill /f /im ccache.exe >nul 2>nul
taskkill /f /im gcc.exe >nul 2>nul
taskkill /f /im cc1.exe >nul 2>nul
taskkill /f /im cc1plus.exe >nul 2>nul
taskkill /f /im collect2.exe >nul 2>nul
taskkill /f /im ld.exe >nul 2>nul
if exist nuitka-crash-report.xml del /q nuitka-crash-report.xml >nul 2>nul
rem BUILD NHANH LAN SAU (tang dan): giu thu muc nuitka_build (cac tep C da dich + .o) de Nuitka CHI dich lai module doi -> thuong con vai phut thay vi 15-40 phut.
rem Tu dich lai tu dau khi: doi Python / nang cap Nuitka (chuoi dac trung khac), hoac set CLEAN_BUILD=1, hoac ban tang dan bi loi.
set INCR=0
set BSIG=
for /f "delims=" %%i in ('python buildsig.py') do set BSIG=%%i
if "%CLEAN_BUILD%"=="1" goto sigdone
if not defined BSIG goto sigdone
if not exist nuitka_build\AnimStudio.build goto sigdone
set OLDSIG=
if exist nuitka_build\build_sig.txt set /p OLDSIG=<nuitka_build\build_sig.txt
if not "%BSIG%"=="%OLDSIG%" goto sigdone
set INCR=1
set KEEP_BUILD=1
echo [NHANH] Giu ket qua dich lan truoc, thu muc nuitka_build: chi dich lai module doi. Muon dich lai tu dau: set CLEAN_BUILD=1 roi chay build.bat
:sigdone
set TRIES=0
:cleanbuild
if "%KEEP_BUILD%"=="1" goto keepbuild
if not exist nuitka_build goto cleandone
rmdir /s /q nuitka_build >nul 2>nul
if not exist nuitka_build goto cleandone
set /a TRIES+=1
if %TRIES% GEQ 6 goto cleanfail
echo Windows con giu thu muc nuitka_build, doi 3 giay roi xoa lai (lan %TRIES%/5)...
timeout /t 3 /nobreak >nul
goto cleanbuild
:cleanfail
echo.
echo [CANH BAO] Khong xoa duoc thu muc nuitka_build ^(dang bi chuong trinh khac giu^) - bo qua Nuitka, quay ve PyInstaller.
goto pyinst
:keepbuild
echo [KEEP_BUILD=1] Giu nguyen thu muc nuitka_build, khong xoa.
:cleandone
rem Tat ccache cua Nuitka: loi 'PermissionError WinError 32 ... ccache-NNNN.txt' = Windows / diet virus giu file log cua ccache luc Nuitka don dep.
set NOCACHE=
set PYTHONIOENCODING=utf-8
python -m nuitka --help 2>nul | findstr /c:"--disable-cache" >nul && set "NOCACHE=--disable-cache=ccache"
if not defined NOCACHE python -m nuitka --help 2>nul | findstr /c:"--disable-ccache" >nul && set "NOCACHE=--disable-ccache"
rem Tat LTO (toi uu luc lien ket): buoc lien ket cuoi rat lau va an RAM, tat di chi lam exe chay cham hon khong dang ke.
set LTO=
python -m nuitka --help 2>nul | findstr /c:"--lto" >nul && set "LTO=--lto=no"
set PYTHONIOENCODING=
rem So tien trinh bien dich C theo RAM con trong. Tu chon: set JOBS=4 roi chay build.bat (JOBS=1 cham nhung it ton RAM nhat).
if not defined JOBS for /f "delims=" %%i in ('python buildjobs.py') do set JOBS=%%i
if not defined JOBS set JOBS=2
python buildjobs.py --info
rem Ghi dau hieu NGAY BAY GIO (khong doi build xong): build bi ngat (Ctrl+C) hoac bi loi giua chung thi lan sau TIEP TUC tu cho dang do, khong dich lai tu dau.
if not exist nuitka_build mkdir nuitka_build
if defined BSIG >nuitka_build\build_sig.txt echo %BSIG%
set ATTEMPT=1
:nuitkarun
python -m nuitka --standalone --assume-yes-for-downloads --jobs=%JOBS% ^
  --output-dir=nuitka_build --output-filename=%APPSLUG%.exe ^
  --windows-console-mode=disable --windows-icon-from-ico=animstudio.ico ^
  --include-package=animstudio ^
  --include-package=edge_tts --include-package-data=edge_tts ^
  --include-package=certifi --include-package-data=certifi ^
  --include-package=playwright --include-package-data=playwright --nofollow-import-to=playwright.async_api ^
  --nofollow-import-to=backports.zstd ^
  %NEXTRA% %NOCACHE% %LTO% ^
  --python-flag=no_docstrings ^
  "--company-name=%APPNAME%" "--product-name=%APPNAME%" "--file-description=%APPNAME%" --file-version=%APPVER%.0 --product-version=%APPVER%.0 ^
  AnimStudio.py
if not errorlevel 1 goto nuitkaok
taskkill /f /im ccache.exe >nul 2>nul
taskkill /f /im gcc.exe >nul 2>nul
taskkill /f /im cc1.exe >nul 2>nul
taskkill /f /im cc1plus.exe >nul 2>nul
taskkill /f /im collect2.exe >nul 2>nul
taskkill /f /im ld.exe >nul 2>nul
if %ATTEMPT% GEQ 2 goto nuitkafail
set /a ATTEMPT+=1
if "%INCR%"=="1" (
  set INCR=0
  echo.
  echo [THU LAI] Ban dich tang dan bi loi - xoa ket qua dich cu, dich lai TU DAU.
  rmdir /s /q nuitka_build >nul 2>nul
  goto nuitkarun
)
set JOBS=2
echo.
echo [THU LAI] Nuitka bao loi. Thu lai 1 lan voi --jobs=2 ^(it ton RAM hon^), giu nguyen cac tep da dich nen nhanh hon lan dau...
goto nuitkarun
:nuitkafail
echo.
echo [CANH BAO] Nuitka bao loi - thong tin de chup gui lai:
python buildfail.py .
echo.
echo [QUAY VE] Dong goi bang PyInstaller ^(chay duoc nhung KHONG bao mat: ma Python co the bi giai nguoc^).
goto pyinst
:nuitkaok
if not exist nuitka_build\AnimStudio.dist\%APPSLUG%.exe (echo [CANH BAO] Khong thay ket qua cua Nuitka. & goto pyinst)
rem Chi chuyen sang dist_new\AnimStudio khi dist_new\AnimStudio CHUA ton tai: neu da co thi lenh move se nhet ca thu muc vao ben trong va khong thay AnimStudio.exe.
if exist dist_new rmdir /s /q dist_new >nul 2>nul
if exist dist_new\AnimStudio goto distnewfail
if not exist dist_new mkdir dist_new
move nuitka_build\AnimStudio.dist dist_new\AnimStudio >nul
if defined BSIG >nuitka_build\build_sig.txt echo %BSIG%
goto assemble

rem ================================================================== CACH 2: PyInstaller (du phong / NO_NUITKA=1)
:pyinst
set MODE=PyInstaller
echo.
echo ===== Dong goi bang PyInstaller =====
if exist build rmdir /s /q build
if exist AnimStudio.spec del /q AnimStudio.spec
if exist dist_new rmdir /s /q dist_new
python -m PyInstaller --noconfirm --clean --noconsole --icon animstudio.ico --distpath dist_new --name AnimStudio --collect-all edge_tts --collect-all certifi --collect-all playwright --hidden-import scipy.ndimage %EXTRA% AnimStudio.py && goto assemble
echo [Canh bao] Build day du thu vien VieNeu bi loi, thu lai ban gon (giong VieNeu co the thieu file du lieu)...
if exist build rmdir /s /q build
if exist dist_new rmdir /s /q dist_new
python -m PyInstaller --noconfirm --clean --noconsole --icon animstudio.ico --distpath dist_new --name AnimStudio --collect-all edge_tts --collect-all certifi --collect-all playwright --hidden-import scipy.ndimage %EXTRA_BASE% AnimStudio.py || (echo Loi build & pause & exit /b 1)

rem ================================================================== Ghep tai nguyen + tu kiem tra TRONG thu muc tam dist_new (dat moi chep sang dist)
:assemble
if not exist dist_new\AnimStudio\%APPSLUG%.exe (echo [LOI] Khong thay dist_new\AnimStudio\%APPSLUG%.exe - build that bai & pause & exit /b 1)
rem Chep nhung file DU LIEU cua thu vien phu (vd sea_g2p.bin cua VieNeu) ma buoc dong goi bo sot: thieu thi giong VieNeu bao 'os error 2'
python fixdata.py dist_new\AnimStudio
copy /y ffmpeg.exe dist_new\AnimStudio\ >nul
xcopy /e /i /y samples dist_new\AnimStudio\samples >nul
xcopy /e /i /y characters dist_new\AnimStudio\characters >nul
if not exist dist_new\AnimStudio\backgrounds\custom mkdir dist_new\AnimStudio\backgrounds\custom
if exist voices xcopy /e /i /y voices dist_new\AnimStudio\voices >nul
if exist reveal_defaults xcopy /e /i /y reveal_defaults dist_new\AnimStudio\reveal_defaults >nul
if exist fonts xcopy /e /i /y fonts dist_new\AnimStudio\fonts >nul
copy /y animstudio.ico dist_new\AnimStudio\ >nul
echo.
echo Dang tu kiem tra ban vua build ^(%MODE%^) - mo cua so thu trong vai giay...
if exist dist_new\AnimStudio\selftest.txt del /q dist_new\AnimStudio\selftest.txt >nul 2>nul
rem Ban bien dich Nuitka phai co du nhung gi ma-nguon-dang-chay co (cua so rieng pywebview, giong vieneu): thieu = tu kiem tra BAO LOI -> quay ve PyInstaller
set ANIMSTUDIO_EXPECT=
if "%MODE%"=="Nuitka" set "ANIMSTUDIO_EXPECT=%EXPECT%"
start "" /wait "dist_new\AnimStudio\%APPSLUG%.exe" --selftest
set RC=%errorlevel%
set ANIMSTUDIO_EXPECT=
if exist dist_new\AnimStudio\selftest.txt type dist_new\AnimStudio\selftest.txt
findstr /c:"KET QUA: DAT" dist_new\AnimStudio\selftest.txt >nul 2>nul || set RC=1
rem Ban vua build PHAI tu bao dung so phien ban cua ma nguon (dong "OK   AnimStudio <so> - ..." trong selftest.txt); lech = dang goi nham ban cu
findstr /c:"AnimStudio %APPVER% - " dist_new\AnimStudio\selftest.txt >nul 2>nul || (echo [LOI] Ban vua build KHONG bao phien ban %APPVER% - xem dong AnimStudio o tren: do la ban cu, khong dong goi. & set RC=1)
if "%RC%"=="0" goto selfok
echo.
if "%MODE%"=="Nuitka" (
  echo [CANH BAO] Ban bien dich Nuitka KHONG dat tu kiem tra ^(xem cac dong LOI o tren^) - QUAY VE PyInstaller de van co ban chay duoc.
  goto pyinst
)
echo [DUNG] Tu kiem tra BAO LOI - KHONG phat hanh ban nay. Xem cac dong LOI o tren ^(hoac dist_new\AnimStudio\selftest.txt^).
pause
exit /b 1

:selfok
del /q dist_new\AnimStudio\selftest.txt >nul 2>nul
>"dist_new\AnimStudio\version.txt" echo %APPVER%
echo [OK] Ban %MODE% dat tu kiem tra, dung phien ban %APPVER%.
rem Thay HAN dist\AnimStudio bang ban moi: /MIR = chep de + XOA moi tep cu khong con trong ban moi (khong giu lai gi cua ban truoc). Chi giu cac thu muc "custom" (anh tu bo vao characters\custom, backgrounds\custom).
if not exist dist mkdir dist
if not exist dist\AnimStudio mkdir dist\AnimStudio
if "%MODE%"=="Nuitka" if exist dist\AnimStudio\_internal rmdir /s /q dist\AnimStudio\_internal
robocopy dist_new\AnimStudio dist\AnimStudio /MIR /XD custom /R:1 /W:1 /NFL /NDL /NJH /NJS /NP >nul
if errorlevel 8 (echo Loi chep ban moi. Hay tat AnimStudio dang chay roi build lai. & pause & exit /b 1)
if not exist dist\AnimStudio\characters\custom mkdir dist\AnimStudio\characters\custom
if not exist dist\AnimStudio\backgrounds\custom mkdir dist\AnimStudio\backgrounds\custom
rmdir /s /q dist_new >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop')+'\AnimStudio.lnk');$s.TargetPath=(Resolve-Path 'dist\AnimStudio\AnimStudio.exe').Path;$s.WorkingDirectory=(Resolve-Path 'dist\AnimStudio').Path;$s.IconLocation=(Resolve-Path 'dist\AnimStudio\animstudio.ico').Path;$s.Save()" >nul 2>nul
ie4uinit.exe -show >nul 2>nul
echo Da tao shortcut AnimStudio tren Desktop (co icon moi).

rem ================================================================== Setup.exe (cai nhu app binh thuong). Can Inno Setup 6, khong co thi bo qua.
set ISCC=
for %%P in ("%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 6\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 7\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 7\ISCC.exe") do if exist %%P set "ISCC=%%~P"
set SETUP=dist\%APPSLUG%_Setup_%APPVER%.exe
set HAVESETUP=
if not defined ISCC goto nosetup
if exist "%SETUP%" del /q "%SETUP%"
echo.
echo Dang tao trinh cai dat bang Inno Setup - vai chuc giay den vai phut...
"%ISCC%" /Qp "/DAppVer=%APPVER%" "/DAppName=%APPNAME%" "/DAppSlug=%APPSLUG%" installer.iss
if errorlevel 1 goto nosetup
if not exist "%SETUP%" goto nosetup
set HAVESETUP=1
goto setupdone
:nosetup
echo.
echo [CANH BAO] Chua tao duoc Setup.exe: may chua cai Inno Setup 6, hoac Inno bao loi o tren.
echo            Cai Inno Setup 6 - mien phi: https://jrsoftware.org/isdl.php  roi chay tao_setup.bat ^(chi tao lai Setup.exe, khong build lai chuong trinh^).
:setupdone
echo.
echo ============================================================
if "%MODE%"=="Nuitka" (echo  XONG! Ban BAO MAT ^(bien dich Nuitka^), da tu kiem tra OK.) else (echo  XONG! Ban PyInstaller ^(KHONG bao mat - ma Python co the bi giai nguoc^), da tu kiem tra OK.)
echo  Chay thu: dist\AnimStudio\AnimStudio.exe
if defined HAVESETUP echo  NGUOI DUNG: gui tep  %SETUP%  - mo ra, bam Cai dat, cai nhu app binh thuong ^(dung thu 4 gio, sau do nhap key^). CHI gui tep nay.
if not defined HAVESETUP echo  Gui nguoi khac: nen thu muc dist\AnimStudio ^(giai nen ra dung duoc ngay^).
echo ============================================================
pause
