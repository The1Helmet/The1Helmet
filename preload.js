// Bridges the sandboxed renderer to the main process for menus and file I/O.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Menu commands pushed from main -> renderer.
  onMenu: (handler) => ipcRenderer.on('menu', (_e, msg) => handler(msg)),
  // File operations.
  save: (data, currentPath) => ipcRenderer.invoke('dialog:save', { data, currentPath }),
  saveAs: (data) => ipcRenderer.invoke('dialog:saveAs', { data }),
  open: () => ipcRenderer.invoke('dialog:open'),
});
