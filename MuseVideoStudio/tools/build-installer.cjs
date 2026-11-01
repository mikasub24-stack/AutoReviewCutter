// Reuse the portable app's identity, source files and icon so user data and
// licenses remain in the same profile when moving to an installed build.
const {build,Platform,Arch}=require('electron-builder');
const {build:base,version}=require('../package.json');
build({targets:Platform.WINDOWS.createTarget('nsis',Arch.x64),publish:'never',config:{
 ...base,
 win:{...base.win,target:'nsis',artifactName:`MuseVideoStudio-${version}-Setup.exe`},
 nsis:{oneClick:false,perMachine:false,allowElevation:false,allowToChangeInstallationDirectory:true,
  createDesktopShortcut:'always',createStartMenuShortcut:true,shortcutName:'Muse Video Studio',
  include:require('node:path').join(__dirname,'installer-shortcuts.nsh'),
  deleteAppDataOnUninstall:false,runAfterFinish:true,installerLanguages:['en_US','vi_VN'],displayLanguageSelector:true}
}}).catch(error=>{console.error(error);process.exitCode=1;});
