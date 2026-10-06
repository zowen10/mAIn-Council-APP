// Wins & success stories — the raw material for newsletters and council updates.
import * as store from '../store.js';
import { esc, linkify, fmtDate, todayISO, plural } from '../util.js';
import { openModal, input, select, textarea, confirmDialog } from '../ui.js';
import { wsOptions, signInHint } from './shared.js';

const CATEGORIES = ['Success story', 'Milestone', 'Tool spotlight', 'Metric'];
let category = '';

export function renderWins(main) {
  const wins = store.db.wins
    .filter((w) => !category || w.category === category)
    .sort((a, b) => (b.featured - a.featured) || (b.date || '').localeCompare(a.date || ''));

  main.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Celebrate &amp; reuse</div><h1>Wins &amp; success stories</h1>
        <p>Log measurable outcomes, strong use cases, and team-level wins. Comms pulls from here for the company-wide update and newsletter.</p></div>
      ${store.me() ? '<button class="btn primary" id="newWin">+ Share a win</button>' : ''}
    </div>
    ${signInHint()}
    <div class="filters">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${CATEGORIES.map((c) => `<option ${c === category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <span class="spacer"></span><span class="small muted">${plural(wins.length, 'win')}</span>
    </div>
    ${wins.length ? `<div class="grid g3">${wins.map((w) => `
      <div class="card win ${w.featured ? 'top-accent' : ''}">
        <div class="row"><span class="tag">${esc(w.category || 'Win')}</span>${w.featured ? '<span class="star" title="Featured">★ Featured</span>' : ''}<span class="spacer"></span><span class="small muted">${fmtDate(w.date)}</span></div>
        <h3>${esc(w.title)}</h3>
        ${w.impact ? `<div class="impact">${esc(w.impact)}</div>` : ''}
        <p style="margin:0;font-size:14px">${linkify(w.summary || '')}</p>
        <div class="small muted">${esc([w.people, w.workstreamId ? store.wsName(w.workstreamId) : '', w.source].filter(Boolean).join(' · '))}</div>
        <div class="row">${w.link ? `<a class="small" href="${esc(w.link)}" target="_blank" rel="noopener">Learn more →</a>` : ''}<span class="spacer"></span>
          ${store.canDo('edit', 'wins', w) ? `<button class="btn link small" data-edit="${w.id}">Edit</button>` : ''}</div>
      </div>`).join('')}</div>` : '<div class="card empty"><strong>No wins yet</strong>Be the first to share one.</div>'}`;

  main.querySelector('#cat').addEventListener('change', (e) => { category = e.target.value; renderWins(main); });
  main.querySelector('#newWin')?.addEventListener('click', () => openWinForm());
  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openWinForm(store.db.wins.find((w) => w.id === b.dataset.edit))));
}

function openWinForm(w = {}) {
  const isNew = !w.id;
  const canFeature = store.hasRole('comms', 'council_lead', 'admin');
  openModal({
    title: isNew ? 'Share a win' : 'Edit win', wide: true,
    body: `<div class="form">
      ${input('title', 'Headline', w.title, { required: true, placeholder: 'e.g. Glean agent cut ticket triage time in half' })}
      <div class="three">
        ${select('category', 'Category', CATEGORIES, w.category || 'Success story')}
        ${input('date', 'Date', w.date || todayISO(), { type: 'date' })}
        ${select('workstreamId', 'Workstream', wsOptions(), w.workstreamId, { blank: 'Not workstream-specific' })}
      </div>
      ${textarea('summary', 'What happened', w.summary, { rows: 4, placeholder: 'The problem, what the team did with AI, and the result' })}
      <div class="two">
        ${input('impact', 'Impact / metric', w.impact, { placeholder: 'e.g. 6 hours saved per week; $40K annualized' })}
        ${input('people', 'Team or people', w.people)}
      </div>
      <div class="two">
        ${input('link', 'Link', w.link, { type: 'url', placeholder: 'https://…' })}
        ${input('source', 'Source', w.source, { placeholder: 'Where this came from (optional)' })}
      </div>
      ${canFeature ? `<label class="row small" style="font-weight:600"><input type="checkbox" name="featured" ${w.featured ? 'checked' : ''}> Feature this story (shown first and suggested for comms)</label>` : ''}
    </div>`,
    submitLabel: isNew ? 'Share win' : 'Save',
    extraButtons: !isNew && store.canDo('delete', 'wins', w) ? '<button type="button" class="btn danger" data-del>Delete</button>' : '',
    onSubmit: (data) => store.save('wins', { ...(isNew ? {} : { id: w.id }), ...data, featured: canFeature ? !!data.featured : !!w.featured }, { message: isNew ? 'Thanks for sharing!' : 'Saved' }),
    onMount: (el, close) => el.querySelector('[data-del]')?.addEventListener('click', async () => {
      close();
      if (await confirmDialog('Delete this win?', { confirmLabel: 'Delete' })) store.remove('wins', w.id);
    }),
  });
}
