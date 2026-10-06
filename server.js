// mAIn Council Collaboration Hub — zero-dependency Node server.
// Serves the single-page app from /public and a small JSON REST API backed by
// a JSON file (data/db.json, created from data/seed.json on first run).
//
//   node server.js            start on PORT (default 3000)
//   node server.js --reset    discard data/db.json and re-seed

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { can, COLLECTIONS } from './public/js/permissions.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'data', 'db.json');
const SEED_FILE = path.join(ROOT, 'data', 'seed.json');
const PORT = Number(process.env.PORT) || 3000;

// Fields clients may never set directly.
const PROTECTED = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'];
const ID_PREFIX = {
  workstreams: 'ws', members: 'm', updates: 'upd', snapshots: 'snap', actions: 'act',
  notes: 'note', comments: 'cmt', links: 'lnk', wins: 'win', comms: 'mail', activities: 'evt',
};

export function loadDb(file = DB_FILE, { reset = false } = {}) {
  if (reset || !fs.existsSync(file)) {
    const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    for (const c of COLLECTIONS) seed[c] ||= [];
    fs.mkdirSync(path.dirname(file), { recursive: true });
    writeDb(seed, file);
    return seed;
  }
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const c of COLLECTIONS) db[c] ||= [];
  return db;
}

function writeDb(db, file = DB_FILE) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file); // atomic replace so a crash never leaves half a file
}

const newId = (col) => `${ID_PREFIX[col] || 'x'}_${crypto.randomBytes(5).toString('hex')}`;

function clean(body) {
  const out = { ...body };
  for (const k of PROTECTED) delete out[k];
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 2_000_000) reject(Object.assign(new Error('Request too large'), { status: 413 }));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.normalize(path.join(PUBLIC_DIR, urlPath));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, { error: 'Forbidden' });
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC_DIR, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

export function createApp(db, persist = () => writeDb(db)) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://x');
      if (!url.pathname.startsWith('/api/')) return serveStatic(req, res);

      const userId = req.headers['x-user-id'];
      const user = userId ? db.members.find((m) => m.id === userId && m.active !== false) || null : null;
      const [, , col, id] = url.pathname.split('/');

      if (col === 'state' && req.method === 'GET') {
        return send(res, 200, { ...db, serverTime: new Date().toISOString() });
      }
      if (!COLLECTIONS.includes(col)) return send(res, 404, { error: 'Unknown collection' });
      const list = db[col];

      if (req.method === 'GET') {
        if (!id) return send(res, 200, list);
        const rec = list.find((r) => r.id === id);
        return rec ? send(res, 200, rec) : send(res, 404, { error: 'Not found' });
      }

      if (!user) return send(res, 401, { error: 'Choose who you are (top right) before making changes.' });
      const now = new Date().toISOString();

      if (req.method === 'POST' && !id) {
        const rec = { ...clean(await readBody(req)), id: newId(col), createdAt: now, createdBy: user.id, updatedAt: now, updatedBy: user.id };
        if (!can(user, 'create', col, rec, db)) return send(res, 403, { error: 'You do not have permission to add this.' });
        list.push(rec);
        persist();
        return send(res, 201, rec);
      }

      const idx = list.findIndex((r) => r.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      const existing = list[idx];

      if (req.method === 'PUT' || req.method === 'PATCH') {
        const next = { ...existing, ...clean(await readBody(req)), updatedAt: now, updatedBy: user.id };
        if (!can(user, 'edit', col, existing, db, next)) return send(res, 403, { error: 'You do not have permission to make this change.' });
        list[idx] = next;
        persist();
        return send(res, 200, next);
      }

      if (req.method === 'DELETE') {
        if (!can(user, 'delete', col, existing, db)) return send(res, 403, { error: 'You do not have permission to delete this.' });
        list.splice(idx, 1);
        persist();
        return send(res, 200, { ok: true });
      }

      return send(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      return send(res, err.status || 500, { error: err.message || 'Server error' });
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = loadDb(DB_FILE, { reset: process.argv.includes('--reset') });
  http.createServer(createApp(db)).listen(PORT, () => {
    console.log(`mAIn Council Hub running at http://localhost:${PORT}`);
  });
}
