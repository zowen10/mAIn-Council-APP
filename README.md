# mAIn Council Collaboration Hub

A lightweight hub for the Global mAIn Council that replaces recurring PowerPoint status decks with a living, searchable record of workstream progress, council accomplishments, decisions, action items, and upcoming activities.

**Core loop:** workstream leaders submit short structured updates → the council lead rolls them up into a two-week leadership snapshot → leadership approves it → Comms turns it into a first-draft email (company-wide, or for workstream leads and leadership).

## Quick start

Requires Node.js 20 or later. There are no dependencies to install.

```bash
npm start            # http://localhost:3000
npm test             # unit + API tests
npm run reset-data   # discard local data and re-seed
```

Open the app and **choose who you are** (top right) to edit. Until then, the hub is read-only. The seed includes a **Hub Administrator** account (admin + council lead) for setup.

## What's inside

| Page | Purpose |
| --- | --- |
| **Council Update** (landing) | Current two-week executive update (takeaway, accomplishments, workstream highlights, decisions, risks, help needed, next activities), KPIs, accomplishments from the last two months, upcoming milestones, open actions, recent meeting notes, and the update history (newest first). |
| **Action Items** | Shared tracker with filters for owner, workstream, status, priority, and due date. Overdue and blocked items are highlighted, statuses can be changed inline, and the list exports to CSV. Completed items are kept for history. |
| **Meeting Notes** | Date, type, scope, participants, notes, decisions, and links. Actions can be created from a note, or typed one per line when saving (`Do the thing @Owner`). |
| **Wins & Stories** | Success stories, milestones, tool spotlights, and metrics. Anyone can share one, and Comms can feature them. |
| **Comms** | Pick an approved snapshot and audience, choose accomplishments, stories, metrics, activities, and calls to action, then generate a draft, edit, and preview it. The draft moves through Draft → In Review → Approved → Published → Archived and stays linked to its source snapshot. It is never sent automatically: use Copy or Open in email app. A **Documents & assets** library takes any file type (Word, PowerPoint, Excel, PDF, images, .msg emails), with **Update** to upload a newer version. Each draft can also have its own attachments. |
| **Workstream pages** (×5) | All five share one layout: mission and scope, leaders and members, a current update in the six-panel executive format, action items, discussion (newest post at the top), useful links, and update history. |
| **Admin** | Manage workstreams (including adding a sixth), leaders, members, and roles. |
| **Search** | Searches across updates, snapshots, actions, notes, wins, email drafts, document names, and discussion. |

### Two-week snapshot workflow

1. Leads submit (or save as draft) a weekly update from their workstream page.
2. The council lead clicks **Build next two-week update**. The hub rolls up every *submitted* update in the period, plus wins and upcoming activities, into a draft.
3. The council lead edits the takeaway, accomplishments, highlights, decisions, risks, and next activities, then submits the draft for review.
4. Leadership clicks **Approve & publish**. The snapshot becomes the landing-page update and is locked as a permanent historical record. Earlier snapshots stay viewable.
5. Comms generates an email draft from it.

### Roles and permissions

| Role | Can |
| --- | --- |
| Council member (everyone) | Read everything; add and update actions, notes, wins, links, and discussion |
| Workstream leader (set per workstream) | Create and edit their own workstream's updates |
| Council lead | Build and edit council snapshots; edit any update; mark updates reviewed |
| Council leadership | Edit and **approve** snapshots; approve comms |
| Comms team | Create, edit, approve, and publish email drafts; feature wins |
| Administrator | Everything, including workstreams, members, and roles |

All rules live in one file, [`public/js/permissions.js`](public/js/permissions.js). The server enforces them and the UI uses them to hide controls. Change them there, for example to decide who may publish a snapshot.

> **Identity is a placeholder.** "Choose who you are" is meant for a pilot inside a trusted network. Before wider rollout, put the app behind company SSO (for example Entra ID or Okta through a reverse proxy) and set the user from the authenticated identity instead of the `X-User-Id` header.

## How it's built

- `server.js`: a zero-dependency Node HTTP server. It serves `public/` and a small REST API (`GET /api/state`, `POST/PUT/DELETE /api/<collection>/<id>`) and stamps `createdBy`, `updatedBy`, and timestamps on every record.
- Storage: a single JSON file, `data/db.json`, created from `data/seed.json` on first run and written atomically. Set `DB_FILE` to keep it on a persistent volume.
- Uploaded documents: stored in `data/uploads/` (next to `DB_FILE`) under generated names, never the original filename. The upload limit is 50 MB per file; change it with `MAX_UPLOAD_MB`. Downloads are always served as attachments, so uploaded files never run inside the hub.
- Backups: copy the whole `data/` folder (database and uploads).
- `public/`: a single-page app in plain ES modules (no build step). `rollup.js` builds snapshot drafts and `email.js` generates emails. Both are pure functions covered by tests.

Collections: `workstreams`, `members`, `updates`, `snapshots`, `actions`, `notes`, `comments`, `links`, `wins`, `comms`, `activities`.

### Deploying

```bash
docker build -t main-council-hub .
docker run -p 3000:3000 -v hubdata:/app/data main-council-hub
```

Any Node host works (an internal VM, Azure App Service, and so on). Mount `data/` on persistent storage.

### Growing it later

The JSON store suits a council-sized team. If usage grows, swap `loadDb`/`writeDb` in `server.js` for SQLite or Postgres without touching the UI. The email generator is template-based, so an LLM call could be added in `email.js` to polish tone.

## Seed content

The seed is editable data, not app logic. It comes from:

- **Workstreams, leaders, members, and co-sponsors**: the *Introducing Our Global AI Workstreams and Council Members* email.
- **First snapshot and M&G update (24 Sep 2026)**: the Measurement & Governance Executive Sponsor Update deck. The other four workstreams show "No update", since their content wasn't provided.
- **Wins**: the September 2026 mAIn newsletter (Impact Story of the Month, BAZAAR, Elastic Analysis, Maki Schedule Logging) and the $4M Glean impact analysis.
- **Actions and activities**: next steps from the M&G deck, "coming soon" items on the Start Here page, and the council cadence (monthly newsletter and open house, quarterly agent-a-thon and best-practice/agent audit). Owners are teams and most due dates are blank. Assign them in the tracker.

## Open inputs

- Confirm the final list of workstreams (five or six). Admin supports adding one.
- Assign the real council lead(s) and administrators, then deactivate the seeded Hub Administrator.
- Confirm whether leads submit every week or only before each snapshot.
- Add the Comms team's sample company-wide email so the template in `public/js/email.js` can match it.
- Confirm the leadership approval sequence and who may publish snapshots (`permissions.js`).
- Add Teams channels, dashboards, prompt library, and training links to each workstream's *Useful links*.
- Confirm the status vocabulary (currently On Track / At Risk / Off Track).
