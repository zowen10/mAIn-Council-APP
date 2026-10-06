// Modal, toast, and form-field helpers.
import { esc, fromLines } from './util.js';

let toastTimer;
export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, isError ? 4500 : 2200);
}

/**
 * openModal({ title, body, wide, submitLabel, onSubmit(data, form), extraButtons, onMount(el) })
 * The body is wrapped in a <form>; onSubmit gets the parsed form data and may
 * return false (or throw) to keep the modal open.
 */
export function openModal({ title, body, wide = false, submitLabel = 'Save', onSubmit, extraButtons = '', onMount, cancelLabel = 'Cancel' }) {
  const root = document.getElementById('modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <form class="modal ${wide ? 'wide' : ''}" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Close">✕</button></header>
      <div class="body">${body}</div>
      <footer>${extraButtons}<span class="spacer"></span>
        <button type="button" class="btn" data-close>${esc(cancelLabel)}</button>
        ${onSubmit ? `<button type="submit" class="btn primary">${esc(submitLabel)}</button>` : ''}
      </footer>
    </form>`;
  root.appendChild(wrap);
  const form = wrap.querySelector('form');
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const missing = [...form.querySelectorAll('[required]')].find((f) => !String(f.value).trim());
    if (missing) { missing.focus(); toast('Please fill in the required fields', true); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const keep = await onSubmit(formData(form), form, e.submitter);
      if (keep !== false) close();
    } catch { /* store already showed the error */ } finally { btn.disabled = false; }
  });
  onMount?.(wrap, close);
  setTimeout(() => form.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select')?.focus(), 30);
  return { el: wrap, close };
}

export function confirmDialog(message, { title = 'Are you sure?', confirmLabel = 'Confirm' } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal({
      title, body: `<p>${esc(message)}</p>`, submitLabel: confirmLabel,
      onSubmit: () => { answered = true; resolve(true); },
    });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!answered) resolve(false); } });
    obs.observe(document.getElementById('modalRoot'), { childList: true });
  });
}

/** Parse a form into an object. Checkbox groups with the same name become arrays. */
export function formData(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') {
      if (el.dataset.group !== undefined) { out[el.name] ||= []; if (el.checked) out[el.name].push(el.value); } else out[el.name] = el.checked;
    } else if (el.multiple) {
      out[el.name] = [...el.selectedOptions].map((o) => o.value);
    } else out[el.name] = el.value.trim();
  }
  return out;
}

// ---- field builders (return HTML strings) ----
const lbl = (name, label, hint) => `<label for="f_${name}">${esc(label)}${hint ? ` <span class="hint">${esc(hint)}</span>` : ''}</label>`;
export const input = (name, label, value = '', { type = 'text', required, hint, placeholder = '', list } = {}) =>
  `<div class="field">${lbl(name, label, hint)}<input id="f_${name}" name="${name}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${required ? 'required' : ''} ${list ? `list="${list}"` : ''}></div>`;
export const textarea = (name, label, value = '', { hint, placeholder = '', rows, cls = '' } = {}) =>
  `<div class="field">${lbl(name, label, hint)}<textarea id="f_${name}" name="${name}" placeholder="${esc(placeholder)}" ${rows ? `rows="${rows}"` : ''} class="${cls}">${esc(value)}</textarea></div>`;
export const bulletsField = (name, label, arr, { hint = 'one item per line', placeholder = '' } = {}) => textarea(name, label, fromLines(arr), { hint, placeholder });
export function select(name, label, options, value = '', { hint, blank } = {}) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return `<div class="field">${lbl(name, label, hint)}<select id="f_${name}" name="${name}">
    ${blank !== undefined ? `<option value="">${esc(blank)}</option>` : ''}
    ${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(value ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
  </select></div>`;
}
export const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values)].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
