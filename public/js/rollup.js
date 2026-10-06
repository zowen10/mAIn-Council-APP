// Rolls submitted workstream updates (plus wins and upcoming activities) for a
// reporting period into a draft two-week council snapshot. Pure function so
// it can be unit-tested; the council lead edits the result before review.
import { hasItems } from './util.js';

const SEVERITY = { 'Off Track': 3, 'At Risk': 2, 'On Track': 1 };

export function updatesForPeriod(db, workstreamId, start, end) {
  return db.updates
    .filter((u) => u.workstreamId === workstreamId && u.status !== 'Draft')
    .filter((u) => (u.periodEnd || '') >= start && (u.periodStart || u.periodEnd || '') <= end)
    .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export function buildSnapshotDraft(db, periodStart, periodEnd) {
  const streams = db.workstreams.filter((w) => w.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const prefix = (w, items) => (hasItems(items) ? items.map((i) => `${w.name}: ${i}`) : []);
  const draft = {
    periodStart, periodEnd, overallStatus: 'On Track', takeaway: '',
    accomplishments: [], highlights: [], decisions: [], risks: [], help: [], nextActivities: [], sourceUpdateIds: [],
  };
  let worst = 0;
  let reported = 0;

  for (const w of streams) {
    // Combine every submitted update in the period (e.g. two weekly updates), newest first.
    const ups = updatesForPeriod(db, w.id, periodStart, periodEnd);
    if (!ups.length) {
      draft.highlights.push({ workstreamId: w.id, status: 'No update', summary: 'No update submitted for this period.' });
      continue;
    }
    reported++;
    const latest = ups[0];
    worst = Math.max(worst, SEVERITY[latest.health] || 0);
    const uniq = (key) => [...new Set(ups.flatMap((u) => (hasItems(u[key]) ? u[key] : [])))];
    draft.highlights.push({ workstreamId: w.id, status: latest.health || 'On Track', summary: latest.takeaway || uniq('progress')[0] || '' });
    draft.accomplishments.push(...prefix(w, uniq('progress')));
    draft.decisions.push(...prefix(w, uniq('decisions')));
    draft.risks.push(...prefix(w, uniq('risks')));
    draft.help.push(...prefix(w, latest.help));
    draft.nextActivities.push(...prefix(w, latest.nextSteps));
    draft.sourceUpdateIds.push(...ups.map((u) => u.id));
  }

  const wins = (db.wins || []).filter((x) => x.date >= periodStart && x.date <= periodEnd);
  draft.accomplishments.push(...wins.map((x) => `Win: ${x.title}${x.impact ? ` — ${x.impact}` : ''}`));

  const horizon = addDaysISO(periodEnd, 21);
  const upcoming = (db.activities || []).filter((a) => a.status !== 'Done' && a.date && a.date > periodEnd && a.date <= horizon);
  draft.nextActivities.push(...upcoming.map((a) => `${a.title} (${a.date})`));

  draft.overallStatus = Object.keys(SEVERITY).find((k) => SEVERITY[k] === worst) || 'On Track';
  const n = (arr, word) => `${arr.length} ${word}${arr.length === 1 ? '' : 's'}`;
  draft.takeaway = `${reported} of ${streams.length} workstreams reported this period. ${n(draft.accomplishments, 'accomplishment')} logged; ${n(draft.decisions, 'decision')} needed from leadership and ${n(draft.risks, 'risk')} flagged. [Edit this into a one- or two-sentence executive takeaway.]`;
  return draft;
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}
