// Role-based permission rules, shared by the server (enforcement) and the
// browser (to hide controls a user cannot use). Edit this file to change who
// can do what — e.g. which roles may approve/publish a council snapshot.

export const ROLES = {
  admin: 'Administrator',
  council_lead: 'Council lead',
  leadership: 'Council leadership',
  comms: 'Comms team',
};

// Collections the API exposes.
export const COLLECTIONS = [
  'workstreams', 'members', 'updates', 'snapshots', 'actions',
  'notes', 'comments', 'links', 'wins', 'comms', 'activities',
];

const has = (user, ...roles) => !!user && (user.roles || []).some((r) => roles.includes(r));
const isAuthor = (user, rec) => !!user && !!rec && rec.createdBy === user.id;

export function isLeadOf(user, workstreamId, db) {
  if (!user || !workstreamId) return false;
  const ws = (db.workstreams || []).find((w) => w.id === workstreamId);
  return !!ws && (ws.leadIds || []).includes(user.id);
}

export function isAnyLead(user, db) {
  return !!user && (db.workstreams || []).some((w) => (w.leadIds || []).includes(user.id));
}

/**
 * @param user   the signed-in member (or null)
 * @param action 'create' | 'edit' | 'delete'
 * @param col    collection name
 * @param rec    for create: the new record; for edit/delete: the existing record
 * @param db     full state (for workstream lead lookups)
 * @param next   for edit: the record after the change (used for status transitions)
 */
export function can(user, action, col, rec, db, next) {
  if (!user) return false;
  if (has(user, 'admin')) return true;
  const target = next || rec || {};
  const statusChangeTo = (s) => action === 'edit' && next && next.status === s && rec && rec.status !== s;

  switch (col) {
    case 'workstreams':
    case 'members':
      return false; // admin only

    case 'updates': {
      const owner = isLeadOf(user, target.workstreamId, db) || has(user, 'council_lead');
      if (action === 'create') return owner;
      if (statusChangeTo('Approved')) return has(user, 'council_lead', 'leadership');
      if (action === 'edit') {
        if (rec.status === 'Approved') return has(user, 'council_lead');
        return owner || isAuthor(user, rec);
      }
      if (action === 'delete') return rec.status !== 'Approved' && (isAuthor(user, rec) || has(user, 'council_lead'));
      return false;
    }

    case 'snapshots': {
      // Approved snapshots are a permanent historical record.
      if (action !== 'create' && rec && rec.status === 'Approved') return false;
      if (statusChangeTo('Approved')) return has(user, 'leadership');
      if (action === 'delete') return has(user, 'council_lead');
      return has(user, 'council_lead', 'leadership');
    }

    case 'comms': {
      if (statusChangeTo('Approved') || statusChangeTo('Published')) return has(user, 'comms', 'leadership');
      if (action === 'delete') return has(user, 'comms') || (isAuthor(user, rec) && rec.status === 'Draft');
      return has(user, 'comms', 'council_lead');
    }

    case 'activities':
      return has(user, 'council_lead', 'leadership', 'comms') || isAnyLead(user, db);

    case 'actions':
      if (action === 'delete') return isAuthor(user, rec) || has(user, 'council_lead');
      return true; // shared tracker: any member can add and update actions

    case 'notes':
      if (action === 'create') return true;
      return isAuthor(user, rec) || has(user, 'council_lead');

    case 'wins':
      if (action === 'create') return true;
      return isAuthor(user, rec) || has(user, 'comms', 'council_lead');

    case 'links':
      if (action === 'create') return true;
      return isAuthor(user, rec) || isLeadOf(user, rec.workstreamId, db);

    case 'comments':
      if (action === 'create') return true;
      return isAuthor(user, rec);

    default:
      return false;
  }
}
