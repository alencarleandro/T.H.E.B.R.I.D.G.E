const $ = id => document.getElementById(id);
const desktop = Boolean(window.bridge);
let mode = 'client', pc, socket, media, control, motion, statsTimer, lastStats, sessionId = 0;
let pendingIce = [], inputTimer, padFrame, currentPadKeys = new Set(), padMouse = false;
let connectionTimer, offerQueue = Promise.resolve();
const profiles = { fast: { width: 1280, height: 720, fps: 60 }, balanced: { width: 1920, height: 1080, fps: 60 }, quality: { width: 1920, height: 1080, fps: 120 } };
function status(text, error = false) { $('status-text').textContent = text; $('status').classList.toggle('error', error); }
function signal(message) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); }
function sendInput(message, fast = false) {
  const channel = fast ? motion : control;
  if (channel?.readyState === 'open' && channel.bufferedAmount < 8192) channel.send(JSON.stringify(message));
}
function lockSettings(active) {
  ['connect', 'start-host', 'profile', 'bitrate', 'audio', 'source', 'address', 'token'].forEach(id => $(id).disabled = active);
  document.querySelectorAll('.nav').forEach(button => button.disabled = active);
  ['profile', 'bitrate', 'audio'].forEach(id => $(id).disabled = active || mode === 'client');
  $('disconnect').hidden = !active;
}
async function disconnect(message = 'Sessão encerrada', error = false) {
  ++sessionId;
  sendInput({ type: 'release' });
  clearInterval(statsTimer); clearInterval(inputTimer); clearTimeout(connectionTimer); cancelAnimationFrame(padFrame);
  currentPadKeys.clear(); padMouse = false;
  if (socket) { socket.onclose = null; socket.close(); socket = null; }
  if (pc) { pc.onconnectionstatechange = null; pc.close(); pc = null; }
  control = motion = null; pendingIce = []; lastStats = null;
  media?.getTracks().forEach(track => track.stop()); media = null;
  $('stream').srcObject = null; $('player').hidden = true; $('pairing').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  if (desktop && mode === 'host') await window.bridge.stop();
  lockSettings(false); $('connection-label').textContent = 'SEM TRANSMISSÃO'; $('connection-led').classList.add('neutral');
  ['stat-rtt', 'stat-fps', 'stat-rate', 'stat-loss'].forEach(id => $(id).textContent = '—');
  status(message, error);
}
function setCodec(peer) {
  const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs || [];
  const preferred = [...codecs.filter(codec => codec.mimeType.toLowerCase() === 'video/h264'), ...codecs.filter(codec => codec.mimeType.toLowerCase() !== 'video/h264')];
  peer.getTransceivers().filter(item => item.sender.track?.kind === 'video' || item.receiver.track?.kind === 'video').forEach(item => { if (item.setCodecPreferences) item.setCodecPreferences(preferred); });
}
function setupChannel(channel, receiving) {
  if (channel.label === 'control') control = channel;
  if (channel.label === 'motion') motion = channel;
  if (!receiving) return;
  let lastInput = Date.now();
  if (channel.label === 'control') {
    clearInterval(inputTimer);
    inputTimer = setInterval(() => { if (Date.now() - lastInput > 1500) window.bridge.input({ type: 'release' }); }, 500);
  }
  channel.onmessage = event => {
    if (typeof event.data !== 'string' || event.data.length > 512) return;
    try { const message = JSON.parse(event.data); lastInput = Date.now(); if (message.type !== 'heartbeat') window.bridge.input(message); } catch {}
  };
  channel.onclose = () => window.bridge.input({ type: 'release' });
}
function makePeer(host) {
  const peer = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
  pc = peer; pendingIce = [];
  peer.onicecandidate = event => { if (event.candidate) signal({ type: 'ice', candidate: event.candidate.toJSON() }); };
  peer.onconnectionstatechange = () => {
    if (pc !== peer) return;
    const state = peer.connectionState;
    if (state === 'connected') {
      clearTimeout(connectionTimer); status(host ? 'Receptor conectado. Transmitindo seu jogo.' : 'Conectado ao PC de jogos.');
      $('connection-label').textContent = 'TRANSMISSÃO ATIVA'; $('connection-led').classList.remove('neutral');
      $('player-state').textContent = 'Conexão direta';
      startStats(peer);
    }
    if (state === 'disconnected') { status('Conexão interrompida. Tentando recuperar…'); if (host) window.bridge.input({ type: 'release' }); }
    if (state === 'failed') disconnect('Não foi possível manter a conexão. Verifique a rede e o firewall.', true);
  };
  if (host) {
    media.getTracks().forEach(track => peer.addTrack(track, media));
    setupChannel(peer.createDataChannel('control', { ordered: true }), true);
    setupChannel(peer.createDataChannel('motion', { ordered: false, maxRetransmits: 0 }), true);
  } else {
    peer.ondatachannel = event => setupChannel(event.channel, false);
    peer.ontrack = event => {
      $('stream').srcObject = event.streams[0]; $('player').hidden = false;
      $('touch-controls').hidden = !$('touch').checked;
      $('stream').play().catch(() => { $('sound').hidden = false; });
      if ('playoutDelayHint' in event.receiver) event.receiver.playoutDelayHint = 0;
      if ('jitterBufferTarget' in event.receiver) event.receiver.jitterBufferTarget = 0;
    };
    clearInterval(inputTimer); inputTimer = setInterval(() => sendInput({ type: 'heartbeat' }), 500);
    pollGamepad();
  }
  return peer;
}
async function receiveSignal(message, id) {
  if (sessionId !== id) return;
  if (message.type === 'pending') { clearTimeout(connectionTimer); status('Aguardando autorização no PC de jogos…'); }
  if (message.type === 'ready') {
    status(mode === 'host' ? 'Sessão aberta. Conecte seu receptor com os dados abaixo.' : 'Autorizado. Preparando transmissão…');
    if (mode === 'client') connectionTimer = setTimeout(() => disconnect('A transmissão não iniciou. Verifique o firewall do host e a rede.', true), 25000);
  }
  if (message.type === 'peer' && mode === 'host') {
    pc?.close(); clearInterval(statsTimer);
    const peer = makePeer(true); setCodec(peer);
    for (const sender of peer.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) parameters.encodings = [{}];
      parameters.encodings[0].maxBitrate = Number($('bitrate').value) * 1000000;
      parameters.encodings[0].maxFramerate = profiles[$('profile').value].fps;
      parameters.degradationPreference = 'maintain-framerate';
      await sender.setParameters(parameters);
    }
    await peer.setLocalDescription(await peer.createOffer()); signal({ type: 'offer', description: peer.localDescription });
  }
  if (message.type === 'offer' && mode === 'client') {
    const peer = pc || makePeer(false);
    await peer.setRemoteDescription(message.description); setCodec(peer);
    for (const candidate of pendingIce.splice(0)) await peer.addIceCandidate(candidate);
    await peer.setLocalDescription(await peer.createAnswer()); signal({ type: 'answer', description: peer.localDescription });
  }
  if (message.type === 'answer' && pc) {
    await pc.setRemoteDescription(message.description);
    for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
  }
  if (message.type === 'ice') { if (pc?.remoteDescription) await pc.addIceCandidate(message.candidate); else pendingIce.push(message.candidate); }
  if (message.type === 'left') {
    pc?.close(); pc = null; clearInterval(statsTimer); clearInterval(inputTimer);
    window.bridge.input({ type: 'release' }); status('Receptor saiu. Aguardando nova conexão.');
    $('connection-label').textContent = 'AGUARDANDO RECEPTOR'; $('connection-led').classList.add('neutral');
  }
}
function openSocket(address, token, id) {
  socket = new WebSocket(`ws://${address}`);
  socket.onopen = () => signal({ type: 'hello', role: mode, token, name: desktop ? 'Receptor Windows' : 'Receptor Android' });
  socket.onmessage = event => {
    offerQueue = offerQueue.then(() => receiveSignal(JSON.parse(event.data), id)).catch(error => { if (sessionId === id) disconnect(`Falha na transmissão: ${error.message}`, true); });
  };
  socket.onerror = () => { if (sessionId === id) disconnect('Host inacessível. Confira o IP, a mesma rede e a porta TCP 47831 no firewall.', true); };
  socket.onclose = event => { if (sessionId === id) disconnect(event.reason || 'A conexão com o host foi encerrada.', true); };
}
$('connect').onclick = async () => {
  const address = $('address').value.trim(); const token = $('token').value.trim().toLowerCase().replace(/\s/g, '');
  if (!/^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::\d{1,5})?$/.test(address)) return status('Informe o IP do host, sem http:// ou caminhos.', true);
  if (!/^[a-f0-9]{24}$/.test(token)) return status('Informe os 24 caracteres do código exibido no host.', true);
  localStorage.setItem('bridge-address', address); lockSettings(true); status('Localizando seu PC…');
  const id = ++sessionId;
  connectionTimer = setTimeout(() => disconnect('O host não respondeu. Verifique o endereço e a rede.', true), 20000);
  makePeer(false); openSocket(address.includes(':') ? address : `${address}:47831`, token, id);
};
$('start-host').onclick = async () => {
  lockSettings(true); status('Preparando captura da tela…'); const id = ++sessionId;
  try {
    const session = await window.bridge.start($('source').value);
    if (id !== sessionId) return;
    const profile = profiles[$('profile').value];
    media = await navigator.mediaDevices.getDisplayMedia({ video: { width: { ideal: profile.width, max: profile.width }, height: { ideal: profile.height, max: profile.height }, frameRate: { ideal: profile.fps, max: profile.fps } }, audio: $('audio').checked });
    media.getVideoTracks()[0].contentHint = 'motion';
    media.getVideoTracks()[0].onended = () => { if (id === sessionId) disconnect('Captura encerrada.'); };
    const info = await window.bridge.info();
    $('host-address').textContent = info.addresses.length ? info.addresses.join(' / ') : 'Sem endereço de rede. Conecte o PC à rede.';
    $('host-token').textContent = session.token; $('pairing').hidden = false;
    openSocket(`127.0.0.1:${session.port}`, session.token, id);
  } catch (error) { disconnect(`Não foi possível iniciar: ${error.message}`, true); }
};
function startStats(peer) {
  clearInterval(statsTimer); lastStats = null;
  statsTimer = setInterval(async () => {
    if (peer.connectionState !== 'connected') return;
    try {
      const reports = await peer.getStats();
      reports.forEach(report => {
        if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated && report.currentRoundTripTime != null) $('stat-rtt').textContent = `${Math.round(report.currentRoundTripTime * 1000)} ms`;
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          $('stat-fps').textContent = report.framesPerSecond == null ? '—' : `${Math.round(report.framesPerSecond)}`;
          $('stat-loss').textContent = `${Math.max(0, report.packetsLost || 0)}`;
          if (lastStats) $('stat-rate').textContent = `${((report.bytesReceived - lastStats.bytes) * 8 / (report.timestamp - lastStats.time) / 1000).toFixed(1)} Mb/s`;
          lastStats = { bytes: report.bytesReceived, time: report.timestamp };
          $('player-state').textContent = `${$('stat-fps').textContent} FPS · ${$('stat-rtt').textContent} RTT · ${$('stat-rate').textContent}`;
        }
      });
    } catch {}
  }, 1000);
}
$('disconnect').onclick = () => disconnect(); $('leave-player').onclick = () => disconnect();
$('bitrate').oninput = () => $('bitrate-value').textContent = `${$('bitrate').value} Mbps`;
$('touch').onchange = () => { $('touch-controls').hidden = !$('touch').checked; sendInput({ type: 'release' }); };
$('fullscreen').onclick = () => $('player').requestFullscreen().catch(() => { $('player-state').textContent = 'Tela cheia indisponível neste aparelho'; });
$('sound').onclick = () => { $('stream').muted = false; $('stream').play().then(() => $('sound').hidden = true).catch(() => {}); };
$('capture-mouse').onclick = async () => {
  try { await $('stream').requestPointerLock({ unadjustedMovement: true }); }
  catch { try { await $('stream').requestPointerLock(); } catch { $('player-state').textContent = 'Captura de mouse indisponível'; } }
};
document.addEventListener('pointerlockchange', () => {
  const captured = Boolean(document.pointerLockElement);
  $('player-tip').classList.toggle('fade', captured); $('capture-mouse').textContent = captured ? 'Mouse capturado · Esc libera' : 'Capturar mouse';
  if (!captured) sendInput({ type: 'release' });
});
document.addEventListener('mousemove', event => { if (document.pointerLockElement) sendInput({ type: 'move', x: event.movementX, y: event.movementY }, true); });
for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => {
  if (!document.pointerLockElement || event.repeat) return;
  event.preventDefault(); sendInput({ type: 'key', code: event.code, down: type === 'keydown' });
});
for (const type of ['mousedown', 'mouseup']) $('stream').addEventListener(type, event => { if (document.pointerLockElement) { event.preventDefault(); sendInput({ type: 'button', button: event.button, down: type === 'mousedown' }); } });
$('stream').oncontextmenu = event => event.preventDefault();
$('stream').addEventListener('wheel', event => { if (document.pointerLockElement) { event.preventDefault(); sendInput({ type: 'wheel', y: event.deltaY }); } }, { passive: false });
window.addEventListener('blur', () => { sendInput({ type: 'release' }); currentPadKeys.clear(); padMouse = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { sendInput({ type: 'release' }); currentPadKeys.clear(); padMouse = false; } });
document.querySelectorAll('#touch-controls button').forEach(button => {
  const send = down => sendInput(button.dataset.key ? { type: 'key', code: button.dataset.key, down } : { type: 'button', button: Number(button.dataset.mouse), down });
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); send(true); };
  button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => send(false);
});
let lastTouch;
$('look-pad').onpointerdown = event => { $('look-pad').setPointerCapture(event.pointerId); lastTouch = { x: event.clientX, y: event.clientY }; };
$('look-pad').onpointermove = event => { if (lastTouch) { sendInput({ type: 'move', x: (event.clientX - lastTouch.x) * 2, y: (event.clientY - lastTouch.y) * 2 }, true); lastTouch = { x: event.clientX, y: event.clientY }; } };
$('look-pad').onpointerup = $('look-pad').onpointercancel = () => lastTouch = null;
function pollGamepad() {
  if (mode !== 'client') return;
  const pad = navigator.getGamepads?.().find(item => item && item.mapping === 'standard');
  const keys = new Set();
  if (pad && !document.hidden && document.hasFocus() && !$('player').hidden) {
    if (pad.axes[0] < -.3) keys.add('KeyA'); if (pad.axes[0] > .3) keys.add('KeyD');
    if (pad.axes[1] < -.3) keys.add('KeyW'); if (pad.axes[1] > .3) keys.add('KeyS');
    ['Space', 'ControlLeft', 'KeyR', 'KeyE', 'KeyQ', 'ShiftLeft'].forEach((key, index) => { if (pad.buttons[index]?.pressed) keys.add(key); });
    if (pad.buttons[9]?.pressed) keys.add('Escape');
    const x = Math.abs(pad.axes[2]) > .15 ? pad.axes[2] * 13 : 0, y = Math.abs(pad.axes[3]) > .15 ? pad.axes[3] * 13 : 0;
    if (x || y) sendInput({ type: 'move', x, y }, true);
  }
  for (const key of keys) if (!currentPadKeys.has(key)) sendInput({ type: 'key', code: key, down: true });
  for (const key of currentPadKeys) if (!keys.has(key)) sendInput({ type: 'key', code: key, down: false });
  currentPadKeys = keys;
  const firing = Boolean(pad && !document.hidden && document.hasFocus() && !$('player').hidden && pad.buttons[7]?.pressed);
  if (firing !== padMouse) { sendInput({ type: 'button', button: 0, down: firing }); padMouse = firing; }
  padFrame = requestAnimationFrame(pollGamepad);
}
document.querySelectorAll('.nav').forEach(button => button.onclick = async () => {
  mode = button.dataset.mode;
  document.querySelectorAll('.nav').forEach(item => item.classList.toggle('active', item === button));
  $('client-panel').hidden = mode !== 'client'; $('host-panel').hidden = mode !== 'host';
  $('mode-title').textContent = mode === 'host' ? 'Seu PC, pronto para jogar' : 'Conectar ao seu PC';
  $('mode-tag').textContent = mode === 'host' ? 'HOST' : 'RECEPTOR'; status('Pronto para conectar'); lockSettings(false);
  if (mode === 'host') {
    try { const sources = await window.bridge.sources(); $('source').replaceChildren(...sources.map(source => new Option(source.name, source.id))); }
    catch (error) { status(error.message, true); }
  }
});
$('address').value = localStorage.getItem('bridge-address') || '';
lockSettings(false);
if (desktop) { window.bridge.info().then(info => $('device-name').textContent = info.name); window.bridge.onStop(() => disconnect('Sessão encerrada no host.')); }
else { $('host-nav').hidden = true; $('touch').checked = true; $('device-name').textContent = 'Receptor Android'; }
window.addEventListener('beforeunload', () => sendInput({ type: 'release' }));
