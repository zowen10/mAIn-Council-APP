// Client-side state: the whole (small) dataset is loaded from /api/state and
// re-fetched after every change, so views can simply re-render from `db`.
import { can } from './permissions.js';
import { toast } from './ui.js';

export let db = null;
const USER_KEY = 'mainHub.userId';
let listeners = [];

function storedUser() { try { return localStorage.getItem(USER_KEY); } catch { return null; } }
let userId = storedUser();

export const onChange = (fn) => listeners.push(fn);
const emit = () => listeners.forEach((fn) => fn());

export async function load() {
  const res = await fetch('/api/state');
  if (!res.ok) throw new Error('Could not load hub data');
  db = await res.json();
  if (userId && !me()) userId = null;
  return db;
}

export const me = () => (userId && db ? db.members.find((m) => m.id === userId && m.active !== false) : null) || null;
export function setUser(id) {
  userId = id || null;
  try { id ? localStorage.setItem(USER_KEY, id) : localStorage.removeItem(USER_KEY); } catch { /* storage unavailable */ }
  emit();
}

export const canDo = (action, col, rec = {}, next) => can(me(), action, col, rec, db, next);
export const hasRole = (...roles) => !!me() && (me().roles || []).some((r) => roles.includes(r));

async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': userId } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Create (no id) or update (with id) a record, then refresh and re-render. */
export async function save(col, rec, { quiet = false, message } = {}) {
  try {
    const { id, ...body } = rec;
    const out = id ? await request('PUT', `/api/${col}/${id}`, body) : await request('POST', `/api/${col}`, body);
    await load();
    emit();
    if (!quiet) toast(message || 'Saved');
    return out;
  } catch (err) {
    toast(err.message, true);
    throw err;
  }
}

/** Upload a file (any type). Pass replaceId to upload a new version of an existing file. */
export async function upload(file, { targetType = '', targetId = '', replaceId } = {}) {
  const params = new URLSearchParams({ name: file.name, ...(replaceId ? {} : { targetType, targetId }) });
  const res = await fetch(replaceId ? `/api/files/${replaceId}/content?${params}` : `/api/files?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream', ...(userId ? { 'X-User-Id': userId } : {}) },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${file.name}: ${data.error || `upload failed (${res.status})`}`);
  return data;
}

/** Re-fetch after a batch of uploads and re-render. */
export async function refresh() { await load(); emit(); }

export const filesFor = (targetType, targetId) => (db.files || [])
  .filter((f) => f.targetType === targetType && f.targetId === targetId)
  .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

export async function remove(col, id, message = 'Deleted') {
  try {
    await request('DELETE', `/api/${col}/${id}`);
    await load();
    emit();
    toast(message);
  } catch (err) {
    toast(err.message, true);
    throw err;
  }
}

// ---- lookups ----
export const workstreams = ({ all = false } = {}) => (db.workstreams || []).filter((w) => all || w.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
export const ws = (id) => db.workstreams.find((w) => w.id === id);
export const wsName = (id) => ws(id)?.name || 'Council';
export const member = (id) => db.members.find((m) => m.id === id);
export const memberName = (id) => member(id)?.name || (id === 'system' ? 'Imported' : 'Unknown');
export const members = () => db.members.filter((m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name));

export const approvedSnapshots = () => db.snapshots.filter((s) => s.status === 'Approved').sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '') || (b.approvedAt || '').localeCompare(a.approvedAt || ''));
export const currentSnapshot = () => approvedSnapshots()[0] || null;

/** Latest update per workstream: prefer submitted/approved over drafts. */
export function latestUpdate(workstreamId, { includeDrafts = false } = {}) {
  return db.updates
    .filter((u) => u.workstreamId === workstreamId && (includeDrafts || u.status !== 'Draft'))
    .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] || null;
}

// Newest first, so the latest post is always at the top of a discussion.
export const commentsFor = (targetType, targetId) => db.comments.filter((c) => c.targetType === targetType && c.targetId === targetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
