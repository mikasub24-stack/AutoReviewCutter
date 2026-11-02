$ErrorActionPreference = "Stop"
$url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$zip = Join-Path $env:TEMP "ffmpeg_dl.zip"
Invoke-WebRequest -Uri $url -OutFile $zip
$dir = Join-Path $env:TEMP "ffmpeg_dl"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
Expand-Archive $zip $dir
$exe = Get-ChildItem $dir -Recurse -Filter ffmpeg.exe | Select-Object -First 1
Copy-Item $exe.FullName (Join-Path (Get-Location) "ffmpeg.exe")
Remove-Item $zip -Force
Write-Host "Da tai ffmpeg.exe"
