// Cầu nối tối thiểu cho cửa sổ ẩn dựng video bản đồ: chỉ gửi khung JPEG về tiến trình chính.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('maphistBridge', { frame: (index, buffer) => ipcRenderer.invoke('maphist:frame', index, buffer) });
