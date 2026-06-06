const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createTelegramBot } = require('./js/telegram-bot');

function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const i = trimmed.indexOf('=');
    if (i === -1) return;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  });
}
loadEnv();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'site.json');
const IMAGES_DIR = path.join(__dirname, 'images');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'seven2026';
const adminTokens = new Map();

app.use(express.json({ limit: '12mb' }));
app.use(express.static(__dirname));

function readSite() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeSite(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function authAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !adminTokens.has(token)) {
    return res.status(401).json({ error: 'Требуется вход в админку' });
  }
  next();
}

app.get('/api/site', (req, res) => {
  res.json(readSite());
});

app.post('/api/admin/login', (req, res) => {
  const password = (req.body && req.body.password) || '';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminTokens.set(token, Date.now());
  res.json({ token });
});

app.put('/api/admin/site', authAdmin, (req, res) => {
  const data = req.body;
  if (!data || typeof data !== 'object' || !Array.isArray(data.services) || !Array.isArray(data.masters)) {
    return res.status(400).json({ error: 'Некорректные данные сайта' });
  }
  try {
    writeSite(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сохранить' });
  }
});

function saveUploadedImage(raw, prefix) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Нет изображения');
  }
  const match = raw.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) throw new Error('Неверный формат файла');
  let ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const allowed = ['png', 'jpg', 'webp', 'gif'];
  if (!allowed.includes(ext)) throw new Error('Только PNG, JPG, WebP или GIF');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Файл больше 8 МБ');
  if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
  const fileName = `${prefix}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(IMAGES_DIR, fileName), buffer);
  return `images/${fileName}`;
}

app.post('/api/admin/upload-hero', authAdmin, (req, res) => {
  try {
    const publicPath = saveUploadedImage(req.body && req.body.image, 'hero-bg');
    const site = readSite();
    site.heroImage = publicPath;
    writeSite(site);
    res.json({ path: publicPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/upload-image', authAdmin, (req, res) => {
  try {
    const prefix = (req.body && req.body.prefix) || 'img';
    const publicPath = saveUploadedImage(req.body && req.body.image, prefix.replace(/[^a-z0-9-]/gi, ''));
    res.json({ path: publicPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SEVEN: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin.html`);
  const tgToken = process.env.TELEGRAM_BOT_TOKEN;
  if (tgToken) {
    createTelegramBot(tgToken, readSite).start();
  } else {
    console.log('Telegram: добавьте TELEGRAM_BOT_TOKEN в .env');
  }
});
