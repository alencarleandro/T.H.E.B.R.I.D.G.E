const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const app = await electron.launch({ args: [path.join(__dirname, 'electron-fixture.cjs')] });
  try {
    while (app.windows().length < 2) await app.waitForEvent('window');
    const [host, client] = app.windows();
    const errors = [];
    host.on('pageerror', error => errors.push(error.message)); client.on('pageerror', error => errors.push(error.message));
    await host.waitForSelector('#connect');
    await host.screenshot({ path: path.join(__dirname, '../release/preview-desktop.png'), fullPage: true });
    await host.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
        const ctx = canvas.getContext('2d'); let frame = 0;
        setInterval(() => { ctx.fillStyle = '#142636'; ctx.fillRect(0, 0, 1280, 720); ctx.fillStyle = '#b5ff69'; ctx.font = '64px sans-serif'; ctx.fillText('THE BRIDGE · ' + frame++, 90, 360); }, 16);
        return canvas.captureStream(60);
      };
      const OriginalSocket = window.WebSocket;
      window.WebSocket = class extends OriginalSocket { constructor(url) { super(url); window.testSocketUrl = url; } };
    });
    await host.click('#host-nav'); await host.click('#start-host');
    await host.waitForSelector('#pairing:not([hidden])');
    const address = await host.evaluate(() => window.testSocketUrl.replace('ws://', ''));
    await client.fill('#address', address); await client.fill('#token', '1234567890abcdef12345678'); await client.click('#connect');
    await client.waitForFunction(() => { const video = document.getElementById('stream'); return video.videoWidth === 1280 && video.getVideoPlaybackQuality().totalVideoFrames > 5; }, null, { timeout: 30000 });
    await client.waitForFunction(() => document.getElementById('stat-fps').textContent !== '—');
    await client.evaluate(() => { document.getElementById('touch-controls').hidden = false; });
    // Explicit events exercise the actual reliable data channel without injecting OS input.
    await client.evaluate(() => { sendInput({ type: 'key', code: 'KeyW', down: true }); sendInput({ type: 'key', code: 'KeyW', down: false }); });
    await host.waitForTimeout(150);
    const inputs = await app.evaluate(() => global.receivedInputs || []);
    assert(inputs.some(item => item.code === 'KeyW' && item.down === true));
    assert(inputs.some(item => item.code === 'KeyW' && item.down === false));
    const result = await client.evaluate(() => ({ width: document.getElementById('stream').videoWidth, frames: document.getElementById('stream').getVideoPlaybackQuality().totalVideoFrames, fps: document.getElementById('stat-fps').textContent, rtt: document.getElementById('stat-rtt').textContent }));
    await client.click('#leave-player');
    await host.waitForFunction(() => document.getElementById('status-text').textContent.includes('Receptor saiu'));
    await host.click('#disconnect');
    await client.setViewportSize({ width: 390, height: 844 });
    await client.screenshot({ path: path.join(__dirname, '../release/preview-mobile.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: WebRTC synthetic video, real decoded frames, input channel, disconnect, responsive UI', result);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
