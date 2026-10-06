// Administration: workstreams, members, leaders, and roles.
import * as store from '../store.js';
import { esc, pill, wsColor } from '../util.js';
import { openModal, input, select, textarea } from '../ui.js';
import { ROLES } from '../permissions.js';

let tab = 'workstreams';

export function renderAdmin(main) {
  if (!store.hasRole('admin')) { main.innerHTML = '<div class="card empty"><strong>Administrators only</strong>Ask a hub administrator to change workstreams, members, or permissions.</div>'; return; }
  const all = store.workstreams({ all: true });
  const people = [...store.db.members].sort((a, b) => a.name.localeCompare(b.name));

  main.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Settings</div><h1>Admin</h1>
      <p>Manage workstreams, leaders, members, and roles. Roles control who can build council snapshots (council lead), approve them (leadership), and draft/approve comms (Comms team). Workstream leaders can submit their stream's updates.</p></div>
      <button class="btn primary" id="addBtn">${tab === 'workstreams' ? '+ Add workstream' : '+ Add member'}</button></div>
    <div class="tabs"><button data-tab="workstreams" class="${tab === 'workstreams' ? 'active' : ''}">Workstreams (${all.length})</button><button data-tab="members" class="${tab === 'members' ? 'active' : ''}">Members (${people.length})</button></div>
    ${tab === 'workstreams' ? `<div class="card pad-0"><div class="table-wrap"><table class="data">
      <thead><tr><th>#</th><th>Workstream</th><th>Mission</th><th>Leaders</th><th>Members</th><th>Status</th><th></th></tr></thead>
      <tbody>${all.map((w) => `<tr><td>${w.order || ''}</td><td><span class="nav-dot" style="display:inline-block;background:${wsColor(w.id)};margin-left:0"></span><strong>${esc(w.name)}</strong></td>
        <td class="small">${esc(w.mission)}</td><td class="small">${(w.leadIds || []).map((id) => esc(store.memberName(id))).join(', ')}</td>
        <td>${(w.memberIds || []).length}</td><td>${w.active === false ? pill('Inactive', '') : pill('Active', 'green')}</td>
        <td><button class="btn sm" data-ws="${w.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`
    : `<div class="card pad-0"><div class="table-wrap"><table class="data">
      <thead><tr><th>Name</th><th>Region</th><th>Primary workstream</th><th>Roles</th><th>Status</th><th></th></tr></thead>
      <tbody>${people.map((m) => `<tr><td><strong>${esc(m.name)}</strong>${m.note ? `<div class="small muted">${esc(m.note)}</div>` : ''}</td><td>${esc(m.region || '')}</td>
        <td class="small">${m.primaryWorkstreamId ? esc(store.wsName(m.primaryWorkstreamId)) : '—'}</td>
        <td class="small">${[...(m.roles || []).map((r) => ROLES[r]), ...all.filter((w) => (w.leadIds || []).includes(m.id)).map((w) => `${w.name} lead`)].map(esc).join(', ') || 'Member'}</td>
        <td>${m.active === false ? pill('Inactive', '') : pill('Active', 'green')}</td><td><button class="btn sm" data-member="${m.id}">Edit</button></td></tr>`).join('')}</tbody></table></div></div>`}`;

  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; renderAdmin(main); }));
  main.querySelector('#addBtn').addEventListener('click', () => (tab === 'workstreams' ? editWorkstream() : editMember()));
  main.querySelectorAll('[data-ws]').forEach((b) => b.addEventListener('click', () => editWorkstream(store.ws(b.dataset.ws))));
  main.querySelectorAll('[data-member]').forEach((b) => b.addEventListener('click', () => editMember(store.member(b.dataset.member))));
}

const peopleChecklist = (name, selected) => `<div class="checklist">${[...store.db.members].filter((m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name))
  .map((m) => `<label><input type="checkbox" data-group name="${name}" value="${m.id}" ${selected.includes(m.id) ? 'checked' : ''}><span>${esc(m.name)} <span class="small muted">${esc(m.region || '')}</span></span></label>`).join('')}</div>`;

function editWorkstream(w = {}) {
  const isNew = !w.id;
  openModal({
    title: isNew ? 'Add workstream' : `Edit ${w.name}`, wide: true,
    body: `<div class="form">
      <div class="three">${input('name', 'Name', w.name, { required: true })}${input('order', 'Display order', w.order || store.db.workstreams.length + 1, { type: 'number' })}
        ${select('active', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive (hidden)' }], String(w.active !== false))}</div>
      ${input('short', 'Tagline', w.short)}
      ${input('mission', 'Mission', w.mission, { required: true })}
      ${textarea('scope', 'Scope', w.scope)}
      ${input('bestFit', 'Best fit', w.bestFit)}
      <div class="two">
        <div class="field"><label>Leaders</label>${peopleChecklist('leadIds', w.leadIds || [])}</div>
        <div class="field"><label>Members</label>${peopleChecklist('memberIds', w.memberIds || [])}</div>
      </div></div>`,
    onSubmit: (d) => {
      const memberIds = [...new Set([...d.memberIds, ...d.leadIds])];
      return store.save('workstreams', { ...(isNew ? {} : { id: w.id }), ...d, order: Number(d.order) || 99, active: d.active === 'true', memberIds });
    },
  });
}

function editMember(m = {}) {
  const isNew = !m.id;
  openModal({
    title: isNew ? 'Add member' : `Edit ${m.name}`,
    body: `<div class="form">
      <div class="two">${input('name', 'Name', m.name, { required: true })}${input('region', 'Region', m.region, { placeholder: 'U.S., EMEA, India, ANZ…' })}</div>
      <div class="two">${select('primaryWorkstreamId', 'Primary workstream', store.workstreams().map((w) => ({ value: w.id, label: w.name })), m.primaryWorkstreamId, { blank: 'None (e.g. sponsor)' })}
        ${select('active', 'Status', [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }], String(m.active !== false))}</div>
      <div class="field"><label>Roles <span class="hint">everyone is a council member; workstream leaders are set on the workstream</span></label>
        <div class="checklist">${Object.entries(ROLES).map(([k, v]) => `<label><input type="checkbox" data-group name="roles" value="${k}" ${(m.roles || []).includes(k) ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</div></div>
    </div>`,
    onSubmit: async (d) => {
      const saved = await store.save('members', { ...(isNew ? {} : { id: m.id }), ...d, active: d.active === 'true' });
      const w = d.primaryWorkstreamId && store.ws(d.primaryWorkstreamId);
      if (w && !(w.memberIds || []).includes(saved.id)) await store.save('workstreams', { id: w.id, memberIds: [...(w.memberIds || []), saved.id] }, { quiet: true });
    },
  });
}
