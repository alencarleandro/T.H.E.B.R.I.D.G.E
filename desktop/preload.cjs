const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bridge', {
  info: () => ipcRenderer.invoke('info'),
  sources: () => ipcRenderer.invoke('sources'),
  start: source => ipcRenderer.invoke('host:start', source),
  stop: () => ipcRenderer.invoke('host:stop'),
  input: value => ipcRenderer.send('input', value),
  onStop: callback => ipcRenderer.on('emergency-stop', callback)
});
