const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('studio', {
  invoke: (name, data) => {
    if (!['activateKey','stop','clearPending','clearList','applyReferences','imageFolder','pasteReference','logoutAccount','checkUSA','chooseVpnClient','vpnDownload','openVpnClient','packageClips','openPackage','merge','revealMerged','chooseFfmpeg','chooseBrowser','state','add','retry','remove','start','pause','browser','images','folder','settings','reveal','export'].includes(name)) throw Error('Unsupported action');
    return ipcRenderer.invoke('studio:' + name, data);
  },
  onUpdate: callback => ipcRenderer.on('studio:update', (_, data) => callback(data))
});
