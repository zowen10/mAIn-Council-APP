// Search across updates, snapshots, actions, notes, wins, comms, and discussion.
import * as store from '../store.js';
import { esc, fmtRange, fmtDate, pill } from '../util.js';

const text = (o, keys) => keys.map((k) => (Array.isArray(o[k]) ? o[k].map((x) => (typeof x === 'object' ? Object.values(x).join(' ') : x)).join(' ') : o[k] || '')).join(' ').toLowerCase();

export function renderSearch(main, _params, query) {
  const q = (query.get('q') || '').trim();
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (s) => terms.length && terms.every((t) => s.includes(t));
  const { db } = store;

  const groups = [
    ['Workstream updates', db.updates.filter((u) => match(text(u, ['takeaway', 'progress', 'nextSteps', 'decisions', 'risks', 'help', 'mission']) + store.wsName(u.workstreamId).toLowerCase()))
      .map((u) => ({ href: `#/ws/${u.workstreamId}?update=${u.id}`, title: `${store.wsName(u.workstreamId)} — ${fmtRange(u.periodStart, u.periodEnd)}`, sub: u.takeaway, badge: pill(u.status) }))],
    ['Council snapshots', db.snapshots.filter((s) => match(text(s, ['title', 'takeaway', 'accomplishments', 'decisions', 'risks', 'help', 'nextActivities', 'highlights'])))
      .map((s) => ({ href: `#/snapshot/${s.id}`, title: s.title, sub: s.takeaway, badge: pill(s.status) }))],
    ['Action items', db.actions.filter((a) => match(text(a, ['action', 'owner', 'notes', 'source'])))
      .map((a) => ({ href: '#/actions', title: a.action, sub: `${a.owner || 'Unassigned'} · ${a.workstreamId ? store.wsName(a.workstreamId) : 'Council'}`, badge: pill(a.status) }))],
    ['Meeting notes', db.notes.filter((n) => match(text(n, ['title', 'type', 'participants', 'notes', 'decisions'])))
      .map((n) => ({ href: `#/notes?open=${n.id}`, title: n.title || n.type, sub: fmtDate(n.date), badge: '' }))],
    ['Wins & stories', db.wins.filter((w) => match(text(w, ['title', 'summary', 'impact', 'people', 'source'])))
      .map((w) => ({ href: '#/wins', title: w.title, sub: w.impact, badge: `<span class="tag">${esc(w.category || 'Win')}</span>` }))],
    ['Email drafts', db.comms.filter((c) => match(text(c, ['subject', 'body'])))
      .map((c) => ({ href: `#/comms/${c.id}`, title: c.subject, sub: '', badge: pill(c.status) }))],
    ['Documents', (db.files || []).filter((f) => match(text(f, ['name', 'description'])))
      .map((f) => ({ href: f.targetType === 'commsDraft' ? `#/comms/${f.targetId}` : '#/comms', title: f.name, sub: f.description || store.memberName(f.createdBy), badge: '' }))],
    ['Discussion', db.comments.filter((c) => match((c.text || '').toLowerCase()))
      .map((c) => ({ href: c.targetType === 'workstream' ? `#/ws/${c.targetId}` : c.targetType === 'snapshot' ? `#/snapshot/${c.targetId}` : `#/comms/${c.targetId}`, title: c.text.slice(0, 120), sub: store.memberName(c.createdBy), badge: '' }))],
  ].filter(([, items]) => items.length);

  const total = groups.reduce((n, [, items]) => n + items.length, 0);
  main.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Search</div><h1>${q ? `Results for “${esc(q)}”` : 'Search the hub'}</h1><p>${q ? `${total} result${total === 1 ? '' : 's'}` : 'Type in the search box above.'}</p></div></div>
    ${groups.map(([name, items]) => `<div class="section"><div class="section-head"><h2>${esc(name)} <span class="count">${items.length}</span></h2></div>
      <div class="card pad-0"><div class="list">${items.slice(0, 25).map((r) => `<a class="list-item" href="${r.href}"><div style="flex:1;min-width:0"><div class="title">${esc(r.title)}</div>${r.sub ? `<div class="small muted">${esc(r.sub)}</div>` : ''}</div>${r.badge}</a>`).join('')}</div></div></div>`).join('')}
    ${q && !total ? '<div class="card empty"><strong>No matches</strong>Try fewer or different words.</div>' : ''}`;
}
