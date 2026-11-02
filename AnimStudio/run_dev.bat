@echo off
chcp 65001 >nul
title AnimStudio
cd /d "%~dp0"
echo Dang kiem tra thu vien (thieu gi se tu cai)...
python -m pip install --upgrade edge-tts numpy pillow scipy playwright
python -c "import vieneu" >nul 2>nul || (echo Dang cai vieneu cho giong Tung Dang / Adam / VN / EN, lan dau co the lau... & python -m pip install vieneu || echo [Canh bao] Chua cai duoc vieneu: giong cua ban se tam doc bang giong Microsoft. Neu dung Python 3.13 hay thu Python 3.11 hoac 3.12.)
python -c "import vieneu" >nul 2>nul && (echo [OK] vieneu) || (echo [CHUA CO] vieneu)
python AnimStudio.py
pause
