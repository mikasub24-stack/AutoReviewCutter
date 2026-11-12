# Wan Local Studio 0.2.0: browser download warning review

**Status: unresolved browser warning. No claim that the file is accepted by Chrome or Cốc Cốc.**

The user reports a dangerous-download warning in the browser, without a Windows Security threat name. The exact delivered artifact was retrieved and scanned again without rebuilding or executing the installer. No alternate package or renamed binary was shipped as a workaround.

## Exact file

- File: `WanLocalStudio-0.2.0-Setup.exe`
- Size: **43,911,575 bytes**
- SHA-256: `5b26131e778a312a6698daab27956bffff903c67aa05f01d21af4885b6e3daf4`
- Source commit: `b590c8d44004cff663c185942f0b0dbbfb338a3f`
- Original build: https://github.com/mikasub24-stack/AutoReviewCutter/actions/runs/43136967896
- Original artifact ID: `13906889379`
- Authenticode: **NotSigned**, no publisher certificate

The installer hash agrees with the scan manifest in the original artifact. The outer GitHub artifact ZIP digest is a different value and must not be confused with the installer digest above.

## Fresh scan

- Recheck: https://github.com/mikasub24-stack/AutoReviewCutter/actions/runs/43139103852
- Report artifact: https://github.com/mikasub24-stack/AutoReviewCutter/actions/runs/43139103852/artifacts/13908034613
- Scan completed: 2026-11-12 02:06:52 UTC (09:06:52 Vietnam)
- Microsoft Defender engine: `1.1.26100.4`
- Signatures: `1.463.256.0`
- Result: **no detections**; no reported threats; no scan error
- Installer executed during recheck: **false**
- Browser Safe Browsing/reputation verdict: **not independently verified**

A clean Defender scan does not establish that every security product considers the file safe, nor that the browser warning is a false positive. An unsigned binary is an observed fact, not proof of the warning's cause. No evidence currently identifies a specific component or code defect causing this warning.

## Relevant packaging and behavior

The application is packaged with PyInstaller in onedir mode without UPX, with a separate Inno Setup installer. Python dependencies are version/hash locked. BuildManifest.json records shipped file hashes. FFmpeg and 7-Zip are included for video encoding and extraction.

On user request, the app downloads an official ComfyUI portable release pinned by SHA-256 and public Comfy-Org model weights verified against Git LFS hashes. It launches that private backend under the user's account. These are intended application functions, but this report does not assert that any specific behavior caused the browser warning. Video rendering and local API uploads use loopback addresses. The app does not require disabling browser or antivirus protection.

## Remaining action

The browser/security provider must review the exact blocked file or download URL to identify or revise its verdict. A legitimate trusted publisher certificate could establish publisher identity for future releases, but signing alone is not a guarantee that an existing dangerous-download classification will be removed. No publisher certificate was supplied, and no file was submitted to an outside review service by this session.

The scan JSON, exact hash and source/build links above are prepared for that review. Do not describe the browser issue as fixed based only on rebuilding, changing archive types, renaming the file or the Defender result.
