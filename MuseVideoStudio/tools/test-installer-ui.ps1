param([Parameter(Mandatory=$true)][string]$Setup,[Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$installer = Start-Process -FilePath $Setup -ArgumentList "/D=$InstallRoot" -PassThru
$deadline = (Get-Date).AddSeconds(120)
$finished = $false
$seenPages = [System.Collections.Generic.HashSet[string]]::new()
while ((Get-Date) -lt $deadline -and -not $finished) {
  $ids = @($installer.Id) + @(Get-Process | Where-Object { $_.ProcessName -like 'MuseVideoStudio*-Setup' } | ForEach-Object { $_.Id })
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($window in $windows) {
    try {
      if ($window.Current.ProcessId -notin $ids) { continue }
      $buttons = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Button))
      $description = $window.Current.Name + ': ' + ((@($buttons | ForEach-Object { $_.Current.Name })) -join ', ')
      if ($seenPages.Add($description)) { Write-Host "Installer page: $description" }
      foreach ($button in $buttons) {
        if (-not $button.Current.IsEnabled -or $button.Current.IsOffscreen) { continue }
        $name = $button.Current.Name.Replace('&','').Trim()
        if ($name -match '^(Finish|Ho\u00e0n t\u1ea5t|K\u1ebft th\u00fac)$') {
          $checks = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::CheckBox))
          $run = @($checks | Where-Object { $_.Current.Name -match 'Muse Video Studio' })
          if ($run.Count -ne 1) { throw 'Finish page must offer Run Muse Video Studio.' }
          $toggle = $run[0].GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
          if ($toggle.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On) { throw 'Run after installation must be selected by default.' }
          $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          $finished = $true
          Write-Host 'Verified visible Finish page with Run Muse Video Studio checked; clicked Finish.'
          break
        }
        if ($name -match '^(OK|Next\s*>?|Install|Ti\u1ebfp\s*>?|C\u00e0i \u0111\u1eb7t)$') {
          $button.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
          break
        }
      }
    } catch [System.Windows.Automation.ElementNotAvailableException] {
      # The installer replaced this page during enumeration; inspect the next.
    }
    if ($finished) { break }
  }
  if (-not $finished) { Start-Sleep -Milliseconds 600 }
}
if (-not $finished) { throw 'Installer did not reach and complete its visible Finish page.' }
if (-not $installer.WaitForExit(30000)) { throw 'Installer did not close after Finish.' }
if ($installer.ExitCode -ne 0) { throw "Interactive installer exited with $($installer.ExitCode)" }
