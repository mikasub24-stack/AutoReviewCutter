const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', {
  invoke: (name, data) => {
    if (!['language','testBrowsers','openOutput','diagnostics','retryDownload','activateKey','stop','clearPending','clearList','applyReferences','imageFolder','pasteReference','logoutAccount','packageClips','openPackage','merge','revealMerged','chooseFfmpeg','chooseBrowser','storySetupVoice','storyCancelSetup','storyWindowsVoices','storyAddVoice','storyRemoveVoice','storyListen','storyPrepare','storyBuild','storyCancel','storyAnalyze','storyAnalyzeCancel','storyReveal','state','add','retry','regenerate','remove','start','pause','browser','images','folder','settings','reveal','export'].includes(name)) throw Error('Unsupported action');
    return ipcRenderer.invoke('studio:' + name, data);
  },
  onUpdate: callback => ipcRenderer.on('studio:update', (_, data) => callback(data))
});
