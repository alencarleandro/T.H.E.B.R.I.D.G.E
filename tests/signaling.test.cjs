const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { createSignaling } = require('../desktop/signaling.cjs');
const { encodeInput } = require('../desktop/input.cjs');
const token = '1234567890abcdef12345678';
async function connect(port, role, secret = token) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  await once(socket, 'open');
  socket.send(JSON.stringify({ type: 'hello', role, token: secret }));
  return socket;
}
test('invalid input cannot become arbitrary native commands', () => {
  assert.equal(encodeInput({ type: 'key', code: 'KeyW', down: true }), 'key 87 1');
  assert.equal(encodeInput({ type: 'key', code: 'KeyW\nrelease', down: true }), null);
  assert.equal(encodeInput({ type: 'move', x: Infinity, y: 0 }), null);
  assert.equal(encodeInput({ type: 'move', x: 99999, y: -99999 }), 'move 2000 -2000');
  assert.equal(encodeInput({ type: 'button', button: 9, down: true }), null);
  assert.equal(encodeInput({ type: 'key', code: 'KeyA', down: 'false' }), null);
});
test('rejects wrong code before approval', async t => {
  let approved = false;
  const server = createSignaling({ port: 0, token, approve: async () => { approved = true; return true; } });
  t.after(() => server.close());
  const socket = await connect(await server.ready, 'client', 'wrong');
  const [code] = await once(socket, 'close');
  assert.equal(code, 1008); assert.equal(approved, false);
});
test('requires consent, relays SDP only between paired devices and notifies disconnect', async t => {
  let consent;
  const server = createSignaling({ port: 0, token, approve: () => new Promise(resolve => consent = resolve) });
  t.after(() => server.close()); const port = await server.ready;
  const host = await connect(port, 'host'); await once(host, 'message');
  const client = await connect(port, 'client');
  const [pending] = await once(client, 'message'); assert.equal(JSON.parse(pending).type, 'pending');
  const hostPeer = once(host, 'message'), clientReady = once(client, 'message');
  consent(true); await clientReady;
  assert.equal(JSON.parse((await hostPeer)[0]).type, 'peer');
  const forwarded = once(client, 'message');
  host.send(JSON.stringify({ type: 'offer', description: { type: 'offer', sdp: 'test-sdp' } }));
  assert.equal(JSON.parse((await forwarded)[0]).description.sdp, 'test-sdp');
  const left = once(host, 'message'); client.close();
  assert.equal(JSON.parse((await left)[0]).type, 'left'); host.close();
});
test('refused receiver is closed without access', async t => {
  const server = createSignaling({ port: 0, token, approve: async () => false });
  t.after(() => server.close()); const port = await server.ready;
  const host = await connect(port, 'host'); await once(host, 'message');
  const client = await connect(port, 'client'); const [code] = await once(client, 'close');
  assert.equal(code, 1008); host.close();
});
