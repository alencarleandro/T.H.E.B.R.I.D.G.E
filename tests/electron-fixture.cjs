const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { createSignaling } = require('../desktop/signaling.cjs');
let server;
app.whenReady().then(() => {
  ipcMain.handle('info', () => ({ name: 'BRIDGE · TESTE', addresses: ['127.0.0.1'] }));
  ipcMain.handle('sources', () => [{ id: 'synthetic', name: 'Tela de teste' }]);
  ipcMain.handle('host:start', async () => {
    server = createSignaling({ port: 0, token: '1234567890abcdef12345678', approve: async () => true });
    return { token: '1234567890abcdef12345678', port: await server.ready };
  });
  ipcMain.handle('host:stop', () => { server?.close(); server = null; });
  ipcMain.on('input', (_event, data) => { global.receivedInputs = [...(global.receivedInputs || []), data]; });
  for (let i = 0; i < 2; i++) {
    const window = new BrowserWindow({ width: 1260, height: 930, show: false, webPreferences: { preload: path.join(__dirname, '../desktop/preload.cjs'), contextIsolation: true, sandbox: true } });
    window.loadFile(path.join(__dirname, '../web/index.html'));
  }
});
app.on('window-all-closed', () => { server?.close(); app.quit(); });
