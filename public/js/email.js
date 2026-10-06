// First-draft email generation from an approved council snapshot. Templates
// are deterministic so drafts are predictable; Comms edits before sending.
// Pure function (no DOM) so it can be unit-tested.
import { hasItems, fmtDate, fmtRange } from './util.js';

export const AUDIENCES = {
  company: 'Company-wide update',
  leads: 'Workstream leads & leadership',
};

export const DEFAULT_CTAS = [
  'Try one approved internal AI use case this week, and share the prompt, workflow, or lesson learned',
  'Submit an AI success story so we can celebrate it and help others reuse it',
  'Join the monthly open house for demos and Q&A',
  'Share your prompts, skills, and agents with the Use Cases & Prompts workstream',
  'Have an idea or question? Reach out to the mAIn Council member in your region',
];

const bulletBlock = (items) => items.map((i) => `• ${i}`).join('\n');
const section = (title, content) => (content ? `\n${title.toUpperCase()}\n${content}\n` : '');
// "Workstream: text" prefixes from the roll-up read awkwardly in a company email.
const stripPrefix = (s) => s.replace(/^[^:]{3,40}:\s+/, '');

/**
 * @param {object} p
 * @param {object} p.snapshot   source council snapshot
 * @param {string} p.audience   'company' | 'leads'
 * @param {object} p.db         full state (workstreams, wins, activities, actions)
 * @param {object} p.include    { accomplishments: string[], highlights: wsId[], wins: id[], activities: id[], metrics: string[], ctas: string[] }
 */
export function generateEmail({ snapshot, audience = 'company', db, include = {} }) {
  const period = fmtRange(snapshot.periodStart, snapshot.periodEnd);
  const wsName = (id) => db.workstreams.find((w) => w.id === id)?.name || 'Council';
  const wins = (db.wins || []).filter((w) => (include.wins || []).includes(w.id));
  // Skip roll-up lines like "Win: <title> — ..." when that win is featured in full below.
  const accomplishments = (include.accomplishments || []).filter((a) => !wins.some((w) => a.startsWith(`Win: ${w.title}`)));
  const highlights = (snapshot.highlights || []).filter((h) => (include.highlights || []).includes(h.workstreamId) && h.status !== 'No update');
  const activities = (db.activities || []).filter((a) => (include.activities || []).includes(a.id))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const metrics = include.metrics || [];
  const ctas = include.ctas || [];
  const when = (a) => (a.date ? fmtDate(a.date, { year: false }) : a.timeframe || 'Date TBC');

  if (audience === 'leads') {
    const openActions = (db.actions || []).filter((a) => ['Not Started', 'In Progress', 'Blocked'].includes(a.status));
    const blocked = openActions.filter((a) => a.status === 'Blocked').length;
    const subject = `mAIn Council two-week update (${period}) — ${snapshot.overallStatus || 'Status'}`;
    const body = [
      'Hi all,',
      '',
      `Here is the mAIn Council update for ${period}. Overall status: ${snapshot.overallStatus || 'n/a'}.`,
      '',
      snapshot.takeaway || '',
      section('Key accomplishments', bulletBlock(accomplishments)),
      section('Workstream highlights', highlights.map((h) => `• ${wsName(h.workstreamId)} [${h.status}] — ${h.summary}`).join('\n')),
      section('Decisions needed', hasItems(snapshot.decisions) ? bulletBlock(snapshot.decisions) : '• None this period'),
      section('Risks or blockers', hasItems(snapshot.risks) ? bulletBlock(snapshot.risks) : '• None this period'),
      section('Help needed', hasItems(snapshot.help) ? bulletBlock(snapshot.help) : '• None this period'),
      section('Next activities', bulletBlock([...(snapshot.nextActivities || []), ...activities.map((a) => `${when(a)} — ${a.title}`)])),
      section('Metrics', bulletBlock(metrics)),
      section('Action tracker', `• ${openActions.length} open actions (${blocked} blocked). Please update your items in the hub before the next council meeting.`),
      section('Asks', bulletBlock(ctas)),
      '\nThanks,\nGlobal mAIn Council',
    ].join('\n');
    return { subject, body: tidy(body) };
  }

  const lead = wins[0]?.title || stripPrefix(accomplishments[0] || '') || 'what we delivered';
  const subject = `mAIn Council update: ${truncate(lead, 70)}`;
  const body = [
    'Hi everyone,',
    '',
    snapshot.takeaway || `Here is what the Global mAIn Council delivered over the last two weeks (${period}).`,
    section('What we delivered', bulletBlock(accomplishments.map(stripPrefix))),
    section('Success stories', wins.map((w) => `${w.title}\n${w.summary || ''}${w.impact ? `\nImpact: ${w.impact}` : ''}`).join('\n\n')),
    section('By the numbers', bulletBlock(metrics)),
    section('Across the workstreams', highlights.map((h) => `• ${wsName(h.workstreamId)} — ${h.summary}`).join('\n')),
    section('Coming up', activities.map((a) => `• ${when(a)} — ${a.title}`).join('\n')),
    section('How you can get involved', bulletBlock(ctas)),
    '\nThank you to everyone experimenting, sharing, and building. Small wins create more value when others can find them, trust them, and build on them.',
    '\nThe Global mAIn Council',
  ].join('\n');
  return { subject, body: tidy(body) };
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const tidy = (s) => s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
