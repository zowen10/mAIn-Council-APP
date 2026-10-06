import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { can } from '../public/js/permissions.js';
import { buildSnapshotDraft } from '../public/js/rollup.js';
import { generateEmail } from '../public/js/email.js';
import { createApp, loadDb } from '../server.js';

const freshDb = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hub-')), 'db.json');
  return { db: loadDb(file, { reset: true }), file };
};
const user = (db, id) => db.members.find((m) => m.id === id);

test('seed contains five workstreams with leads and an approved snapshot', () => {
  const { db } = freshDb();
  assert.equal(db.workstreams.length, 5);
  for (const w of db.workstreams) assert.ok(w.leadIds.length >= 2, `${w.name} has leads`);
  assert.equal(db.snapshots.filter((s) => s.status === 'Approved').length, 1);
});

test('permissions: leads update their own stream only; leadership approves snapshots', () => {
  const { db } = freshDb();
  const brijesh = user(db, 'm_brijesh_patel'); // AI Literacy lead
  const member = user(db, 'm_trevor_rizzo');
  const udai = user(db, 'm_udai_tennati'); // leadership
  const admin = user(db, 'm_admin');
  assert.ok(can(brijesh, 'create', 'updates', { workstreamId: 'ws_literacy' }, db));
  assert.ok(!can(brijesh, 'create', 'updates', { workstreamId: 'ws_measure' }, db));
  assert.ok(!can(member, 'create', 'snapshots', {}, db));
  assert.ok(can(member, 'create', 'actions', {}, db));
  const draft = { status: 'In Review' };
  assert.ok(can(udai, 'edit', 'snapshots', draft, db, { ...draft, status: 'Approved' }));
  assert.ok(!can(brijesh, 'edit', 'snapshots', draft, db, { ...draft, status: 'Approved' }));
  // Approved snapshots are locked, even for the council lead.
  const sn = db.snapshots[0];
  assert.ok(!can(udai, 'edit', 'snapshots', sn, db, { ...sn, takeaway: 'x' }));
  assert.ok(can(admin, 'edit', 'snapshots', sn, db, sn)); // admin escape hatch
  assert.ok(!can(null, 'create', 'actions', {}, db));
});

test('roll-up combines submitted updates and ignores drafts', () => {
  const { db } = freshDb();
  db.updates.push(
    { id: 'u1', workstreamId: 'ws_literacy', status: 'Submitted', health: 'At Risk', periodStart: '2026-09-29', periodEnd: '2026-10-06', takeaway: 'Pilot ran', progress: ['Ran pilot'], nextSteps: ['Launch office hours'], decisions: ['Approve Glean 101'], risks: ['No channel'], help: [] },
    { id: 'u2', workstreamId: 'ws_agents', status: 'Draft', health: 'Off Track', periodStart: '2026-09-29', periodEnd: '2026-10-06', progress: ['secret draft'] },
  );
  const s = buildSnapshotDraft(db, '2026-09-25', '2026-10-08');
  assert.deepEqual(s.sourceUpdateIds, ['u1']);
  assert.equal(s.overallStatus, 'At Risk');
  assert.ok(s.accomplishments.includes('AI Literacy: Ran pilot'));
  assert.ok(s.decisions.includes('AI Literacy: Approve Glean 101'));
  assert.ok(!JSON.stringify(s).includes('secret draft'));
  assert.equal(s.highlights.find((h) => h.workstreamId === 'ws_agents').status, 'No update');
});

test('email generation: company and leads audiences', () => {
  const { db } = freshDb();
  const snapshot = db.snapshots[0];
  const include = { accomplishments: ['AI Literacy: Ran Glean 101 pilot', 'Win: Automated Inventory Audit Workbook — repeatable'], highlights: ['ws_measure'], wins: ['win_01'], activities: ['evt_01'], metrics: ['$4M annualized savings'], ctas: ['Share a win'] };
  const company = generateEmail({ snapshot, audience: 'company', db, include });
  assert.match(company.subject, /Automated Inventory Audit Workbook/);
  assert.match(company.body, /SUCCESS STORIES/);
  assert.match(company.body, /• Share a win/);
  assert.match(company.body, /• Ran Glean 101 pilot/); // workstream prefixes stripped for company audience
  assert.doesNotMatch(company.body, /Win: Automated/); // win not duplicated in accomplishments
  const leads = generateEmail({ snapshot, audience: 'leads', db, include });
  assert.match(leads.body, /DECISIONS NEEDED/);
  assert.match(leads.body, /open actions/);
});

test('API: auth required for writes, permissions enforced, data persisted', async () => {
  const { db, file } = freshDb();
  const server = http.createServer(createApp(db, () => fs.writeFileSync(file, JSON.stringify(db))));
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, body, uid) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(uid ? { 'X-User-Id': uid } : {}) }, body: body && JSON.stringify(body) });
  try {
    assert.equal((await call('POST', '/api/actions', { action: 'x' })).status, 401);
    assert.equal((await call('POST', '/api/snapshots', {}, 'm_trevor_rizzo')).status, 403);
    const res = await call('POST', '/api/actions', { action: 'Test action', status: 'Not Started', id: 'hijack', createdBy: 'someone' }, 'm_trevor_rizzo');
    assert.equal(res.status, 201);
    const rec = await res.json();
    assert.notEqual(rec.id, 'hijack');
    assert.equal(rec.createdBy, 'm_trevor_rizzo');
    const upd = await (await call('PUT', `/api/actions/${rec.id}`, { status: 'Complete' }, 'm_brijesh_patel')).json();
    assert.equal(upd.status, 'Complete');
    assert.equal(upd.updatedBy, 'm_brijesh_patel');
    assert.ok(JSON.parse(fs.readFileSync(file, 'utf8')).actions.some((a) => a.id === rec.id));
    assert.equal((await call('GET', '/api/nope')).status, 404);
  } finally {
    server.close();
  }
});
