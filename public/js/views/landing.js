// Landing page: "What has the mAIn Council done, what is happening now, and what happens next?"
import * as store from '../store.js';
import { esc, pill, fmtDate, fmtRange, isOverdue, isOpen, todayISO, addDays, PRIORITY, ago, plural } from '../util.js';
import { snapshotBody } from './snapshot.js';
import { actionTable, bindActionTable, activityList, bindActivities, openActivityForm, upcomingActivities, signInHint } from './shared.js';

export function renderLanding(main) {
  const { db } = store;
  const current = store.currentSnapshot();
  const since = addDays(todayISO(), -60);
  const open = db.actions.filter(isOpen);
  const overdue = open.filter(isOverdue);
  const blocked = open.filter((a) => a.status === 'Blocked');
  const recentWins = db.wins.filter((w) => (w.date || '') >= since);
  const pending = db.snapshots.filter((s) => s.status !== 'Approved').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const canBuild = store.canDo('create', 'snapshots');

  const heroButtons = current ? [
    `<a class="btn ghost" href="#/snapshot/${current.id}">Open full snapshot</a>`,
    canBuild ? '<a class="btn accent" href="#/snapshot/new">+ Build next two-week update</a>' : '',
    store.canDo('create', 'comms') ? `<a class="btn ghost" href="#/comms/new?snapshot=${current.id}">✉ Draft company email</a>` : '',
  ].join('') : '';

  // Accomplishments from the last ~2 months: wins plus earlier snapshot accomplishments.
  const accomplishments = [
    ...recentWins.map((w) => ({ date: w.date, text: w.title, sub: w.impact, tag: w.category || 'Win', href: '#/wins' })),
    // The current snapshot's accomplishments are already shown above.
    ...store.approvedSnapshots().filter((s) => s.periodEnd >= since && s.id !== current?.id).flatMap((s) => (s.accomplishments || []).map((t) => ({ date: s.periodEnd, text: t, tag: 'Council update', href: `#/snapshot/${s.id}` }))),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

  const prio = (a) => PRIORITY.indexOf(a.priority);
  const topActions = [...open].sort((a, b) => (isOverdue(b) - isOverdue(a)) || ((b.status === 'Blocked') - (a.status === 'Blocked')) || (prio(a) - prio(b)) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 8);
  const notes = [...db.notes].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 4);
  const history = [...store.approvedSnapshots(), ...(canBuild ? pending : [])].sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));

  main.innerHTML = `
    ${signInHint()}
    ${pending.length ? `<div class="callout" style="margin:0 0 14px">${pending.map((s) => `<div class="row"><strong>${esc(s.status)}:</strong> ${esc(s.title)} (${fmtRange(s.periodStart, s.periodEnd)}) <a href="#/snapshot/${s.id}">Review →</a></div>`).join('')}</div>` : ''}

    ${current ? snapshotBody(current, { heroLabel: 'Current two-week executive update', heroButtons }) : `
      <section class="hero"><div class="eyebrow">Two-week executive update</div><h1 style="margin-top:6px">No council update published yet</h1>
        <div class="takeaway">Workstream leads submit their updates, then the council lead rolls them up into a two-week snapshot for leadership approval.</div>
        ${canBuild ? '<div class="actions-row"><a class="btn accent" href="#/snapshot/new">+ Build the first council update</a></div>' : ''}</section>`}

    <div class="kpis">
      <a class="kpi" href="#/actions"><div class="v">${open.length}</div><div class="l">Open actions</div></a>
      <a class="kpi ${overdue.length ? 'warn' : ''}" href="#/actions?due=overdue"><div class="v">${overdue.length}</div><div class="l">Overdue</div></a>
      <a class="kpi ${blocked.length ? 'amber' : ''}" href="#/actions?status=Blocked"><div class="v">${blocked.length}</div><div class="l">Blocked</div></a>
      <a class="kpi" href="#/wins"><div class="v">${recentWins.length}</div><div class="l">Wins in the last 60 days</div></a>
    </div>

    <div class="grid g2 section">
      <div>
        <div class="section-head"><h2>Council accomplishments <span class="count">last 2 months</span></h2><a class="btn sm" href="#/wins">All wins →</a></div>
        <div class="card pad-0">${accomplishments.length ? `<div class="list">${accomplishments.map((a) => `
          <a class="list-item" href="${a.href}">
            <div style="flex:1"><div class="title">${esc(a.text)}</div>${a.sub ? `<div class="small" style="color:var(--accent-ink);font-weight:700">${esc(a.sub)}</div>` : ''}</div>
            <div style="text-align:right;flex-shrink:0"><span class="tag">${esc(a.tag)}</span><div class="small muted" style="margin-top:4px">${fmtDate(a.date, { year: false })}</div></div>
          </a>`).join('')}</div>` : '<div class="empty"><strong>No accomplishments logged yet</strong>Share a win to get started.</div>'}</div>
      </div>
      <div>
        <div class="section-head"><h2>Upcoming activities &amp; milestones</h2>${store.canDo('create', 'activities') ? '<button class="btn sm" id="addActivity">+ Add</button>' : ''}</div>
        <div class="card pad-0">${activityList(upcomingActivities().slice(0, 7), { editable: true })}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-head"><h2>Open action items <span class="count">${open.length}</span></h2><a class="btn sm" href="#/actions">Open the action tracker →</a></div>
      <div class="card pad-0">${actionTable(topActions, { compact: true })}</div>
    </div>

    <div class="grid g2 section">
      <div>
        <div class="section-head"><h2>Recent meeting notes</h2><a class="btn sm" href="#/notes">All notes →</a></div>
        <div class="card pad-0">${notes.length ? `<div class="list">${notes.map((n) => `
          <a class="list-item" href="#/notes?open=${n.id}"><div style="flex:1"><div class="title">${esc(n.title || n.type)}</div>
            <div class="small muted">${fmtDate(n.date)} · ${esc(n.type || 'Meeting')} · ${esc(n.workstreamId ? store.wsName(n.workstreamId) : 'Council')}</div></div>
            <span class="small muted">${plural(db.actions.filter((a) => a.sourceType === 'note' && a.sourceId === n.id).length, 'action')}</span></a>`).join('')}</div>`
          : `<div class="empty"><strong>No meeting notes yet</strong>Capture decisions and actions from your next council or workstream meeting. <div style="margin-top:10px"><a class="btn sm" href="#/notes?new=1">+ Add meeting notes</a></div></div>`}</div>
      </div>
      <div>
        <div class="section-head"><h2>Update history</h2></div>
        <div class="card">${history.length ? `<div class="timeline">${history.map((s) => `
          <div class="tl-item ${s.id === current?.id ? 'current' : ''}">
            <div class="row"><a href="#/snapshot/${s.id}" class="title" style="font-weight:800">${esc(s.title)}</a>${s.status !== 'Approved' ? pill(s.status) : s.id === current?.id ? '<span class="pill dark">Current</span>' : ''}</div>
            <div class="small muted">${fmtRange(s.periodStart, s.periodEnd)} · ${pill(s.overallStatus)} ${s.approvedAt ? `· approved ${ago(s.approvedAt)}` : ''}</div>
          </div>`).join('')}</div>` : '<p class="muted">No snapshots yet.</p>'}</div>
      </div>
    </div>`;

  bindActionTable(main);
  bindActivities(main);
  main.querySelector('#addActivity')?.addEventListener('click', () => openActivityForm());
}
