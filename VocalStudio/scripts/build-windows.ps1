param([string]$BuildDirectory = "build/vocal", [string]$OutputDirectory = "dist")
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
Set-Location $root
if (!(Get-Command cmake -ErrorAction SilentlyContinue)) { throw 'Install Visual Studio 2022 Desktop development with C++ and CMake, then run this script in Developer PowerShell.' }
$build = [IO.Path]::GetFullPath((Join-Path $root $BuildDirectory))
$dist = [IO.Path]::GetFullPath((Join-Path $root $OutputDirectory))
New-Item -ItemType Directory -Force $dist | Out-Null
& cmake -S VocalStudio -B $build -A x64 "-DVOCAL_BUILD_TESTS=ON"
if ($LASTEXITCODE -ne 0) { throw 'CMake configuration failed' }
& cmake --build $build --config Release --parallel 2 2>&1 | Tee-Object -FilePath (Join-Path $build 'Compile.log')
if ($LASTEXITCODE -ne 0) { throw 'Windows compilation failed' }
& ctest --test-dir $build -C Release --output-on-failure 2>&1 | Tee-Object -FilePath (Join-Path $build 'CTest.log')
if ($LASTEXITCODE -ne 0) { throw 'Native tests failed; no installer packaged' }
$appDir = Join-Path $build 'VocalStudio_artefacts/Release'
function Invoke-Studio([string]$Executable, [string[]]$StudioArguments, [int]$Timeout = 120000) {
    $process = Start-Process $Executable -WorkingDirectory $root -ArgumentList $StudioArguments -PassThru
    if (!$process.WaitForExit($Timeout)) { $process.Kill(); throw "Studio timed out: $StudioArguments" }
    if ($process.ExitCode -ne 0) { throw "Studio failed ($($process.ExitCode)): $StudioArguments" }
}
function Test-Browser([string]$Directory, [string]$ReportName) {
    $report = Join-Path $Directory 'BrowserSelfTest.json'
    Remove-Item $report -ErrorAction SilentlyContinue
    Invoke-Studio (Join-Path $Directory 'VocalStudio.exe') @('--browser-probe','--autoplay-policy=no-user-gesture-required') 60000
    if (!(Test-Path $report)) { throw 'Browser probe did not write its report' }
    $probe = Get-Content $report -Raw | ConvertFrom-Json
    if (!$probe.passed) { throw 'Browser sandbox/audio probe failed' }
    Copy-Item $report (Join-Path $dist $ReportName)
}
Test-Browser $appDir 'BrowserSelfTest.json'
$shot = Join-Path $dist 'VocalStudio-preview.jpg'
Invoke-Studio (Join-Path $appDir 'VocalStudio.exe') @('--screenshot',"`"$shot`"")
if (!(Test-Path $shot)) { throw 'UI screenshot missing' }
$iscc = Get-Command ISCC.exe -ErrorAction SilentlyContinue
if ($iscc) { $compiler = $iscc.Source } else { $compiler = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe' }
if (!(Test-Path $compiler)) { throw 'Install Inno Setup 6 to package the installer; the built app is in the build folder.' }
& $compiler "/DSourceDir=$appDir" "/DOutputDir=$dist" 'VocalStudio/installer/VocalStudio.iss'
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
$setup = Join-Path $dist 'VocalStudio-1.7.0-Setup.exe'
$installDir = Join-Path ([IO.Path]::GetTempPath()) ('VocalStudio-verify-' + [Guid]::NewGuid().ToString('N'))
$process = Start-Process $setup -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART',"/DIR=`"$installDir`"") -Wait -PassThru
if ($process.ExitCode -ne 0) { throw 'Test installation failed' }
$report = Join-Path $dist 'InstalledSelfTest.json'
$vst2Fixture = Join-Path $build 'Vst2Fixture/Release/VocalStudioVst2Fixture.dll'
if (!(Test-Path $vst2Fixture)) { throw 'VST2 test DLL missing' }
Invoke-Studio (Join-Path $installDir 'VocalStudio.exe') @('--self-test','--vst2-fixture',"`"$vst2Fixture`"",'--report',"`"$report`"")
if (!(Test-Path $report) -or !((Get-Content $report -Raw | ConvertFrom-Json).passed)) { throw 'Installed self-test failed' }
Test-Browser $installDir 'InstalledBrowserSelfTest.json'
$uninstaller = Join-Path $installDir 'unins000.exe'
if (Test-Path $uninstaller) { Start-Process $uninstaller -ArgumentList @('/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART') -Wait | Out-Null }
Compress-Archive -Path "$appDir/*" -DestinationPath (Join-Path $dist 'VocalStudio-1.7.0-Windows.zip') -Force
Copy-Item (Join-Path $build 'EngineSelfTest.json') $dist
Copy-Item (Join-Path $build 'Testing/Temporary/LastTest.log') (Join-Path $dist 'VocalStudio-Verification.log')
Get-ChildItem $dist -File | Where-Object { $_.Name -ne 'SHA256SUMS.txt' } | ForEach-Object { "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($_.Name)" } | Set-Content (Join-Path $dist 'SHA256SUMS.txt') -Encoding ascii
Write-Host "Verified installer: $setup"
