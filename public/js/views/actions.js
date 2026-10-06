// Shared action-item tracker.
import * as store from '../store.js';
import { esc, isOverdue, isOpen, todayISO, addDays, ACTION_STATUS, PRIORITY, plural } from '../util.js';
import { actionTable, bindActionTable, openActionForm, signInHint } from './shared.js';

let filters = { q: '', owner: '', ws: '', status: 'open', priority: '', due: '' };

export function renderActions(main, _params, query) {
  // Deep links from the landing page KPIs (e.g. #/actions?due=overdue) reset the filters.
  if ([...query.keys()].length) {
    filters = { q: '', owner: '', ws: query.get('ws') || '', status: query.get('status') || 'open', priority: '', due: query.get('due') || '' };
    history.replaceState(null, '', '#/actions');
  }
  const all = store.db.actions;
  const owners = [...new Set(all.map((a) => a.owner).filter(Boolean))].sort();
  const today = todayISO();

  const list = all.filter((a) => {
    if (filters.status === 'open' && !isOpen(a)) return false;
    if (filters.status && filters.status !== 'open' && filters.status !== 'all' && a.status !== filters.status) return false;
    if (filters.owner && a.owner !== filters.owner) return false;
    if (filters.ws && (filters.ws === 'council' ? a.workstreamId : a.workstreamId !== filters.ws)) return false;
    if (filters.priority && a.priority !== filters.priority) return false;
    if (filters.due === 'overdue' && !isOverdue(a)) return false;
    if (filters.due === 'week' && !(a.dueDate && a.dueDate >= today && a.dueDate <= addDays(today, 7))) return false;
    if (filters.due === 'month' && !(a.dueDate && a.dueDate >= today && a.dueDate <= addDays(today, 30))) return false;
    if (filters.due === 'none' && a.dueDate) return false;
    if (filters.q && !`${a.action} ${a.notes} ${a.owner} ${a.source}`.toLowerCase().includes(filters.q.toLowerCase())) return false;
    return true;
  }).sort((a, b) => (isOverdue(b) - isOverdue(a)) || ((b.status === 'Blocked') - (a.status === 'Blocked'))
    || (['Complete', 'Deferred'].includes(a.status) - ['Complete', 'Deferred'].includes(b.status))
    || (PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority)) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));

  const overdue = all.filter(isOverdue).length;
  const blocked = all.filter((a) => a.status === 'Blocked').length;
  const opt = (v, label, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(label)}</option>`;

  main.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Council &amp; workstreams</div><h1>Action items</h1>
        <p>One shared tracker for every council and workstream action. ${plural(all.filter(isOpen).length, 'open action')} · <span style="color:var(--red);font-weight:700">${overdue} overdue</span> · <span style="color:var(--amber);font-weight:700">${blocked} blocked</span></p></div>
      <div class="row"><button class="btn" id="csv">Export CSV</button>${store.me() ? '<button class="btn primary" id="newAction">+ New action</button>' : ''}</div>
    </div>
    ${signInHint()}
    <div class="filters">
      <input type="search" id="fq" placeholder="Filter actions…" value="${esc(filters.q)}" style="min-width:200px">
      <select id="fstatus" aria-label="Status">${opt('open', 'Open (not complete)', filters.status)}${opt('all', 'All statuses', filters.status)}${ACTION_STATUS.map((s) => opt(s, s, filters.status)).join('')}</select>
      <select id="fws" aria-label="Workstream">${opt('', 'All workstreams', filters.ws)}${opt('council', 'Council-wide', filters.ws)}${store.workstreams().map((w) => opt(w.id, w.name, filters.ws)).join('')}</select>
      <select id="fowner" aria-label="Owner">${opt('', 'All owners', filters.owner)}${owners.map((o) => opt(o, o, filters.owner)).join('')}</select>
      <select id="fprio" aria-label="Priority">${opt('', 'Any priority', filters.priority)}${PRIORITY.map((p) => opt(p, p, filters.priority)).join('')}</select>
      <select id="fdue" aria-label="Due">${opt('', 'Any due date', filters.due)}${opt('overdue', 'Overdue', filters.due)}${opt('week', 'Due in 7 days', filters.due)}${opt('month', 'Due in 30 days', filters.due)}${opt('none', 'No due date', filters.due)}</select>
      <span class="spacer"></span><span class="small muted">${plural(list.length, 'action')}</span>
      <button class="btn link small" id="freset">Reset</button>
    </div>
    <div class="card pad-0">${actionTable(list)}</div>
    <p class="small muted">Completed and deferred actions are kept for history — choose “All statuses” to see them.</p>`;

  bindActionTable(main);
  const bind = (id, key, ev = 'change') => main.querySelector(id).addEventListener(ev, (e) => {
    filters[key] = e.target.value;
    renderActions(main, [], new URLSearchParams());
    if (key === 'q') { const el = main.querySelector('#fq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  });
  bind('#fq', 'q', 'input'); bind('#fstatus', 'status'); bind('#fws', 'ws'); bind('#fowner', 'owner'); bind('#fprio', 'priority'); bind('#fdue', 'due');
  main.querySelector('#freset').addEventListener('click', () => { filters = { q: '', owner: '', ws: '', status: 'open', priority: '', due: '' }; renderActions(main, [], new URLSearchParams()); });
  main.querySelector('#newAction')?.addEventListener('click', () => openActionForm({ workstreamId: filters.ws && filters.ws !== 'council' ? filters.ws : '' }));
  main.querySelector('#csv').addEventListener('click', () => downloadCsv(list));
}

function downloadCsv(rows) {
  const cols = ['action', 'owner', 'workstream', 'source', 'priority', 'status', 'dueDate', 'notes', 'updatedAt'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [cols.join(','), ...rows.map((a) => cols.map((c) => cell(c === 'workstream' ? (a.workstreamId ? store.wsName(a.workstreamId) : 'Council') : a[c])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `main-council-actions-${todayISO()}.csv` });
  link.click();
  URL.revokeObjectURL(url);
}
