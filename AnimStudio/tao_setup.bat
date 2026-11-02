@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem TAO LAI CHI Setup.exe tu ban da build (dist\AnimStudio) - KHONG build lai chuong trinh.
rem Can: da chay build.bat xong (co dist\AnimStudio\AnimStudio.exe) va da cai Inno Setup 6 (mien phi: https://jrsoftware.org/isdl.php).
where python >nul 2>nul || (echo Chua cai Python. & pause & exit /b 1)
set APPSLUG=AnimStudio
set APPNAME=AnimStudio
set APPVER=
for /f "delims=" %%i in ('python thongtin_ban.py') do set APPVER=%%i
if "%APPVER%"=="" (echo Khong doc duoc so phien ban - hay chay file nay trong thu muc chuong trinh. & pause & exit /b 1)
if not exist "dist\%APPSLUG%\%APPSLUG%.exe" (echo Chua co dist\%APPSLUG%\%APPSLUG%.exe - hay chay build.bat truoc. & pause & exit /b 1)
rem Setup lay ten phien ban tu MA NGUON nhung noi dung tu dist\AnimStudio: neu dist la ban build CU thi Setup ghi 1.3.6 ma chay van la ban cu. Chan truong hop do.
set DISTVER=
if exist "dist\%APPSLUG%\version.txt" set /p DISTVER=<"dist\%APPSLUG%\version.txt"
if not "%DISTVER%"=="%APPVER%" (echo. & echo [DUNG] Thu muc dist\%APPSLUG% la ban build "%DISTVER%" ^(trong = ban cu, chua build lai^), con ma nguon la %APPVER%. Tao Setup luc nay se dong goi chuong trinh CU. Hay chay build.bat de build lai truoc, roi moi tao Setup. & pause & exit /b 1)
set ISCC=
for %%P in ("%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 6\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe" "%ProgramFiles%\Inno Setup 7\ISCC.exe" "%LOCALAPPDATA%\Programs\Inno Setup 7\ISCC.exe") do if exist %%P set "ISCC=%%~P"
if not defined ISCC (echo Chua thay Inno Setup. Cai ban 6 tai https://jrsoftware.org/isdl.php roi chay lai file nay. & pause & exit /b 1)
echo Dung: %ISCC%
set SETUP=dist\%APPSLUG%_Setup_%APPVER%.exe
if exist "%SETUP%" del /q "%SETUP%"
echo.
echo Dang tao trinh cai dat - vai chuc giay den vai phut...
"%ISCC%" /Qp "/DAppVer=%APPVER%" "/DAppName=%APPNAME%" "/DAppSlug=%APPSLUG%" installer.iss
if errorlevel 1 (echo. & echo [LOI] Inno Setup bao loi o tren - chup man hinh nay gui lai. & pause & exit /b 1)
if not exist "%SETUP%" (echo [LOI] Khong thay tep %SETUP% & pause & exit /b 1)
echo.
echo XONG! Da tao: %SETUP%
pause
