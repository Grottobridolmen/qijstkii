// Entry point: Express static + Socket.IO + Game.
import express from 'express';
import http from 'node:http';
import { Server as IOServer } from 'socket.io';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(express.static(PUBLIC_DIR));
app.get('/health', (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const io = new IOServer(httpServer, {
  cors: { origin: '*' },
  pingInterval: 10000,
  pingTimeout: 20000,
});

const seedStr = process.env.SEED || '';
const seed = seedStr ? (parseInt(seedStr, 10) >>> 0) : (Math.floor(Math.random() * 0xffffffff) >>> 0);

const game = new Game(seed);
game.attach(io);

function localIPs() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        out.push({ name, address: net.address });
      }
    }
  }
  return out;
}

httpServer.listen(PORT, '0.0.0.0', () => {
  const ips = localIPs();
  console.log('\n=== DIG-WORLD ===');
  console.log(`Seed: ${seed}`);
  console.log(`Сервер запущен на порту ${PORT}.`);
  console.log('Открой одну из ссылок ниже в браузере телефона:');
  console.log(`  http://localhost:${PORT}/   (с этого устройства)`);
  for (const ip of ips) {
    console.log(`  http://${ip.address}:${PORT}/   (через ${ip.name})`);
  }
  console.log('\nЧтобы играть с друзьями: раздай Wi‑Fi с этого устройства (или подключитесь к одной общей сети),');
  console.log('и пусть друзья откроют один из IP‑адресов выше в своём браузере.\n');
});

function shutdown() {
  console.log('\nЗавершение работы, сохраняю мир...');
  game.shutdown();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
