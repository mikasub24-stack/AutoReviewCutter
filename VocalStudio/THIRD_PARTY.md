# Dependencies and notices

- Application source: AGPL-3.0-or-later. See LICENSE.txt.
- JUCE 8.0.6, commit `51a8a6d7aeae7326956d747737ccf1575e61e209`, https://github.com/juce-framework/JUCE . Open-source AGPLv3 option selected. See JUCE-LICENSE.md and the upstream module licenses. JUCE includes the VST3 hosting SDK files and their notices.
- ASIO SDK mirror `langlauf/asiosdk`, commit `c1d68b74d8298f50cffab44f915a9977d1952576`, https://github.com/langlauf/asiosdk . Copyright 2025 Steinberg Media Technologies GmbH. This SDK expressly offers GPLv3 as an alternative to its proprietary license; the GPLv3 option is selected here. Headers are fetched at build time, not copied into application source.
- VST and ASIO are trademarks of Steinberg Media Technologies GmbH. No endorsement or certification is claimed. No Steinberg logos are included.

Corresponding application source and fixed dependency identifiers are provided with builds. Sound-card drivers and user-installed commercial VST3 plugins are separate products and are not included.

- Signalsmith Stretch 1.3.2, commit `88061fd4eda56a2353c5d65c74aa3f4ccf76f9da`, https://github.com/Signalsmith-Audio/signalsmith-stretch, MIT. Vendored unmodified header and license in ThirdParty/.
- Signalsmith Linear 0.6.6, commit `7bb1c8f36794d6980080ce817c91f8da8fe56a66`, https://github.com/Signalsmith-Audio/linear, MIT. Vendored required portable headers and license in ThirdParty/.

## Chromium Embedded Framework (CEF)

Windows browser runtime: CEF 156.0.15+gcf671c0+chromium-156.0.8078.80, official minimal distribution from https://cef-builds.spotifycdn.com/ . Download SHA1 b690e035689ee20ba9d2500ac8953815bc7ed46a. CEF BSD license is copied as CEF-LICENSE.txt alongside the runtime; Chromium and other dependency notices are available through the browser's chrome://credits page. Browser sandbox uses the official CEF bootstrap.exe; the application code is in VocalStudio.dll. See https://github.com/chromiumembedded/cef and https://chromiumembedded.github.io/cef/ .
