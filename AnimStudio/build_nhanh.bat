@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem BUILD NHANH: dung PyInstaller (vai phut) thay cho Nuitka (15-40 phut), van tu kiem tra phien ban + tao luon Setup.exe trong dist\ .
rem Dung de thu / dung rieng tren may ban. Ban phat hanh cho khach nen dung build.bat (Nuitka - ma Python khong doc duoc).
set NO_NUITKA=1
call build.bat
