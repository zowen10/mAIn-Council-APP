// Workstream page — same layout for every workstream so updates consolidate cleanly.
import * as store from '../store.js';
import { esc, pill, fmtRange, todayISO, addDays, toLines, HEALTH, isOpen, ago, wsColor, hasItems, bullets } from '../util.js';
import { openModal, input, select, bulletsField, confirmDialog, toast } from '../ui.js';
import { actionTable, bindActionTable, openActionForm, commentsThread, bindComments, updatePanels, signInHint } from './shared.js';

const LINK_KINDS = ['Reference', 'Prompt / skill', 'Playbook', 'Dashboard', 'Teams channel', 'Training', 'Other'];

export function renderWorkstream(main, id, query) {
  const w = store.ws(id);
  if (!w) { main.innerHTML = '<div class="card empty"><strong>Workstream not found</strong></div>'; return; }
  const { db } = store;
  const user = store.me();
  const isLead = (w.leadIds || []).includes(user?.id);
  const canUpdate = store.canDo('create', 'updates', { workstreamId: w.id });
  const updates = db.updates.filter((u) => u.workstreamId === w.id).sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '') || b.updatedAt.localeCompare(a.updatedAt));
  const requested = query?.get('update') && updates.find((u) => u.id === query.get('update'));
  const current = requested || store.latestUpdate(w.id);
  const drafts = updates.filter((u) => u.status === 'Draft' && u !== current);
  const leads = (w.leadIds || []).map(store.member).filter(Boolean);
  const others = (w.memberIds || []).filter((m) => !(w.leadIds || []).includes(m)).map(store.member).filter(Boolean);
  const actions = db.actions.filter((a) => a.workstreamId === w.id);
  const openActions = actions.filter(isOpen);
  const links = db.links.filter((l) => l.workstreamId === w.id);

  main.innerHTML = `
    <section class="hero" style="padding:24px 28px">
      <div class="hero-grid">
        <div>
          <div class="eyebrow">Workstream ${String(w.order || '').padStart(2, '0')}</div>
          <h1 style="margin-top:6px">${esc(w.name)}</h1>
          <div class="takeaway" style="margin-top:10px;font-size:17px"><strong>${esc(w.mission)}</strong> ${esc(w.scope || '')}</div>
          ${w.bestFit ? `<div class="meta" style="margin-top:10px">Best fit: ${esc(w.bestFit)}</div>` : ''}
        </div>
        <div class="no-print" style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
          ${canUpdate ? '<button class="btn accent" id="newUpdate">+ Submit weekly update</button>' : ''}
          ${user ? '<button class="btn ghost" id="newAction">+ Add action</button>' : ''}
        </div>
      </div>
    </section>
    ${signInHint()}

    <div class="split section" style="margin-top:20px">
      <div class="stack">
        ${drafts.length && (isLead || canUpdate) ? `<div class="callout warn">${drafts.map((d) => `Draft update for ${fmtRange(d.periodStart, d.periodEnd)} is not submitted yet. <button class="btn link" data-edit-update="${d.id}">Continue editing →</button>`).join('<br>')}</div>` : ''}
        <div class="card" style="border-top:4px solid ${wsColor(w.id)}">
          ${current ? `
            <div class="row" style="justify-content:space-between">
              <div><div class="eyebrow">${requested && requested !== store.latestUpdate(w.id) ? 'Historical update' : 'Current update'}</div>
                <h2 style="margin-top:4px">${fmtRange(current.periodStart, current.periodEnd)}</h2></div>
              <div class="row">${pill(current.health)} ${pill(current.status)}</div>
            </div>
            ${current.takeaway ? `<p style="font-size:16px;color:var(--ink);font-weight:600;margin:12px 0">${esc(current.takeaway)}</p>` : ''}
            <div style="margin-top:12px">${updatePanels(current, { missionFallback: w.mission })}</div>
            ${hasItems(current.links) ? `<div style="margin-top:12px"><strong class="small">Links &amp; attachments</strong>${bullets(current.links)}</div>` : ''}
            <div class="row small muted" style="margin-top:12px">
              <span>${current.importedFrom ? esc(current.importedFrom) : `By ${esc(store.memberName(current.createdBy))}`} · updated ${ago(current.updatedAt)}</span>
              <span class="spacer"></span>
              ${store.canDo('edit', 'updates', current) ? `<button class="btn sm" data-edit-update="${current.id}">Edit</button>` : ''}
              ${current.status === 'Submitted' && store.canDo('edit', 'updates', current, { ...current, status: 'Approved' }) ? `<button class="btn sm primary" data-approve="${current.id}">Mark reviewed by council</button>` : ''}
              ${current.id ? `<button class="btn sm" data-action-from="${current.id}">+ Action from this update</button>` : ''}
            </div>`
          : `<div class="empty"><strong>No update yet</strong>${canUpdate ? 'Use “Submit weekly update” — it takes about five minutes.' : 'The workstream leads will post the first update here.'}</div>`}
        </div>

        <div>
          <div class="section-head"><h2>Workstream action items <span class="count">${openActions.length} open</span></h2><a class="btn sm" href="#/actions?ws=${w.id}">View in tracker →</a></div>
          <div class="card pad-0">${actionTable(openActions, { showWorkstream: false })}</div>
        </div>

        <div>
          <div class="section-head"><h2>Collaboration &amp; discussion</h2></div>
          <div class="card">${commentsThread('workstream', w.id, { placeholder: 'Share an idea, question, or quick update with the workstream…', empty: 'No discussion yet — start the conversation.' })}</div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <h3>Leaders</h3>
          <div class="chips" style="margin-top:8px">${leads.map((m) => `<span class="chip lead">${esc(m.name)} <small>${esc(m.region || '')}</small></span>`).join('') || '<span class="muted small">Not assigned</span>'}</div>
          <h3 style="margin-top:16px">Members <span class="count">${others.length}</span></h3>
          <div class="chips" style="margin-top:8px">${others.map((m) => `<span class="chip">${esc(m.name)} <small>${esc(m.region || '')}</small></span>`).join('') || '<span class="muted small">No members yet</span>'}</div>
        </div>

        <div class="card">
          <div class="row" style="justify-content:space-between"><h3>Useful links &amp; assets</h3>${user ? '<button class="btn sm" id="addLink">+ Add</button>' : ''}</div>
          ${links.length ? `<div class="list" style="margin-top:6px">${links.map((l) => `
            <div class="list-item" style="padding:8px 0"><div style="flex:1;min-width:0"><a href="${esc(l.url)}" target="_blank" rel="noopener" style="font-weight:700">${esc(l.title)}</a>
              <div class="small muted">${esc(l.kind || '')}${l.description ? ` · ${esc(l.description)}` : ''}</div></div>
              ${store.canDo('delete', 'links', l) ? `<button class="btn link small" data-del-link="${l.id}" aria-label="Remove link">✕</button>` : ''}</div>`).join('')}</div>`
          : '<p class="small muted">Add prompts, playbooks, dashboards, Teams channels, and reference material.</p>'}
        </div>

        <div class="card">
          <h3>Update history</h3>
          ${updates.length ? `<div class="timeline" style="margin-top:10px">${updates.map((u) => `
            <div class="tl-item ${u === current ? 'current' : ''}"><a href="#/ws/${w.id}?update=${u.id}" style="font-weight:700">${fmtRange(u.periodStart, u.periodEnd)}</a>
              <div class="small row" style="gap:6px;margin-top:2px">${pill(u.health)} ${pill(u.status)}</div></div>`).join('')}</div>` : '<p class="small muted">No updates yet.</p>'}
        </div>
      </div>
    </div>`;

  bindActionTable(main);
  bindComments(main);
  main.querySelector('#newUpdate')?.addEventListener('click', () => openUpdateForm(w));
  main.querySelector('#newAction')?.addEventListener('click', () => openActionForm({ workstreamId: w.id }));
  main.querySelectorAll('[data-edit-update]').forEach((b) => b.addEventListener('click', () => openUpdateForm(w, db.updates.find((u) => u.id === b.dataset.editUpdate))));
  main.querySelectorAll('[data-approve]').forEach((b) => b.addEventListener('click', () => store.save('updates', { id: b.dataset.approve, status: 'Approved' }, { message: 'Marked as reviewed' })));
  main.querySelectorAll('[data-action-from]').forEach((b) => b.addEventListener('click', () => {
    const u = db.updates.find((x) => x.id === b.dataset.actionFrom);
    openActionForm({ workstreamId: w.id, source: `${w.name} update ${fmtRange(u.periodStart, u.periodEnd)}`, sourceType: 'update', sourceId: u.id });
  }));
  main.querySelector('#addLink')?.addEventListener('click', () => openModal({
    title: 'Add a link or asset',
    body: `<div class="form">${input('title', 'Title', '', { required: true })}${input('url', 'URL', '', { required: true, type: 'url', placeholder: 'https://…' })}
      <div class="two">${select('kind', 'Type', LINK_KINDS, 'Reference')}${input('description', 'Short description')}</div></div>`,
    onSubmit: (data) => store.save('links', { ...data, workstreamId: w.id }, { message: 'Link added' }),
  }));
  main.querySelectorAll('[data-del-link]').forEach((b) => b.addEventListener('click', async () => {
    if (await confirmDialog('Remove this link?', { confirmLabel: 'Remove' })) store.remove('links', b.dataset.delLink, 'Link removed');
  }));
}

/** The short, structured weekly update form. */
export function openUpdateForm(w, rec) {
  const isNew = !rec;
  const prev = store.latestUpdate(w.id);
  const u = rec || {
    periodStart: addDays(todayISO(), -6), periodEnd: todayISO(), health: prev?.health || 'On Track',
    mission: prev?.mission?.length ? prev.mission : [w.mission],
  };
  const plannedLastTime = isNew && prev && hasItems(prev.nextSteps) ? `<div class="callout small"><strong>Last time you planned:</strong> ${prev.nextSteps.map(esc).join(' · ')}</div>` : '';
  openModal({
    title: `${w.name} — ${isNew ? 'weekly update' : `update ${fmtRange(u.periodStart, u.periodEnd)}`}`,
    wide: true,
    body: `<div class="form">
      <div class="three">
        ${input('periodStart', 'Period start', u.periodStart, { type: 'date', required: true })}
        ${input('periodEnd', 'Period end', u.periodEnd, { type: 'date', required: true })}
        ${select('health', 'Status', HEALTH, u.health)}
      </div>
      ${input('takeaway', 'Takeaway', u.takeaway, { hint: 'one sentence for the council snapshot', placeholder: 'e.g. Prompt library v1 is live with 40 vetted prompts; need a decision on ownership.' })}
      ${plannedLastTime}
      <div class="two">
        ${bulletsField('progress', 'Progress this week', u.progress, { hint: 'what moved forward' })}
        ${bulletsField('nextSteps', 'Upcoming next steps', u.nextSteps, { hint: 'before the next update' })}
      </div>
      <div class="three">
        ${bulletsField('decisions', 'Decisions needed', u.decisions, { hint: 'leadership input', placeholder: 'Leave blank if none' })}
        ${bulletsField('risks', 'Risks or blockers', u.risks, { placeholder: 'Leave blank if none' })}
        ${bulletsField('help', 'Help needed', u.help, { hint: 'cross-functional', placeholder: 'Leave blank if none' })}
      </div>
      <div class="two">
        ${bulletsField('mission', 'Mission reminder', u.mission, { hint: 'what this stream owns' })}
        ${bulletsField('links', 'Links & attachments', u.links, { hint: 'one URL per line (SharePoint, Teams, Confluence…)' })}
      </div>
      <p class="small muted" style="margin:0">One bullet per line. Save a draft any time; submit when it is ready for the council roll-up.</p>
    </div>`,
    submitLabel: 'Submit for council review',
    extraButtons: `<button type="submit" class="btn" name="go" value="Draft">Save draft</button>
      ${!isNew && store.canDo('delete', 'updates', rec) ? '<button type="button" class="btn danger" data-del>Delete</button>' : ''}`,
    onSubmit: async (data, _form, submitter) => {
      const status = submitter?.value === 'Draft' ? 'Draft' : (rec?.status === 'Approved' ? 'Approved' : 'Submitted');
      if (data.periodStart > data.periodEnd) { toast('Period start must be before the end', true); return false; }
      const body = {
        ...(isNew ? { workstreamId: w.id } : { id: rec.id }),
        periodStart: data.periodStart, periodEnd: data.periodEnd, health: data.health, takeaway: data.takeaway,
        progress: toLines(data.progress), nextSteps: toLines(data.nextSteps), decisions: toLines(data.decisions),
        risks: toLines(data.risks), help: toLines(data.help), mission: toLines(data.mission), links: toLines(data.links), status,
        ...(status === 'Submitted' && rec?.status !== 'Submitted' ? { submittedAt: new Date().toISOString() } : {}),
      };
      await store.save('updates', body, { message: status === 'Draft' ? 'Draft saved' : 'Update submitted for the council roll-up' });
    },
    onMount: (el, close) => el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmDialog('Delete this update?', { confirmLabel: 'Delete' })) store.remove('updates', rec.id);
    }),
  });
}

