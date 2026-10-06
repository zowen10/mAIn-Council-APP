// Two-week council snapshot: read view, review workflow, and roll-up editor.
import * as store from '../store.js';
import { esc, pill, bullets, fmtRange, fmtDate, todayISO, addDays, toLines, HEALTH, hasItems, wsColor, plural } from '../util.js';
import { input, select, textarea, bulletsField, confirmDialog, toast } from '../ui.js';
import { buildSnapshotDraft } from '../rollup.js';
import { commentsThread, bindComments, signInHint } from './shared.js';

const STEPS = ['Draft', 'In Review', 'Approved'];
export const stepper = (status) => `<div class="steps">${STEPS.map((s, i) => {
  const idx = STEPS.indexOf(status);
  return `${i ? '<i>→</i>' : ''}<span class="${i < idx ? 'done' : i === idx ? 'now' : ''}">${s}</span>`;
}).join('')}</div>`;

/** Hero + executive sections for a snapshot. Used on the landing page and the snapshot page. */
export function snapshotBody(s, { heroLabel = 'Two-week executive update', heroButtons = '' } = {}) {
  const highlights = (s.highlights || []).filter((h) => store.ws(h.workstreamId));
  return `
  <section class="hero">
    <div class="hero-grid">
      <div>
        <div class="eyebrow">${esc(heroLabel)}</div>
        <h1 style="margin-top:6px">${esc(s.title || `Council update — ${fmtDate(s.periodEnd)}`)}</h1>
        <div class="meta">Reporting period ${fmtRange(s.periodStart, s.periodEnd)}${s.status === 'Approved' ? ` · Approved ${s.approvedAt ? fmtDate(s.approvedAt.slice(0, 10)) : ''}${s.approvedBy || s.approvedByName ? ` by ${esc(s.approvedByName || store.memberName(s.approvedBy))}` : ''}` : ` · ${esc(s.status)}`}</div>
      </div>
      <div>${pill(s.overallStatus || 'On Track')}</div>
    </div>
    <div class="takeaway">${esc(s.takeaway || '')}</div>
    ${heroButtons ? `<div class="actions-row no-print">${heroButtons}</div>` : ''}
  </section>

  <div class="grid g2 section" style="margin-top:18px">
    <div class="card top-accent"><h3>Key accomplishments</h3>${bullets(s.accomplishments, 'No accomplishments recorded')}</div>
    <div class="card top-accent"><h3>Next activities before the next update</h3>${bullets(s.nextActivities, 'None recorded')}</div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Workstream highlights</h2></div>
    <div class="grid g3">${highlights.map((h) => {
      const w = store.ws(h.workstreamId);
      return `<div class="card ws-card" style="border-top:4px solid ${wsColor(w.id)}">
        <div class="ws-name"><a href="#/ws/${w.id}">${esc(w.name)}</a>${pill(h.status)}</div>
        <p class="${h.status === 'No update' ? 'muted' : ''}">${esc(h.summary || '')}</p></div>`;
    }).join('')}</div>
  </div>

  <div class="section">
    <div class="section-head"><h2>Leadership attention</h2></div>
    <div class="grid g3">
      <div class="panel ${hasItems(s.decisions) ? 'attention' : ''}"><header>Decisions needed</header><div>${bullets(s.decisions, 'None this period')}</div></div>
      <div class="panel ${hasItems(s.risks) ? 'risk' : ''}"><header>Risks or blockers</header><div>${bullets(s.risks, 'None this period')}</div></div>
      <div class="panel ${hasItems(s.help) ? 'help' : ''}"><header>Help or leadership support needed</header><div>${bullets(s.help, 'None this period')}</div></div>
    </div>
  </div>`;
}

export function renderSnapshot(main, id) {
  const s = store.db.snapshots.find((x) => x.id === id);
  if (!s) { main.innerHTML = '<div class="card empty"><strong>Snapshot not found</strong><a href="#/">Back</a></div>'; return; }
  const canEdit = store.canDo('edit', 'snapshots', s);
  const canApprove = s.status !== 'Approved' && store.canDo('edit', 'snapshots', s, { ...s, status: 'Approved' });
  const sources = store.db.updates.filter((u) => (s.sourceUpdateIds || []).includes(u.id));
  const emails = store.db.comms.filter((c) => c.snapshotId === s.id);
  const isCurrent = store.currentSnapshot()?.id === s.id;

  const buttons = [
    canEdit ? `<a class="btn ghost" href="#/snapshot/${s.id}/edit">Edit</a>` : '',
    canEdit && s.status === 'Draft' ? '<button class="btn ghost" data-status="In Review">Submit for leadership review</button>' : '',
    canApprove ? '<button class="btn accent" data-status="Approved">Approve &amp; publish</button>' : '',
    s.status === 'Approved' && store.canDo('create', 'comms') ? `<a class="btn accent" href="#/comms/new?snapshot=${s.id}">Generate email draft</a>` : '',
    '<button class="btn ghost" onclick="window.print()">Print / PDF</button>',
  ].join('');

  main.innerHTML = `
    <div class="page-head no-print"><div><a href="#/" class="small">← Council update</a></div>${stepper(s.status)}</div>
    ${s.status !== 'Approved' && /\[Edit this/.test(s.takeaway || '') ? '<div class="callout warn" style="margin-bottom:14px"><strong>Heads up:</strong> the executive takeaway is still the auto-generated placeholder. Edit it before approval.</div>' : ''}
    ${s.status !== 'Approved' ? '<div class="callout warn" style="margin-bottom:14px">This snapshot is not yet approved. The landing page keeps showing the last approved update until leadership approves this one.</div>' : ''}
    ${snapshotBody(s, { heroLabel: isCurrent ? 'Current two-week executive update' : s.status === 'Approved' ? 'Historical snapshot (read-only)' : 'Draft snapshot', heroButtons: buttons })}
    <div class="grid g2 section">
      <div class="card"><h3>Source workstream updates</h3>
        ${sources.length ? `<div class="list">${sources.map((u) => `<a class="list-item" style="padding:8px 0" href="#/ws/${u.workstreamId}?update=${u.id}"><div><div class="title">${esc(store.wsName(u.workstreamId))}</div><div class="small muted">${fmtRange(u.periodStart, u.periodEnd)} · ${esc(u.status)}</div></div></a>`).join('')}</div>` : '<p class="muted small">No linked updates.</p>'}
        ${emails.length ? `<h3 style="margin-top:16px">Emails generated from this snapshot</h3><div class="list">${emails.map((c) => `<a class="list-item" style="padding:8px 0" href="#/comms/${c.id}"><div style="flex:1"><div class="title">${esc(c.subject)}</div></div>${pill(c.status)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="card"><h3>Review comments</h3>${commentsThread('snapshot', s.id, { placeholder: 'Leave feedback for the council lead…', empty: 'No review comments.' })}</div>
    </div>`;

  bindComments(main);
  main.querySelectorAll('[data-status]').forEach((b) => b.addEventListener('click', async () => {
    const status = b.dataset.status;
    if (status === 'Approved' && !(await confirmDialog('Approving publishes this snapshot as the current council update and locks it as a permanent historical record.', { title: 'Approve & publish?', confirmLabel: 'Approve & publish' }))) return;
    const patch = { id: s.id, status };
    if (status === 'Approved') Object.assign(patch, { approvedBy: store.me().id, approvedByName: store.me().name, approvedAt: new Date().toISOString() });
    if (status === 'In Review') patch.submittedAt = new Date().toISOString();
    await store.save('snapshots', patch, { message: status === 'Approved' ? 'Published as the current council update' : 'Sent for leadership review' });
  }));
}

export function renderSnapshotEditor(main, id) {
  const existing = id ? store.db.snapshots.find((x) => x.id === id) : null;
  if (!store.canDo(existing ? 'edit' : 'create', 'snapshots', existing || {})) {
    main.innerHTML = `<div class="page-head"><div><a href="#/" class="small">← Council update</a><h1 style="margin-top:6px">Council snapshot</h1></div></div>
      ${signInHint() || `<div class="card empty"><strong>${existing?.status === 'Approved' ? 'Approved snapshots are locked' : 'Only the council lead or leadership can build council snapshots'}</strong>${existing?.status === 'Approved' ? 'Create a new snapshot to supersede it — history is preserved.' : ''}</div>`}`;
    return;
  }
  const last = store.currentSnapshot();
  const start = existing?.periodStart || (last ? addDays(last.periodEnd, 1) : addDays(todayISO(), -13));
  const end = existing?.periodEnd || addDays(start, 13);
  let s = existing || { ...buildSnapshotDraft(store.db, start, end), status: 'Draft' };

  const draw = () => {
    const streams = store.workstreams();
    const hl = (wid) => (s.highlights || []).find((h) => h.workstreamId === wid) || { status: 'No update', summary: '' };
    main.innerHTML = `
      <div class="page-head"><div><a href="#/" class="small">← Council update</a><h1 style="margin-top:6px">${existing ? 'Edit council snapshot' : 'New two-week council snapshot'}</h1>
        <p>Pick the reporting period and roll up submitted workstream updates. Edit the result into an executive-ready summary, then send it for leadership approval.</p></div>${stepper(s.status || 'Draft')}</div>
      <form id="snapForm" class="stack">
        <div class="card">
          <div class="form">
            <div class="three">
              ${input('periodStart', 'Period start', s.periodStart, { type: 'date', required: true })}
              ${input('periodEnd', 'Period end', s.periodEnd, { type: 'date', required: true })}
              <div class="field"><label>&nbsp;</label><button type="button" class="btn" id="rollup" style="width:100%;justify-content:center">↻ Roll up updates for this period</button></div>
            </div>
            <p class="small muted" style="margin:0">${rollupSummary(s)}</p>
          </div>
        </div>
        <div class="card"><div class="form">
          ${input('title', 'Title', s.title || `Council update — ${fmtDate(s.periodEnd)}`, { required: true })}
          <div class="two">${select('overallStatus', 'Overall status', HEALTH, s.overallStatus)}<div></div></div>
          ${textarea('takeaway', 'Executive takeaway', s.takeaway, { hint: 'one or two sentences leadership should remember' })}
        </div></div>
        <div class="card"><div class="form">
          <div class="two">${bulletsField('accomplishments', 'Key accomplishments', s.accomplishments)}${bulletsField('nextActivities', 'Next activities before the next update', s.nextActivities)}</div>
          <div class="three">${bulletsField('decisions', 'Decisions needed', s.decisions)}${bulletsField('risks', 'Risks or blockers', s.risks)}${bulletsField('help', 'Help needed', s.help)}</div>
        </div></div>
        <div class="card"><h3>Workstream highlights</h3><div class="form" style="margin-top:12px">
          ${streams.map((w) => `<div class="row" style="align-items:flex-start">
            <div style="width:190px;padding-top:30px;font-weight:800;color:var(--ink)"><span class="nav-dot" style="display:inline-block;background:${wsColor(w.id)};margin-left:0"></span>${esc(w.name)}</div>
            <div style="width:150px">${select(`hl_status_${w.id}`, 'Status', [...HEALTH, 'No update'], hl(w.id).status)}</div>
            <div style="flex:1;min-width:240px">${input(`hl_summary_${w.id}`, 'Highlight', hl(w.id).summary)}</div></div>`).join('')}
        </div></div>
        <div class="row">
          <button type="submit" class="btn primary" name="go" value="Draft">Save draft</button>
          <button type="submit" class="btn" name="go" value="In Review">Save &amp; submit for review</button>
          <span class="spacer"></span><a class="btn link" href="${existing ? `#/snapshot/${existing.id}` : '#/'}">Cancel</a>
          ${existing && store.canDo('delete', 'snapshots', existing) ? '<button type="button" class="btn danger" id="delSnap">Delete draft</button>' : ''}
        </div>
      </form>`;

    const form = main.querySelector('#snapForm');
    main.querySelector('#rollup').addEventListener('click', async () => {
      const ps = form.periodStart.value; const pe = form.periodEnd.value;
      if (!ps || !pe || ps > pe) return toast('Choose a valid period', true);
      if ((existing || form.dataset.dirty) && !(await confirmDialog('Replace the content below with a fresh roll-up of updates for this period?', { confirmLabel: 'Roll up' }))) return;
      s = { ...s, ...buildSnapshotDraft(store.db, ps, pe), title: `Council update — ${fmtDate(pe)}` };
      draw();
      toast('Rolled up submitted workstream updates');
    });
    form.addEventListener('input', () => { form.dataset.dirty = '1'; });
    main.querySelector('#delSnap')?.addEventListener('click', async () => {
      if (await confirmDialog('Delete this draft snapshot?', { confirmLabel: 'Delete' })) { await store.remove('snapshots', existing.id); location.hash = '#/'; }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const status = e.submitter?.value || 'Draft';
      const rec = {
        ...(existing ? { id: existing.id } : {}),
        title: f.title.value.trim(), periodStart: f.periodStart.value, periodEnd: f.periodEnd.value,
        overallStatus: f.overallStatus.value, takeaway: f.takeaway.value.trim(),
        accomplishments: toLines(f.accomplishments.value), nextActivities: toLines(f.nextActivities.value),
        decisions: toLines(f.decisions.value), risks: toLines(f.risks.value), help: toLines(f.help.value),
        highlights: streams.map((w) => ({ workstreamId: w.id, status: f[`hl_status_${w.id}`].value, summary: f[`hl_summary_${w.id}`].value.trim() })),
        sourceUpdateIds: s.sourceUpdateIds || [], status,
        ...(status === 'In Review' ? { submittedAt: new Date().toISOString() } : {}),
      };
      if (!rec.periodStart || !rec.periodEnd) return toast('Choose the reporting period', true);
      const saved = await store.save('snapshots', rec, { message: status === 'In Review' ? 'Submitted for leadership review' : 'Draft saved' });
      location.hash = `#/snapshot/${saved.id}`;
    });
  };
  draw();
}

function rollupSummary(s) {
  const n = (s.sourceUpdateIds || []).length;
  const reported = (s.highlights || []).filter((h) => h.status !== 'No update').length;
  return `${plural(n, 'submitted update')} included from ${reported} of ${store.workstreams().length} workstreams. Workstream updates still in Draft are not rolled up.`;
}

