// Comms workspace: approved snapshot -> selected content -> generated email draft -> edit -> review -> publish.
import * as store from '../store.js';
import { esc, pill, fmtRange, fmtDate, todayISO, addDays, toLines, COMMS_STATUS, ago } from '../util.js';
import { toast, confirmDialog, openModal, input } from '../ui.js';
import { generateEmail, AUDIENCES, DEFAULT_CTAS } from '../email.js';
import { commentsThread, bindComments, signInHint, upcomingActivities } from './shared.js';

let statusFilter = '';

export function renderComms(main) {
  const drafts = store.db.comms
    .filter((c) => !statusFilter || c.status === statusFilter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const canCreate = store.canDo('create', 'comms');
  const current = store.currentSnapshot();

  main.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Communications</div><h1>Comms workspace</h1>
        <p>Turn an approved council update into a first-draft email — for the workstream leads and leadership, or the company-wide update. Edit, review, and keep the final version linked to the snapshot it came from. The hub drafts; you send.</p></div>
      ${canCreate ? '<a class="btn primary" href="#/comms/new">+ New email draft</a>' : ''}
    </div>
    ${signInHint()}
    ${canCreate && current ? `<div class="card top-accent" style="margin-bottom:18px"><div class="row">
      <div style="flex:1"><div class="eyebrow">Ready to communicate</div><h3 style="margin-top:4px">${esc(current.title)}</h3><div class="small muted">${fmtRange(current.periodStart, current.periodEnd)} · approved</div></div>
      <a class="btn accent" href="#/comms/new?snapshot=${current.id}&audience=company">✉ Company-wide draft</a>
      <a class="btn" href="#/comms/new?snapshot=${current.id}&audience=leads">✉ Leads &amp; leadership draft</a></div></div>` : ''}
    <div class="filters">
      <select id="st" aria-label="Status"><option value="">All statuses</option>${COMMS_STATUS.map((s) => `<option ${s === statusFilter ? 'selected' : ''}>${s}</option>`).join('')}</select>
    </div>
    <div class="card pad-0">${drafts.length ? `<div class="table-wrap"><table class="data">
      <thead><tr><th>Subject</th><th>Audience</th><th>Source update</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody>${drafts.map((c) => {
        const s = store.db.snapshots.find((x) => x.id === c.snapshotId);
        return `<tr><td><a class="act-title" href="#/comms/${c.id}">${esc(c.subject || '(no subject)')}</a></td><td class="small">${esc(AUDIENCES[c.audience] || c.audience)}</td>
          <td class="small">${s ? `<a href="#/snapshot/${s.id}">${esc(s.title)}</a>` : '—'}</td><td>${pill(c.status)}</td><td class="small muted">${ago(c.updatedAt)} · ${esc(store.memberName(c.updatedBy || c.createdBy))}</td></tr>`;
      }).join('')}</tbody></table></div>` : '<div class="empty"><strong>No email drafts yet</strong>Generate one from the current council update.</div>'}</div>`;

  main.querySelector('#st').addEventListener('change', (e) => { statusFilter = e.target.value; renderComms(main); });
}

export function renderCommsEditor(main, id, query) {
  const existing = id ? store.db.comms.find((c) => c.id === id) : null;
  if (id && !existing) { main.innerHTML = '<div class="card empty"><strong>Draft not found</strong><a href="#/comms">Back to Comms</a></div>'; return; }
  const canEdit = existing ? store.canDo('edit', 'comms', existing) : store.canDo('create', 'comms');
  const snapshots = store.approvedSnapshots();
  if (!existing && !canEdit) {
    main.innerHTML = `<div class="page-head"><div><a class="small" href="#/comms">← Comms</a><h1>New email draft</h1></div></div>${signInHint() || '<div class="card empty"><strong>Only the Comms team and council lead can create email drafts</strong></div>'}`;
    return;
  }
  if (!existing && !snapshots.length) {
    main.innerHTML = '<div class="card empty"><strong>No approved council update yet</strong>Email drafts are generated from an approved two-week snapshot.</div>';
    return;
  }

  const qp = query || new URLSearchParams();
  let state = existing ? { ...existing } : {
    snapshotId: qp.get('snapshot') || snapshots[0].id,
    audience: qp.get('audience') || 'company',
    status: 'Draft', subject: '', body: '',
  };
  let include = existing?.include || null;
  let tab = 'edit';

  const defaultsFor = (snap) => {
    const since = addDays(snap.periodStart, -30);
    return {
      accomplishments: [...(snap.accomplishments || [])],
      highlights: (snap.highlights || []).filter((h) => h.status !== 'No update').map((h) => h.workstreamId),
      wins: store.db.wins.filter((w) => w.featured || (w.date >= since && w.date <= addDays(snap.periodEnd, 14))).map((w) => w.id),
      activities: upcomingActivities().slice(0, 4).map((a) => a.id),
      metrics: [],
      ctas: DEFAULT_CTAS.slice(0, 3),
    };
  };

  const draw = () => {
    const snap = store.db.snapshots.find((s) => s.id === state.snapshotId);
    include ||= defaultsFor(snap);
    const ro = !canEdit;
    const checked = (arr, v) => (arr.includes(v) ? 'checked' : '');
    const box = (name, value, label, on, sub = '') => `<label><input type="checkbox" data-group name="${name}" value="${esc(value)}" ${on} ${ro ? 'disabled' : ''}><span>${esc(label)}${sub ? `<br><span class="small muted">${esc(sub)}</span>` : ''}</span></label>`;
    const wins = [...store.db.wins].sort((a, b) => (b.featured - a.featured) || (b.date || '').localeCompare(a.date || ''));
    const acts = upcomingActivities();
    const customCtas = include.ctas.filter((c) => !DEFAULT_CTAS.includes(c));
    const statusIdx = COMMS_STATUS.indexOf(state.status);

    main.innerHTML = `
      <div class="page-head">
        <div><a class="small" href="#/comms">← Comms workspace</a><h1 style="margin-top:6px">${existing ? esc(state.subject || 'Email draft') : 'New email draft'}</h1>
          <p>${existing ? `Created ${ago(existing.createdAt)} by ${esc(store.memberName(existing.createdBy))} · last edited ${ago(existing.updatedAt)} by ${esc(store.memberName(existing.updatedBy || existing.createdBy))}` : 'Choose what to include, generate a first draft, then make it sound like you.'}</p></div>
        <div class="steps">${COMMS_STATUS.slice(0, 4).map((s, i) => `${i ? '<i>→</i>' : ''}<span class="${i < statusIdx ? 'done' : i === statusIdx ? 'now' : ''}">${s}</span>`).join('')}${state.status === 'Archived' ? '<i>·</i><span class="now">Archived</span>' : ''}</div>
      </div>
      ${signInHint()}
      <form id="commsForm">
      <div class="split" style="grid-template-columns:minmax(0,380px) minmax(0,1fr)">
        <div class="stack">
          <div class="card"><h3>1. Source &amp; audience</h3><div class="form" style="margin-top:10px">
            <div class="field"><label for="f_snapshotId">Council update</label><select id="f_snapshotId" name="snapshotId" ${ro || existing ? 'disabled' : ''}>
              ${snapshots.map((s) => `<option value="${s.id}" ${s.id === state.snapshotId ? 'selected' : ''}>${esc(s.title)} (${fmtRange(s.periodStart, s.periodEnd)})</option>`).join('')}</select></div>
            <div class="field"><label for="f_audience">Audience</label><select id="f_audience" name="audience" ${ro ? 'disabled' : ''}>
              ${Object.entries(AUDIENCES).map(([k, v]) => `<option value="${k}" ${k === state.audience ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          </div></div>
          <div class="card"><h3>2. Content to include</h3>
            <div class="form" style="margin-top:10px">
              <div class="field"><label>Accomplishments</label><div class="checklist">${(snap.accomplishments || []).map((a) => box('accomplishments', a, a, checked(include.accomplishments, a))).join('') || '<span class="small muted">None in this snapshot</span>'}</div></div>
              <div class="field"><label>Workstream highlights</label><div class="checklist">${(snap.highlights || []).filter((h) => store.ws(h.workstreamId)).map((h) => box('highlights', h.workstreamId, store.wsName(h.workstreamId), checked(include.highlights, h.workstreamId), h.summary)).join('')}</div></div>
              <div class="field"><label>Success stories &amp; wins</label><div class="checklist">${wins.map((w) => box('wins', w.id, `${w.featured ? '★ ' : ''}${w.title}`, checked(include.wins, w.id), `${w.category || ''} · ${fmtDate(w.date)}`)).join('') || '<span class="small muted">No wins logged</span>'}</div></div>
              <div class="field"><label>Upcoming activities</label><div class="checklist">${acts.map((a) => box('activities', a.id, a.title, checked(include.activities, a.id), a.date ? fmtDate(a.date) : a.timeframe || 'Date TBC')).join('') || '<span class="small muted">Nothing scheduled</span>'}</div></div>
              <div class="field"><label for="f_metrics">Metrics <span class="hint">one per line</span></label><textarea id="f_metrics" name="metrics" ${ro ? 'disabled' : ''} placeholder="e.g. 1,200 weekly active Glean users (+8%)">${esc(include.metrics.join('\n'))}</textarea></div>
              <div class="field"><label>Calls to action</label><div class="checklist">${DEFAULT_CTAS.map((c) => box('ctas', c, c, checked(include.ctas, c))).join('')}</div>
                <textarea name="customCtas" style="margin-top:8px" ${ro ? 'disabled' : ''} placeholder="Add your own calls to action, one per line">${esc(customCtas.join('\n'))}</textarea></div>
              ${canEdit ? `<button type="button" class="btn accent" id="generate" style="justify-content:center">✨ ${state.body ? 'Regenerate draft' : 'Generate first draft'}</button>` : ''}
            </div>
          </div>
        </div>

        <div class="stack">
          <div class="card">
            <div class="row" style="justify-content:space-between"><h3>3. Draft</h3>
              <div class="row">${state.body ? '<button type="button" class="btn sm" id="copy">Copy text</button><button type="button" class="btn sm" id="mailto">Open in email app</button>' : ''}</div></div>
            ${state.body || state.subject ? `
              <div class="tabs" style="margin-top:10px"><button type="button" data-tab="edit" class="${tab === 'edit' ? 'active' : ''}">Edit</button><button type="button" data-tab="preview" class="${tab === 'preview' ? 'active' : ''}">Preview</button></div>
              ${tab === 'edit' ? `<div class="form">
                <div class="field"><label for="f_subject">Subject</label><input id="f_subject" name="subject" value="${esc(state.subject)}" ${ro ? 'disabled' : ''}></div>
                <div class="field"><label for="f_body">Body</label><textarea id="f_body" name="body" class="tall" style="min-height:520px" ${ro ? 'disabled' : ''}>${esc(state.body)}</textarea></div>
              </div>` : `<div class="email-preview"><div class="subj">${esc(state.subject)}</div>${esc(state.body)}</div>`}`
            : '<div class="empty"><strong>No draft yet</strong>Pick your content on the left and generate a first draft.</div>'}
          </div>

          ${canEdit && (state.body || state.subject) ? `<div class="row">
            <button type="submit" class="btn primary">${existing ? 'Save changes' : 'Save draft'}</button>
            ${existing ? statusButtons(existing) : ''}
            <span class="spacer"></span>
            ${existing && store.canDo('delete', 'comms', existing) ? '<button type="button" class="btn danger" id="delDraft">Delete</button>' : ''}
          </div>` : ''}

          ${existing ? `<div class="card"><h3>Review comments</h3>${commentsThread('comms', existing.id, { placeholder: 'Suggest an edit or approve…', empty: 'No review comments yet.' })}
            ${existing.status === 'Published' ? `<p class="small" style="margin-top:12px"><strong>Published</strong> ${fmtDate(existing.publishedDate)}${existing.publishedLink ? ` · <a href="${esc(existing.publishedLink)}" target="_blank" rel="noopener">View</a>` : ''}</p>` : ''}</div>` : ''}
        </div>
      </div></form>`;

    bind(snap);
  };

  // Capture in-progress edits before a redraw so nothing typed is lost.
  const capture = () => {
    const form = main.querySelector('#commsForm');
    if (!form) return;
    const el = form.elements;
    if (el.audience && !el.audience.disabled) state.audience = el.audience.value;
    if (el.snapshotId && !el.snapshotId.disabled) state.snapshotId = el.snapshotId.value;
    if (el.subject && !el.subject.disabled) state.subject = el.subject.value;
    if (el.body && !el.body.disabled) state.body = el.body.value;
    if (!canEdit) return;
    const group = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
    include = {
      accomplishments: group('accomplishments'), highlights: group('highlights'), wins: group('wins'), activities: group('activities'),
      metrics: toLines(el.metrics.value), ctas: [...group('ctas'), ...toLines(el.customCtas.value)],
    };
  };

  const bind = (snap) => {
    const form = main.querySelector('#commsForm');
    bindComments(main);
    form.querySelector('#f_snapshotId')?.addEventListener('change', (e) => { capture(); state.snapshotId = e.target.value; include = null; draw(); });
    form.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { capture(); tab = b.dataset.tab; draw(); }));
    form.querySelector('#generate')?.addEventListener('click', async () => {
      capture();
      if (state.body && !(await confirmDialog('Replace the current draft text with a freshly generated version?', { confirmLabel: 'Regenerate' }))) return;
      const { subject, body } = generateEmail({ snapshot: snap, audience: state.audience, db: store.db, include });
      Object.assign(state, { subject, body });
      tab = 'edit';
      draw();
      toast('First draft generated — edit away');
    });
    form.querySelector('#copy')?.addEventListener('click', async () => {
      capture();
      try { await navigator.clipboard.writeText(`Subject: ${state.subject}\n\n${state.body}`); toast('Copied to clipboard'); } catch { toast('Copy failed — select the text manually', true); }
    });
    form.querySelector('#mailto')?.addEventListener('click', () => {
      capture();
      location.href = `mailto:?subject=${encodeURIComponent(state.subject)}&body=${encodeURIComponent(state.body.slice(0, 1800))}`;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      capture();
      const rec = { ...(existing ? { id: existing.id } : {}), snapshotId: state.snapshotId, audience: state.audience, subject: state.subject, body: state.body, include, status: state.status || 'Draft' };
      const saved = await store.save('comms', rec, { message: existing ? 'Saved' : 'Draft saved' });
      if (!existing) location.hash = `#/comms/${saved.id}`;
    });
    form.querySelectorAll('[data-to]').forEach((b) => b.addEventListener('click', () => {
      capture();
      const to = b.dataset.to;
      const base = { id: existing.id, subject: state.subject, body: state.body, include, status: to };
      if (to !== 'Published') return store.save('comms', base, { message: `Marked ${to}` });
      openModal({
        title: 'Mark as published',
        body: `<div class="form">${input('publishedDate', 'Sent / published on', todayISO(), { type: 'date', required: true })}${input('publishedLink', 'Link to the published email or newsletter', '', { type: 'url', placeholder: 'Optional' })}</div>`,
        submitLabel: 'Mark published',
        onSubmit: (data) => store.save('comms', { ...base, ...data }, { message: 'Marked published' }),
      });
    }));
    form.querySelector('#delDraft')?.addEventListener('click', async () => {
      if (await confirmDialog('Delete this email draft?', { confirmLabel: 'Delete' })) { await store.remove('comms', existing.id); location.hash = '#/comms'; }
    });
  };

  draw();
}

function statusButtons(c) {
  const next = { Draft: ['In Review'], 'In Review': ['Approved', 'Draft'], Approved: ['Published', 'In Review'], Published: ['Archived'], Archived: ['Draft'] }[c.status] || [];
  const label = { 'In Review': 'Send for review', Approved: 'Approve', Published: 'Mark published…', Archived: 'Archive', Draft: 'Back to draft' };
  return next.filter((to) => store.canDo('edit', 'comms', c, { ...c, status: to }))
    .map((to) => `<button type="button" class="btn ${to === 'Approved' || to === 'Published' ? 'accent' : ''}" data-to="${to}">${label[to]}</button>`).join('');
}

