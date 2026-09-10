const { app, BrowserWindow, ipcMain, desktopCapturer, session, dialog, globalShortcut } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const { createSignaling } = require('./signaling.cjs');
const { encodeInput } = require('./input.cjs');
let window, server, helper, selectedSource, controlsAllowed = false, hostGeneration = 0;
function stop() {
  hostGeneration++;
  controlsAllowed = false;
  if (helper) { helper.stdin.write('release\n'); helper.stdin.end(); helper = null; }
  server?.close(); server = null; selectedSource = null;
}
app.whenReady().then(() => {
  window = new BrowserWindow({ width: 1260, height: 930, minWidth: 900, minHeight: 680, backgroundColor: '#090d13', title: 'T.H.E.B.R.I.D.G.E', autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => callback(['media', 'display-capture', 'pointerLock', 'fullscreen'].includes(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const source = sources.find(item => item.id === selectedSource);
    callback(source ? { video: source, audio: 'loopback' } : {});
  });
  ipcMain.handle('info', () => ({ name: os.hostname(), platform: process.platform, addresses: Object.values(os.networkInterfaces()).flat().filter(item => item.family === 'IPv4' && !item.internal).map(item => item.address) }));
  ipcMain.handle('sources', async () => (await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })).map(item => ({ id: item.id, name: item.name })));
  ipcMain.handle('host:start', async (_event, sourceId) => {
    stop();
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (!sources.some(item => item.id === sourceId)) throw new Error('Selecione uma tela válida.');
    selectedSource = sourceId;
    const executable = app.isPackaged ? path.join(process.resourcesPath, 'BridgeInput.exe') : path.join(__dirname, '../native/bin/BridgeInput.exe');
    if (!existsSync(executable)) throw new Error('Módulo de controles ausente. Execute npm run native.');
    helper = spawn(executable, [], { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    const currentHelper = helper;
    helper.on('exit', () => { if (helper === currentHelper) { stop(); window.webContents.send('emergency-stop'); } });
    helper.stdin.on('error', () => {});
    helper.on('error', () => { stop(); window.webContents.send('emergency-stop'); });
    const token = randomBytes(12).toString('hex');
    const generation = hostGeneration;
    server = createSignaling({ token, approve: async (name, address) => {
      const result = await dialog.showMessageBox(window, { type: 'question', title: 'Permitir receptor', message: `${name} quer jogar neste PC`, detail: `Endereço: ${address}\nPermitir transmissão de tela, áudio, teclado e mouse nesta sessão?`, buttons: ['Recusar', 'Permitir'], defaultId: 0, cancelId: 0 });
      if (generation !== hostGeneration) return false;
      controlsAllowed = result.response === 1; return controlsAllowed;
    }, onState: state => { if (state !== 'connected') { controlsAllowed = false; helper?.stdin.write('release\n'); } } });
    try { await server.ready; } catch (error) { stop(); throw new Error(`Não foi possível abrir a porta 47831: ${error.message}`); }
    return { token, port: 47831 };
  });
  ipcMain.handle('host:stop', stop);
  ipcMain.on('input', (_event, value) => {
    if (!controlsAllowed || !helper || helper.stdin.writableLength > 16384) return;
    const line = encodeInput(value); if (line) helper.stdin.write(line + '\n');
  });
  globalShortcut.register('Control+Alt+F12', () => { stop(); window.webContents.send('emergency-stop'); });
  window.loadFile(path.join(__dirname, '../web/index.html'));
  window.on('closed', stop);
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { stop(); globalShortcut.unregisterAll(); });
