param([Parameter(Mandatory=$true)][string]$Setup,[Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference = 'Stop'
# NSIS's language dialog does not expose Button elements through UI Automation
# on hosted runners. Inspect and click the real Win32 controls instead.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MuseInstallerUI {
  private delegate bool Callback(IntPtr window, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumWindows(Callback callback, IntPtr data);
  [DllImport("user32.dll")] private static extern bool EnumChildWindows(IntPtr parent, Callback callback, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetClassName(IntPtr window, StringBuilder text, int length);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr window);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
  [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll", SetLastError=true)] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  public static IntPtr[] Windows() {
    var result = new List<IntPtr>();
    EnumWindows((window, data) => { result.Add(window); return true; }, IntPtr.Zero);
    return result.ToArray();
  }
  public static IntPtr[] Children(IntPtr parent) {
    var result = new List<IntPtr>();
    EnumChildWindows(parent, (window, data) => { result.Add(window); return true; }, IntPtr.Zero);
    return result.ToArray();
  }
  public static string Text(IntPtr window) { var text = new StringBuilder(2048); GetWindowText(window,text,text.Capacity); return text.ToString(); }
  public static string Class(IntPtr window) { var text = new StringBuilder(256); GetClassName(window,text,text.Capacity); return text.ToString(); }
  public static uint ProcessId(IntPtr window) { uint id; GetWindowThreadProcessId(window,out id); return id; }
  public static bool Checked(IntPtr window) { return SendMessage(window,0x00f0,IntPtr.Zero,IntPtr.Zero).ToInt64() == 1; }
  public static void Click(IntPtr window) {
    if (!PostMessage(window,0x00f5,IntPtr.Zero,IntPtr.Zero)) throw new InvalidOperationException("Cannot click installer control: " + Marshal.GetLastWin32Error());
  }
}
'@
$installer = Start-Process -FilePath $Setup -ArgumentList "/D=$InstallRoot" -PassThru
$deadline = (Get-Date).AddSeconds(120)
$finished = $false
$seenPages = [System.Collections.Generic.HashSet[string]]::new()
while ((Get-Date) -lt $deadline -and -not $finished) {
  $ids = @($installer.Id) + @(Get-Process | Where-Object { $_.ProcessName -like 'MuseVideoStudio*-Setup' } | ForEach-Object { $_.Id })
  foreach ($window in [MuseInstallerUI]::Windows()) {
    if ([MuseInstallerUI]::ProcessId($window) -notin $ids -or -not [MuseInstallerUI]::IsWindowVisible($window)) { continue }
    $buttons = @([MuseInstallerUI]::Children($window) | Where-Object { [MuseInstallerUI]::Class($_) -eq 'Button' -and [MuseInstallerUI]::IsWindowVisible($_) })
    $description = [MuseInstallerUI]::Text($window) + ': ' + ((@($buttons | ForEach-Object { [MuseInstallerUI]::Text($_) })) -join ', ')
    if ($seenPages.Add($description)) { Write-Host "Installer page: $description" }
    foreach ($button in $buttons) {
      if (-not [MuseInstallerUI]::IsWindowEnabled($button)) { continue }
      $name = [MuseInstallerUI]::Text($button).Replace('&','').Trim()
      if ($name -match '^(Finish|Ho\u00e0n t\u1ea5t|K\u1ebft th\u00fac)$') {
        $run = @($buttons | Where-Object { [MuseInstallerUI]::Text($_) -match 'Muse Video Studio' })
        if ($run.Count -ne 1) { throw 'Finish page must offer Run Muse Video Studio.' }
        if (-not [MuseInstallerUI]::Checked($run[0])) { throw 'Run after installation must be selected by default.' }
        [MuseInstallerUI]::Click($button)
        $finished = $true
        Write-Host 'Verified visible Finish page with Run Muse Video Studio checked; clicked Finish.'
        break
      }
      if ($name -match '^(OK|Next\s*>?|Install|Ti\u1ebfp\s*>?|C\u00e0i \u0111\u1eb7t)$') {
        [MuseInstallerUI]::Click($button)
        break
      }
    }
    if ($finished) { break }
  }
  if (-not $finished) { Start-Sleep -Milliseconds 600 }
}
if (-not $finished) { throw 'Installer did not reach and complete its visible Finish page.' }
if (-not $installer.WaitForExit(30000)) { throw 'Installer did not close after Finish.' }
if ($installer.ExitCode -ne 0) { throw "Interactive installer exited with $($installer.ExitCode)" }
