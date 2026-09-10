const { WebSocketServer, WebSocket } = require('ws');
const { timingSafeEqual } = require('node:crypto');

function createSignaling({ port = 47831, token, approve, onState = () => {} }) {
  const wss = new WebSocketServer({ port, host: '0.0.0.0', maxPayload: 65536 });
  let host, client, pending = false;
  const sockets = new Set();
  const attempts = new Map();
  const send = (socket, value) => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
  wss.on('connection', (socket, request) => {
    sockets.add(socket);
    let role;
    const timeout = setTimeout(() => socket.close(1008, 'Tempo de pareamento esgotado'), 15000);
    let count = 0;
    const rate = setInterval(() => { count = 0; }, 1000);
    socket.on('error', () => {});
    socket.on('message', async raw => {
      if (++count > 120) return socket.close(1008, 'Limite excedido');
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return socket.close(1008, 'Mensagem inválida'); }
      if (!message || typeof message !== 'object') return;
      if (!role) {
        if (message.type !== 'hello') return socket.close(1008, 'Pareamento necessário');
        const address = request.socket.remoteAddress;
        const previous = attempts.get(address);
        if (previous && previous.until > Date.now() && previous.count >= 5) return socket.close(1008, 'Aguarde um minuto');
        const actual = Buffer.from(typeof message.token === 'string' ? message.token : '');
        const expected = Buffer.from(token);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
          attempts.set(address, { count: previous?.until > Date.now() ? previous.count + 1 : 1, until: Date.now() + 60000 });
          return socket.close(1008, 'Código incorreto');
        }
        if (message.role === 'host' && (address === '127.0.0.1' || address === '::ffff:127.0.0.1') && !host) {
          role = 'host'; host = socket; clearTimeout(timeout); send(socket, { type: 'ready' });
        } else if (message.role === 'client' && host && !client && !pending) {
          role = 'pending'; pending = true; clearTimeout(timeout);
          send(socket, { type: 'pending' });
          let accepted = false;
          try { accepted = await approve(String(message.name || 'Receptor').slice(0, 60), address); } catch {}
          pending = false;
          if (socket.readyState !== WebSocket.OPEN) return;
          if (!accepted || !host) return socket.close(1008, 'Conexão não autorizada');
          role = 'client'; client = socket;
          send(socket, { type: 'ready' }); send(host, { type: 'peer' }); onState('connected');
        } else socket.close(1008, 'Host indisponível ou ocupado');
        return;
      }
      if (role !== 'host' && role !== 'client') return;
      if (['offer', 'answer', 'ice'].includes(message.type)) send(role === 'host' ? client : host, message);
    });
    socket.on('close', () => {
      clearTimeout(timeout); clearInterval(rate); sockets.delete(socket);
      if (socket === client) { client = null; send(host, { type: 'left' }); onState('waiting'); }
      if (socket === host) { host = null; client?.close(1001, 'Host encerrado'); }
    });
  });
  const cleanup = setInterval(() => { for (const [key, value] of attempts) if (value.until < Date.now()) attempts.delete(key); }, 60000);
  return {
    ready: new Promise((resolve, reject) => { wss.once('listening', () => resolve(wss.address().port)); wss.once('error', reject); }),
    close: () => { clearInterval(cleanup); for (const socket of sockets) socket.terminate(); wss.close(); }
  };
}
module.exports = { createSignaling };
