// Components reused across several pages.
import * as store from '../store.js';
import { esc, linkify, pill, fmtDate, isOverdue, ago, initials, ACTION_STATUS, PRIORITY, monthShort, dayNum, bullets, hasItems } from '../util.js';
import { openModal, input, textarea, select, datalist, confirmDialog, toast } from '../ui.js';

export const signInHint = () => (store.me() ? '' : '<div class="callout no-print">You are viewing read-only. Choose your name at the top right to add or edit content.</div>');

export const wsOptions = () => store.workstreams().map((w) => ({ value: w.id, label: w.name }));

export function dateBox(iso, fallback = 'TBC') {
  if (!iso) return `<div class="date-box tbd"><div class="m">Date</div><div class="d">${esc(fallback)}</div></div>`;
  return `<div class="date-box"><div class="m">${monthShort(iso)}</div><div class="d">${dayNum(iso)}</div></div>`;
}

// ---------------- action items ----------------
export function actionTable(actions, { showWorkstream = true, compact = false } = {}) {
  if (!actions.length) return '<div class="empty"><strong>No actions here</strong>Nothing matches — nice and tidy.</div>';
  return `<div class="table-wrap"><table class="data actions-table">
    <thead><tr><th>Action</th><th>Owner</th>${showWorkstream ? '<th>Workstream</th>' : ''}<th>Priority</th><th>Status</th><th>Due</th>${compact ? '' : '<th>Updated</th>'}</tr></thead>
    <tbody>${actions.map((a) => {
      const overdue = isOverdue(a);
      const cls = overdue ? 'overdue' : a.status === 'Blocked' ? 'blocked' : ['Complete', 'Deferred'].includes(a.status) ? 'done' : '';
      const editable = store.canDo('edit', 'actions', a);
      return `<tr class="${cls}" data-action-id="${a.id}">
        <td><a href="javascript:void 0" class="act-title" data-open-action="${a.id}">${esc(a.action)}</a>
          ${!compact && (a.notes || a.source) ? `<div class="small muted">${a.source ? `From: ${esc(a.source)}` : ''}${a.source && a.notes ? ' · ' : ''}${a.notes ? esc(a.notes.slice(0, 140)) : ''}</div>` : ''}</td>
        <td>${esc(a.owner || '—')}</td>
        ${showWorkstream ? `<td class="small">${esc(a.workstreamId ? store.wsName(a.workstreamId) : 'Council')}</td>` : ''}
        <td>${pill(a.priority)}</td>
        <td>${editable ? `<select class="inline" data-status-for="${a.id}" aria-label="Status">${ACTION_STATUS.map((s) => `<option ${s === a.status ? 'selected' : ''}>${s}</option>`).join('')}</select>` : pill(a.status)}</td>
        <td class="${overdue ? 'due-overdue' : ''}" style="white-space:nowrap">${a.dueDate ? fmtDate(a.dueDate) : '<span class="muted">—</span>'}${overdue ? '<div class="small">Overdue</div>' : ''}</td>
        ${compact ? '' : `<td class="small muted" style="white-space:nowrap">${ago(a.updatedAt)}</td>`}
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

export function bindActionTable(root) {
  root.querySelectorAll('[data-open-action]').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    openActionForm(store.db.actions.find((a) => a.id === el.dataset.openAction));
  }));
  root.querySelectorAll('[data-status-for]').forEach((el) => el.addEventListener('change', () => {
    const a = store.db.actions.find((x) => x.id === el.dataset.statusFor);
    store.save('actions', { id: a.id, status: el.value }, { message: `Marked ${el.value}` });
  }));
}

/** Open the create/edit form. Pass defaults (no id) to prefill a new action, e.g. from a meeting note. */
export function openActionForm(rec = {}) {
  const isNew = !rec.id;
  if (!store.me()) return toast('Choose who you are (top right) before making changes.', true);
  const owners = [...store.members().map((m) => m.name), ...store.workstreams().map((w) => w.name), 'All workstream leads'];
  const canDelete = !isNew && store.canDo('delete', 'actions', rec);
  openModal({
    title: isNew ? 'New action item' : 'Edit action item',
    body: `<div class="form">
      ${input('action', 'Action', rec.action, { required: true, placeholder: 'Start with a verb — e.g. “Publish the prompt library v1”' })}
      <div class="two">
        ${input('owner', 'Owner', rec.owner || (isNew ? store.me()?.name : ''), { list: 'ownerList', hint: 'one accountable person or team' })}
        ${select('workstreamId', 'Workstream', wsOptions(), rec.workstreamId, { blank: 'Council-wide' })}
      </div>
      <div class="three">
        ${select('priority', 'Priority', PRIORITY, rec.priority || 'Medium')}
        ${select('status', 'Status', ACTION_STATUS, rec.status || 'Not Started')}
        ${input('dueDate', 'Due date', rec.dueDate, { type: 'date' })}
      </div>
      ${input('source', 'Source', rec.source, { placeholder: 'Meeting, update, decision…' })}
      ${textarea('notes', 'Notes', rec.notes, { placeholder: 'Context, dependencies, or latest update' })}
      ${datalist('ownerList', owners)}
      ${!isNew ? `<p class="small muted">Created ${ago(rec.createdAt)} by ${esc(store.memberName(rec.createdBy))} · last updated ${ago(rec.updatedAt)} by ${esc(store.memberName(rec.updatedBy || rec.createdBy))}</p>` : ''}
    </div>`,
    submitLabel: isNew ? 'Add action' : 'Save',
    extraButtons: canDelete ? '<button type="button" class="btn danger" data-del>Delete</button>' : '',
    onSubmit: (data) => store.save('actions', { ...(isNew ? { sourceType: rec.sourceType, sourceId: rec.sourceId } : { id: rec.id }), ...data }, { message: isNew ? 'Action added' : 'Action updated' }),
    onMount: (el, close) => el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmDialog('Delete this action? Completed actions are usually better marked Complete to keep the history.', { confirmLabel: 'Delete' })) store.remove('actions', rec.id);
    }),
  });
}

// ---------------- discussion threads ----------------
export function commentsThread(targetType, targetId, { placeholder = 'Add a note, idea, or question…', empty = 'No discussion yet.' } = {}) {
  const list = store.commentsFor(targetType, targetId); // newest first
  return `<div class="thread" data-thread="${targetType}:${targetId}">
    ${store.me() ? `<form class="row comment-form" style="margin-bottom:6px;align-items:flex-start">
      <textarea name="text" class="field" style="flex:1;min-height:44px;padding:8px 10px;border-radius:9px;border:1px solid var(--line-strong)" placeholder="${esc(placeholder)}"></textarea>
      <button class="btn primary sm">Post</button></form>` : ''}
    ${list.length ? list.map((c) => `<div class="comment">
      <div class="avatar">${esc(initials(store.memberName(c.createdBy)))}</div>
      <div style="flex:1"><div class="row"><span class="who">${esc(store.memberName(c.createdBy))}</span><span class="small muted" title="${esc(new Date(c.createdAt).toLocaleString())}">${ago(c.createdAt)}</span>
        ${store.canDo('delete', 'comments', c) ? `<button class="btn link small" data-del-comment="${c.id}">Delete</button>` : ''}</div>
        <div class="body">${linkify(c.text)}</div></div></div>`).join('') : `<p class="muted small">${esc(empty)}</p>`}
  </div>`;
}

export function bindComments(root) {
  root.querySelectorAll('.thread').forEach((t) => {
    const [targetType, targetId] = t.dataset.thread.split(':');
    t.querySelector('.comment-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = e.target.text.value.trim();
      if (text) store.save('comments', { targetType, targetId, text }, { message: 'Posted' });
    });
    t.querySelectorAll('[data-del-comment]').forEach((b) => b.addEventListener('click', () => store.remove('comments', b.dataset.delComment)));
  });
}

// ---------------- upcoming activities ----------------
export function openActivityForm(rec = {}) {
  const isNew = !rec.id;
  openModal({
    title: isNew ? 'Add upcoming activity' : 'Edit activity',
    body: `<div class="form">
      ${input('title', 'Activity or milestone', rec.title, { required: true })}
      <div class="three">
        ${select('type', 'Type', ['Milestone', 'Event', 'Communication', 'Review'], rec.type || 'Milestone')}
        ${input('date', 'Date', rec.date, { type: 'date' })}
        ${input('timeframe', 'Or timeframe', rec.timeframe, { placeholder: 'e.g. Q4 2026, Monthly' })}
      </div>
      <div class="three">
        ${select('workstreamId', 'Workstream', wsOptions(), rec.workstreamId, { blank: 'Council-wide' })}
        ${input('owner', 'Owner', rec.owner)}
        ${select('status', 'Status', ['Planned', 'Done'], rec.status || 'Planned')}
      </div>
    </div>`,
    extraButtons: !isNew && store.canDo('delete', 'activities', rec) ? '<button type="button" class="btn danger" data-del>Delete</button>' : '',
    onSubmit: (data) => store.save('activities', { ...(isNew ? {} : { id: rec.id }), ...data }),
    onMount: (el, close) => el.querySelector('[data-del]')?.addEventListener('click', () => { close(); store.remove('activities', rec.id); }),
  });
}

export function activityList(items, { editable = false } = {}) {
  if (!items.length) return '<div class="empty"><strong>Nothing scheduled</strong>Add milestones, events, and communications.</div>';
  return `<div class="list">${items.map((a) => `
    <div class="list-item">${dateBox(a.date)}
      <div style="flex:1"><div class="title">${esc(a.title)}</div>
        <div class="small muted">${[...new Set([a.type, a.timeframe, a.workstreamId ? store.wsName(a.workstreamId) : 'Council', a.owner].filter(Boolean))].map(esc).join(' · ')}</div></div>
      ${editable && store.canDo('edit', 'activities', a) ? `<button class="btn link small" data-edit-activity="${a.id}">Edit</button>` : ''}
    </div>`).join('')}</div>`;
}

export function bindActivities(root) {
  root.querySelectorAll('[data-edit-activity]').forEach((b) => b.addEventListener('click', () => openActivityForm(store.db.activities.find((a) => a.id === b.dataset.editActivity))));
}

export const upcomingActivities = () => store.db.activities
  .filter((a) => a.status !== 'Done')
  .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));

// ---------------- workstream update (slide-style six panels) ----------------
export function updatePanels(u, { missionFallback } = {}) {
  const mission = hasItems(u.mission) ? u.mission : missionFallback ? [missionFallback] : [];
  const p = (n, title, items, cls = '') => `<div class="panel ${cls}"><header><span class="n">${n}.</span> ${title}</header><div>${bullets(items)}</div></div>`;
  return `<div class="grid g2">
    ${p(1, 'Mission reminder', mission)}
    ${p(2, 'Progress this period', u.progress)}
    ${p(3, 'Upcoming next steps', u.nextSteps)}
    ${p(4, 'Decisions needed', u.decisions, hasItems(u.decisions) ? 'attention' : '')}
    ${p(5, 'Risks or blockers', u.risks, hasItems(u.risks) ? 'risk' : '')}
    ${p(6, 'Help needed', u.help, hasItems(u.help) ? 'help' : '')}
  </div>`;
}

// ---------------- documents (any file type) ----------------
const KIND = [
  [/\.(docx?|dotx?|rtf|odt)$/i, 'DOC', 'word'], [/\.(pptx?|potx?|ppsx?|odp)$/i, 'PPT', 'ppt'],
  [/\.(xlsx?|xlsm|xltx|csv|tsv|ods)$/i, 'XLS', 'xls'], [/\.pdf$/i, 'PDF', 'pdf'],
  [/\.(png|jpe?g|gif|svg|webp|bmp|heic)$/i, 'IMG', 'img'], [/\.(mp4|mov|avi|webm|mp3|wav|m4a)$/i, 'MEDIA', 'media'],
  [/\.(msg|eml)$/i, 'MAIL', 'mail'], [/\.(zip|7z|rar|gz)$/i, 'ZIP', ''],
];
const kindOf = (name) => KIND.find(([re]) => re.test(name)) || [null, (name.split('.').pop() || 'FILE').slice(0, 4).toUpperCase(), ''];
export const fmtSize = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Upload area + list of documents attached to a target (e.g. the Comms library or one email draft). */
export function filesPanel(targetType, targetId, { empty = 'No documents yet.' } = {}) {
  const files = store.filesFor(targetType, targetId);
  return `<div class="files" data-files="${targetType}:${targetId}">
    ${store.me() ? `<label class="dropzone no-print">
      <input type="file" multiple hidden>
      <strong>Drop files here or click to upload</strong>
      <span class="small muted">Word, PowerPoint, Excel, PDF, images, email — any document type</span>
    </label>` : ''}
    ${files.length ? `<div class="list">${files.map((f) => {
      const [, label, cls] = kindOf(f.name);
      const canEdit = store.canDo('edit', 'files', f);
      return `<div class="list-item file-row">
        <span class="file-icon ${cls}">${esc(label)}</span>
        <div style="flex:1;min-width:0">
          <a class="title" href="/api/files/${f.id}/download" style="word-break:break-word">${esc(f.name)}</a>
          <div class="small muted">${fmtSize(f.size || 0)}${f.version > 1 ? ` · version ${f.version}` : ''} · ${esc(store.memberName(f.updatedBy || f.createdBy))} · ${ago(f.updatedAt)}</div>
          ${f.description ? `<div class="small">${esc(f.description)}</div>` : ''}
        </div>
        <div class="row no-print" style="gap:4px">
          <a class="btn sm" href="/api/files/${f.id}/download">Download</a>
          ${canEdit ? `<button type="button" class="btn sm" data-replace-file="${f.id}" title="Upload a new version">Update</button>
            <button type="button" class="btn sm" data-describe-file="${f.id}">Note</button>
            <button type="button" class="btn sm danger" data-del-file="${f.id}" aria-label="Delete ${esc(f.name)}">✕</button>` : ''}
        </div></div>`;
    }).join('')}</div>` : `<p class="small muted" style="margin:10px 0 0">${esc(empty)}</p>`}
  </div>`;
}

async function uploadAll(fileList, opts) {
  const files = [...fileList];
  if (!files.length) return;
  toast(`Uploading ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
  let ok = 0;
  for (const f of files) {
    try { await store.upload(f, opts); ok++; } catch (err) { toast(err.message, true); }
  }
  await store.refresh();
  if (ok) toast(opts.replaceId ? 'New version uploaded' : `${ok} file${ok === 1 ? '' : 's'} uploaded`);
}

export function bindFiles(root) {
  root.querySelectorAll('.files').forEach((panel) => {
    const [targetType, targetId] = panel.dataset.files.split(':');
    const zone = panel.querySelector('.dropzone');
    if (zone) {
      const input = zone.querySelector('input');
      input.addEventListener('change', () => uploadAll(input.files, { targetType, targetId }));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('over'));
      zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); uploadAll(e.dataTransfer.files, { targetType, targetId }); });
    }
    panel.querySelectorAll('[data-replace-file]').forEach((b) => b.addEventListener('click', () => {
      const picker = Object.assign(document.createElement('input'), { type: 'file' });
      picker.addEventListener('change', () => uploadAll(picker.files, { replaceId: b.dataset.replaceFile }));
      picker.click();
    }));
    panel.querySelectorAll('[data-describe-file]').forEach((b) => b.addEventListener('click', () => {
      const f = store.db.files.find((x) => x.id === b.dataset.describeFile);
      openModal({
        title: f.name,
        body: `<div class="form">${textarea('description', 'Note', f.description, { placeholder: 'What is this, and how should it be used?' })}</div>`,
        onSubmit: (d) => store.save('files', { id: f.id, description: d.description }),
      });
    }));
    panel.querySelectorAll('[data-del-file]').forEach((b) => b.addEventListener('click', async () => {
      const f = store.db.files.find((x) => x.id === b.dataset.delFile);
      if (await confirmDialog(`Delete “${f.name}”? This cannot be undone.`, { confirmLabel: 'Delete' })) store.remove('files', f.id, 'File deleted');
    }));
  });
}
