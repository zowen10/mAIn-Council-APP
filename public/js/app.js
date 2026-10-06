// Entry point: hash router, navigation, and the "who am I" picker.
import * as store from './store.js';
import { esc, isOverdue, wsColor } from './util.js';
import { ROLES } from './permissions.js';
import { toast } from './ui.js';
import { renderLanding } from './views/landing.js';
import { renderSnapshot, renderSnapshotEditor } from './views/snapshot.js';
import { renderActions } from './views/actions.js';
import { renderWorkstream } from './views/workstream.js';
import { renderNotes } from './views/notes.js';
import { renderWins } from './views/wins.js';
import { renderComms, renderCommsEditor } from './views/comms.js';
import { renderAdmin } from './views/admin.js';
import { renderSearch } from './views/search.js';

const routes = [
  [/^\/?$/, renderLanding],
  [/^\/snapshot\/new$/, (m) => renderSnapshotEditor(m, null)],
  [/^\/snapshot\/([\w-]+)\/edit$/, (m, [id]) => renderSnapshotEditor(m, id)],
  [/^\/snapshot\/([\w-]+)$/, (m, [id]) => renderSnapshot(m, id)],
  [/^\/actions$/, renderActions],
  [/^\/ws\/([\w-]+)$/, (m, [id], q) => renderWorkstream(m, id, q)],
  [/^\/notes$/, renderNotes],
  [/^\/wins$/, renderWins],
  [/^\/comms$/, renderComms],
  [/^\/comms\/new$/, (m, _p, q) => renderCommsEditor(m, null, q)],
  [/^\/comms\/([\w-]+)$/, (m, [id], q) => renderCommsEditor(m, id, q)],
  [/^\/admin$/, renderAdmin],
  [/^\/search$/, renderSearch],
];

const main = document.getElementById('main');
let lastPath = null;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

function render() {
  const { path, query } = parseHash();
  renderNav(path);
  renderWho();
  const samePage = path === lastPath;
  const scroll = window.scrollY;
  for (const [re, view] of routes) {
    const m = path.match(re);
    if (m) {
      view(main, m.slice(1), query);
      if (samePage) window.scrollTo(0, scroll); else { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
      lastPath = path;
      document.getElementById('searchInput').value = path === '/search' ? query.get('q') || '' : '';
      return;
    }
  }
  main.innerHTML = '<div class="card empty"><strong>Page not found</strong><a href="#/">Back to the council update</a></div>';
}

function renderNav(path) {
  const { db } = store;
  const overdue = db.actions.filter(isOverdue).length;
  const link = (href, ico, label, extra = '') => {
    const active = href === '#/' ? path === '/' || path.startsWith('/snapshot') : `#${path}`.startsWith(href);
    return `<a class="nav-link ${active ? 'active' : ''}" href="${href}"><span class="ico">${ico}</span>${esc(label)}${extra}</a>`;
  };
  document.getElementById('nav').innerHTML = `
    <div class="nav-label">Council</div>
    ${link('#/', '◆', 'Council Update')}
    ${link('#/actions', '✓', 'Action Items', overdue ? `<span class="badge" title="Overdue">${overdue}</span>` : '')}
    ${link('#/notes', '✎', 'Meeting Notes')}
    ${link('#/wins', '★', 'Wins & Stories')}
    ${link('#/comms', '✉', 'Comms')}
    <div class="nav-label">Workstreams</div>
    ${store.workstreams().map((w) => `<a class="nav-link ${path === `/ws/${w.id}` ? 'active' : ''}" href="#/ws/${w.id}"><span class="nav-dot" style="background:${wsColor(w.id)}"></span>${esc(w.name)}</a>`).join('')}
    ${store.hasRole('admin') ? `<div class="nav-label">Settings</div>${link('#/admin', '⚙', 'Admin')}` : ''}`;
}

function renderWho() {
  const user = store.me();
  const el = document.getElementById('whoami');
  const roles = user ? [...(user.roles || []).map((r) => ROLES[r]), ...store.workstreams().filter((w) => (w.leadIds || []).includes(user.id)).map((w) => `${w.name} lead`)] : [];
  el.innerHTML = `
    ${user ? `<span class="roles">${esc(roles.join(' · ') || 'Council member')}</span>` : '<span class="roles">Viewing read-only</span>'}
    <select id="userSelect" aria-label="Signed in as">
      <option value="">Choose who you are…</option>
      ${store.members().map((m) => `<option value="${m.id}" ${user?.id === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
    </select>`;
  el.querySelector('select').addEventListener('change', (e) => {
    store.setUser(e.target.value);
    toast(e.target.value ? `Signed in as ${store.memberName(e.target.value)}` : 'Viewing read-only');
  });
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  location.hash = `#/search?q=${encodeURIComponent(q)}`;
});
document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('nav').addEventListener('click', () => document.getElementById('sidebar').classList.remove('open'));

window.addEventListener('hashchange', render);
store.onChange(render);

store.load().then(render).catch((err) => {
  main.innerHTML = `<div class="card empty"><strong>Could not load the hub</strong>${esc(err.message)}</div>`;
});
