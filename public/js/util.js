// Small formatting and HTML helpers shared by all views.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Escape, then turn bare URLs into links.
export const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');

// Textarea "one bullet per line" <-> array.
export const toLines = (text) => String(text || '').split('\n').map((l) => l.replace(/^\s*[-•*·]\s*/, '').trim()).filter(Boolean);
export const fromLines = (arr) => (arr || []).join('\n');
const isNA = (arr) => !arr || !arr.length || (arr.length === 1 && /^n\/?a$|^none$/i.test(arr[0]));

export function bullets(arr, empty = 'N/A') {
  if (isNA(arr)) return `<p class="na">${esc(empty)}</p>`;
  return `<ul>${arr.map((b) => `<li>${linkify(b)}</li>`).join('')}</ul>`;
}
export const hasItems = (arr) => !isNA(arr);

// ---- dates (ISO yyyy-mm-dd strings, interpreted in local time) ----
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function toISO(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
export const todayISO = () => toISO(new Date());
export const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return toISO(d); };
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
export function fmtDate(iso, { year = true } = {}) {
  const d = parseDate(iso);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year ? ` ${d.getFullYear()}` : ''}`;
}
export function fmtRange(a, b) {
  if (!a && !b) return '';
  if (!a || !b) return fmtDate(a || b);
  return `${fmtDate(a, { year: parseDate(a).getFullYear() !== parseDate(b).getFullYear() })} – ${fmtDate(b)}`;
}
export const monthShort = (iso) => MONTHS[parseDate(iso).getMonth()];
export const dayNum = (iso) => parseDate(iso).getDate();
export function ago(ts) {
  if (!ts) return '';
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(toISO(new Date(ts)));
}

// ---- status vocabularies ----
export const HEALTH = ['On Track', 'At Risk', 'Off Track'];
export const ACTION_STATUS = ['Not Started', 'In Progress', 'Blocked', 'Complete', 'Deferred'];
export const PRIORITY = ['High', 'Medium', 'Low'];
export const COMMS_STATUS = ['Draft', 'In Review', 'Approved', 'Published', 'Archived'];
export const OPEN_STATUSES = ['Not Started', 'In Progress', 'Blocked'];

const STATUS_CLASS = {
  'On Track': 'green', 'At Risk': 'amber', 'Off Track': 'red',
  Draft: '', Submitted: 'blue', 'In Review': 'blue', Approved: 'green', Published: 'dark', Archived: '',
  'Not Started': '', 'In Progress': 'blue', Blocked: 'amber', Complete: 'green', Deferred: '',
  High: 'red', Medium: 'amber', Low: '', Planned: 'blue', Done: 'green',
};
export const pill = (text, cls = STATUS_CLASS[text] ?? '') => text ? `<span class="pill ${cls}">${esc(text)}</span>` : '';

export const isOverdue = (a) => !!a.dueDate && OPEN_STATUSES.includes(a.status) && a.dueDate < todayISO();
export const isOpen = (a) => OPEN_STATUSES.includes(a.status);

export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

export const WS_COLORS = { ws_comms: '#3ee07f', ws_literacy: '#5cc8ff', ws_usecases: '#f5c84b', ws_agents: '#c49bff', ws_measure: '#ff9f6e' };
export const wsColor = (id) => WS_COLORS[id] || '#9fd1bf';

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
