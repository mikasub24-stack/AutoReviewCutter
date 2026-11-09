$ErrorActionPreference = 'Stop'
$root = Join-Path (Get-Location) 'CinecodeStudio/runtime'
$destination = Join-Path $root 'python'
$base = python -c "import sys; print(sys.base_prefix)"
New-Item -ItemType Directory -Force $destination | Out-Null
foreach ($pattern in @('python*.exe','python*.dll','vcruntime*.dll','LICENSE*')) {
    Get-ChildItem $base -Filter $pattern -File | Copy-Item -Destination $destination -Force
}
foreach ($folder in @('DLLs','Lib','tcl','include')) {
    if (Test-Path (Join-Path $base $folder)) {
        & robocopy (Join-Path $base $folder) (Join-Path $destination $folder) /E /XD site-packages __pycache__ test tests idlelib /XF *.pyc /NFL /NDL /NJH /NJS | Out-Null
        if ($LASTEXITCODE -gt 7) { throw "Copy Python $folder failed" }
    }
}
Copy-Item (Join-Path $destination 'python.exe') (Join-Path $destination 'python3.exe') -Force
& (Join-Path $destination 'python.exe') -I -c "import sys,ssl,venv,ensurepip,hashlib,json; print('Original-tool Python runtime:',sys.version)"
if ($LASTEXITCODE) { throw 'Bundled Python is not runnable' }

$archive = Join-Path $env:RUNNER_TEMP 'cinecode-ffmpeg-full.zip'
$url = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-n8.1-latest-win64-gpl-shared-8.1.zip'
Invoke-WebRequest $url -OutFile $archive
$hash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
if ($hash -ne '4bcb6369381b413197fd546d6d160c926e69cd5d401391b2f448adc4698aff2c') { throw 'Full FFmpeg distribution hash changed; review the new upstream build before updating the pin' }
$unpacked = Join-Path $env:RUNNER_TEMP 'cinecode-ffmpeg-full'
Expand-Archive $archive $unpacked -Force
$bin = Get-ChildItem $unpacked -Directory | ForEach-Object { Join-Path $_.FullName 'bin' } | Where-Object { Test-Path (Join-Path $_ 'ffprobe.exe') } | Select-Object -First 1
if (!$bin) { throw 'Full FFmpeg/ffprobe runtime missing' }
Copy-Item (Join-Path $bin '*') $root -Force
& (Join-Path $root 'ffmpeg.exe') -version 2>&1 | Out-File (Join-Path $root 'FFMPEG-BUILD.txt') -Encoding utf8
if ($LASTEXITCODE) { throw 'Full FFmpeg failed' }
& (Join-Path $root 'ffprobe.exe') -version 2>&1 | Out-File (Join-Path $root 'FFPROBE-BUILD.txt') -Encoding utf8
if ($LASTEXITCODE) { throw 'ffprobe failed' }
"Source: $url`nArchive SHA-256: $hash`nContains original FFmpeg tools and shared libraries. Source/build instructions: https://github.com/BtbN/FFmpeg-Builds . GPL licences and build details are in the upstream archive and FFMPEG-BUILD.txt." | Set-Content (Join-Path $root 'FFMPEG-README.txt') -Encoding utf8
Get-ChildItem $unpacked -Recurse -File | Where-Object { $_.Name -match 'LICENSE|COPYING' } | ForEach-Object { Copy-Item $_.FullName (Join-Path $root ('BTBN-'+$_.Name)) -Force }
