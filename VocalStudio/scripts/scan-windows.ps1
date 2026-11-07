param([Parameter(Mandatory)][string]$RuntimeDirectory, [Parameter(Mandatory)][string]$PackageDirectory)
$ErrorActionPreference = 'Stop'
$runtime = (Resolve-Path $RuntimeDirectory).Path
$packages = (Resolve-Path $PackageDirectory).Path
$report = [ordered]@{ status = 'not-scanned'; engine = $null; signatures = $null; threats = @(); installer = @(); error = $null }
try {
    $state = Get-MpComputerStatus
    if (!$state.AMServiceEnabled) { Start-Service WinDefend; $state = Get-MpComputerStatus }
    if (!$state.AMServiceEnabled -or !$state.AntivirusEnabled) { throw 'Defender unavailable: package has no accepted scan verdict' }
    Update-MpSignature
    $state = Get-MpComputerStatus
    if ($state.AntivirusSignatureAge -gt 2) { throw 'Defender signatures are stale' }
    $report.engine = $state.AMEngineVersion
    $report.signatures = $state.AntivirusSignatureVersion
    Start-MpScan -ScanType CustomScan -ScanPath $runtime
    Start-MpScan -ScanType CustomScan -ScanPath $packages
    $found = @(Get-MpThreatDetection | Where-Object { @($_.Resources | Where-Object { $_ -like "*$runtime*" -or $_ -like "*$packages*" }).Count -gt 0 })
    $report.threats = @($found | ForEach-Object { [ordered]@{ id = $_.ThreatID; resources = @($_.Resources) } })
    if ($found.Count -gt 0) { $report.status = 'detected'; throw 'Defender detected a threat in the shipping files' }
    $report.installer = @(Get-ChildItem $packages -Filter '*Setup.exe' | ForEach-Object { [ordered]@{ file = $_.Name; sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); signature = (Get-AuthenticodeSignature $_.FullName).Status.ToString() } })
    $report.status = 'no-detections'
}
catch { $report.error = $_.Exception.Message; if ($report.status -ne 'detected') { $report.status = 'scan-failed' } }
$json = $report | ConvertTo-Json -Depth 6
$json | Set-Content (Join-Path $packages 'DefenderReport.json') -Encoding utf8
$detail = $json.Replace('%','%25').Replace("`r",'%0D').Replace("`n",'%0A')
if ($report.status -ne 'no-detections') { Write-Host "::error title=Defender shipping scan::$detail"; throw 'Shipping scan failed; do not distribute this build' }
Write-Host "::notice title=Defender shipping scan::$detail"
