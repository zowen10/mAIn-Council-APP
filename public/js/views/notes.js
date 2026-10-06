// Meeting notes, with actions created directly from a note.
import * as store from '../store.js';
import { esc, linkify, fmtDate, todayISO, toLines, bullets, hasItems, plural, pill } from '../util.js';
import { openModal, input, select, textarea, bulletsField, confirmDialog, toast } from '../ui.js';
import { wsOptions, openActionForm, signInHint, dateBox } from './shared.js';

const TYPES = ['Council bi-weekly', 'Workstream weekly', 'Leadership review', 'Working session', 'Other'];
let scope = '';

const actionsFor = (n) => store.db.actions.filter((a) => a.sourceType === 'note' && a.sourceId === n.id);
const noteTitle = (n) => n.title || `${n.type} — ${fmtDate(n.date)}`;

export function renderNotes(main, _params, query) {
  const notes = store.db.notes
    .filter((n) => !scope || (scope === 'council' ? !n.workstreamId : n.workstreamId === scope))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  main.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Council &amp; workstreams</div><h1>Meeting notes</h1>
        <p>Capture what was discussed, what was decided, and who owns what next. Actions created here flow straight into the shared tracker.</p></div>
      ${store.me() ? '<button class="btn primary" id="newNote">+ Add meeting notes</button>' : ''}
    </div>
    ${signInHint()}
    <div class="filters">
      <select id="scope" aria-label="Scope"><option value="">All meetings</option><option value="council" ${scope === 'council' ? 'selected' : ''}>Council-wide</option>
        ${store.workstreams().map((w) => `<option value="${w.id}" ${scope === w.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select>
      <span class="spacer"></span><span class="small muted">${plural(notes.length, 'note')}</span>
    </div>
    ${notes.length ? `<div class="stack">${notes.map((n) => {
      const acts = actionsFor(n);
      return `<div class="card clickable" data-open="${n.id}" style="display:flex;gap:16px">
        ${dateBox(n.date)}
        <div style="flex:1;min-width:0">
          <div class="row"><h3>${esc(noteTitle(n))}</h3><span class="tag">${esc(n.type)}</span><span class="tag">${esc(n.workstreamId ? store.wsName(n.workstreamId) : 'Council')}</span></div>
          <p class="small muted" style="margin:4px 0">${esc(n.participants || '')}</p>
          <p style="margin:6px 0 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(n.notes || '')}</p>
          <div class="row small muted" style="margin-top:8px">${hasItems(n.decisions) ? `<span>${plural(n.decisions.length, 'decision')}</span>` : ''}<span>${plural(acts.length, 'action')}</span></div>
        </div></div>`;
    }).join('')}</div>` : '<div class="card empty"><strong>No meeting notes yet</strong>Add notes after your next council or workstream meeting.</div>'}`;

  main.querySelector('#scope').addEventListener('change', (e) => { scope = e.target.value; renderNotes(main, [], new URLSearchParams()); });
  main.querySelector('#newNote')?.addEventListener('click', () => openNoteForm());
  main.querySelectorAll('[data-open]').forEach((c) => c.addEventListener('click', () => openNote(store.db.notes.find((n) => n.id === c.dataset.open))));

  if (query.get('open') || query.get('new')) {
    history.replaceState(null, '', '#/notes');
    const n = store.db.notes.find((x) => x.id === query.get('open'));
    if (n) openNote(n); else if (store.me()) openNoteForm();
  }
}

function openNote(n) {
  const acts = actionsFor(n);
  const canEdit = store.canDo('edit', 'notes', n);
  openModal({
    title: noteTitle(n), wide: true, cancelLabel: 'Close',
    body: `<div class="stack">
      <div class="row small muted"><span>${fmtDate(n.date)}</span>·<span>${esc(n.type)}</span>·<span>${esc(n.workstreamId ? store.wsName(n.workstreamId) : 'Council-wide')}</span>·<span>Notes by ${esc(store.memberName(n.createdBy))}</span></div>
      ${n.participants ? `<div><strong class="small">Participants</strong><div>${esc(n.participants)}</div></div>` : ''}
      <div><strong class="small">Notes</strong><div style="white-space:pre-wrap">${linkify(n.notes || '')}</div></div>
      <div class="panel ${hasItems(n.decisions) ? 'attention' : ''}"><header>Decisions</header><div>${bullets(n.decisions, 'No decisions recorded')}</div></div>
      ${hasItems(n.links) ? `<div><strong class="small">Attachments &amp; links</strong>${bullets(n.links)}</div>` : ''}
      <div><div class="row" style="justify-content:space-between"><strong class="small">Actions from this meeting</strong>${store.me() ? '<button type="button" class="btn sm" data-new-action>+ Create action</button>' : ''}</div>
        ${acts.length ? `<div class="list">${acts.map((a) => `<div class="list-item" style="padding:6px 0"><div style="flex:1"><strong>${esc(a.action)}</strong> <span class="small muted">— ${esc(a.owner || 'unassigned')}</span></div>${pill(a.status)}</div>`).join('')}</div>` : '<p class="small muted">No actions yet.</p>'}
      </div></div>`,
    extraButtons: canEdit ? '<button type="button" class="btn" data-edit>Edit</button><button type="button" class="btn danger" data-del>Delete</button>' : '',
    onMount: (el, close) => {
      el.querySelector('[data-new-action]')?.addEventListener('click', () => {
        close();
        openActionForm({ workstreamId: n.workstreamId || '', source: `Meeting: ${noteTitle(n)}`, sourceType: 'note', sourceId: n.id });
      });
      el.querySelector('[data-edit]')?.addEventListener('click', () => { close(); openNoteForm(n); });
      el.querySelector('[data-del]')?.addEventListener('click', async () => {
        close();
        if (await confirmDialog('Delete these meeting notes? Actions created from them stay in the tracker.', { confirmLabel: 'Delete' })) store.remove('notes', n.id);
      });
    },
  });
}

function openNoteForm(n = {}) {
  const isNew = !n.id;
  openModal({
    title: isNew ? 'Add meeting notes' : 'Edit meeting notes', wide: true,
    body: `<div class="form">
      <div class="three">
        ${input('date', 'Meeting date', n.date || todayISO(), { type: 'date', required: true })}
        ${select('type', 'Meeting type', TYPES, n.type || 'Council bi-weekly')}
        ${select('workstreamId', 'Scope', wsOptions(), n.workstreamId, { blank: 'Council-wide' })}
      </div>
      ${input('title', 'Title', n.title, { placeholder: 'Optional — defaults to type and date' })}
      ${input('participants', 'Participants', n.participants, { placeholder: 'Names, comma separated' })}
      ${textarea('notes', 'Notes', n.notes, { rows: 6, placeholder: 'Key discussion points' })}
      <div class="two">
        ${bulletsField('decisions', 'Decisions', n.decisions)}
        ${bulletsField('links', 'Attachments & links', n.links, { hint: 'one URL per line' })}
      </div>
      ${isNew ? textarea('newActions', 'Actions to create', '', { hint: 'one per line — add “@Owner” at the end to assign', placeholder: 'Draft the October newsletter @Samantha Owen\nShare prompt library outline @Use Cases & Prompts' }) : ''}
    </div>`,
    submitLabel: isNew ? 'Save notes' : 'Save',
    onSubmit: async (data) => {
      const rec = {
        ...(isNew ? {} : { id: n.id }), date: data.date, type: data.type, workstreamId: data.workstreamId, title: data.title,
        participants: data.participants, notes: data.notes, decisions: toLines(data.decisions), links: toLines(data.links),
      };
      const lines = toLines(data.newActions);
      const saved = await store.save('notes', rec, { quiet: lines.length > 0 });
      for (const line of lines) {
        const m = line.match(/^(.*?)\s*@\s*(.+)$/);
        await store.save('actions', {
          action: m ? m[1] : line, owner: m ? m[2] : '', workstreamId: data.workstreamId, priority: 'Medium', status: 'Not Started',
          source: `Meeting: ${saved.title || `${saved.type} — ${fmtDate(saved.date)}`}`, sourceType: 'note', sourceId: saved.id,
        }, { quiet: true });
      }
      if (lines.length) toast(`Notes saved · ${plural(lines.length, 'action')} added to the tracker`);
    },
  });
}
