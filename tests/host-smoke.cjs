const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async () => {
  const app = await electron.launch(process.argv.includes('--packaged')
    ? { executablePath: path.join(__dirname, '../release/win-unpacked/T.H.E.B.R.I.D.G.E.exe'), args: [] }
    : { args: [path.join(__dirname, '..')] });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.click('#host-nav');
    await page.waitForFunction(() => document.getElementById('source').options.length > 0);
    await page.click('#start-host');
    await page.waitForSelector('#pairing:not([hidden])', { timeout: 30000 });
    const result = await page.evaluate(() => ({ video: media.getVideoTracks()[0].getSettings(), audioTracks: media.getAudioTracks().length }));
    assert(result.video.width > 0 && result.video.height > 0);
    await page.click('#disconnect');
    await page.waitForFunction(() => document.getElementById('status-text').textContent === 'Sessão encerrada');
    assert.deepEqual(errors, []);
    console.log('PASS: actual Windows capture started and stopped; no receiver, no OS input injected', result);
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
