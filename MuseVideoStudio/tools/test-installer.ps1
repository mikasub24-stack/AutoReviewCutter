$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json | ConvertFrom-Json).version
$setup = (Resolve-Path "dist/MuseVideoStudio-$version-Setup.exe").Path
$installRoot = Join-Path $env:RUNNER_TEMP 'MuseInstallerSmoke'
$exe = Join-Path $installRoot 'Muse Video Studio.exe'
$installed = Start-Process -FilePath $setup -ArgumentList '/S', "/D=$installRoot" -Wait -PassThru
if ($installed.ExitCode -ne 0) { throw "Installer exited with $($installed.ExitCode)" }
if (-not (Test-Path $exe)) { throw "Installed application missing: $exe" }
$desktop = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Muse Video Studio.lnk'
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Muse Video Studio.lnk'
foreach ($shortcut in @($desktop, $startMenu)) {
  if (-not (Test-Path $shortcut)) { throw "Missing installed shortcut: $shortcut" }
}
$process = Start-Process -FilePath $exe -PassThru
try {
  $deadline = (Get-Date).AddSeconds(40)
  do {
    Start-Sleep -Milliseconds 500
    $running = @(Get-Process -Name 'Muse Video Studio' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe })
    $window = @($running | Where-Object { $_.MainWindowHandle -ne 0 })
  } while ($window.Count -eq 0 -and (Get-Date) -lt $deadline)
  if ($window.Count -ne 1) { throw "Expected one installed application window, found $($window.Count)" }
  Start-Process -FilePath $exe | Out-Null
  Start-Sleep -Seconds 2
  $windows = @(Get-Process -Name 'Muse Video Studio' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe -and $_.MainWindowHandle -ne 0 })
  if ($windows.Count -ne 1) { throw "Reopening installed app created extra windows: $($windows.Count)" }
  Write-Host 'Verified installed app launches; reopening keeps one main window.'
} finally {
  Get-Process -Name 'Muse Video Studio' -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $exe } | Stop-Process -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 1
$uninstaller = @(Get-ChildItem $installRoot -Filter 'Uninstall*.exe')
if ($uninstaller.Count -ne 1) { throw 'Installed uninstaller missing or ambiguous.' }
$removed = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -Wait -PassThru
if ($removed.ExitCode -ne 0) { throw "Uninstaller exited with $($removed.ExitCode)" }
$deadline = (Get-Date).AddSeconds(40)
while ((Test-Path $exe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Test-Path $exe) { throw 'Uninstaller did not remove installed executable.' }
if ((Test-Path $desktop) -or (Test-Path $startMenu)) { throw 'Uninstaller left application shortcuts.' }
Write-Host 'PASS: per-user installation, desktop/Start menu shortcuts, installed app launch, single main window and uninstall.'
