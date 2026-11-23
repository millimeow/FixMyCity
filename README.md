# Fix My City

A complete local civic-issue reporting website for **Mumbai, Maharashtra**. Built from the supplied PS1 brief and syllabus constraints using HTML, CSS, vanilla JavaScript, Node.js, Express MVC, Prisma Client and SQLite. **No React, Tailwind, maps or heatmaps.**

## Open the running app

Visit **http://127.0.0.1:3000**. This is an independent local demonstration, not a service connected to BMC or any government system. Seed reports, people and departments are fictional. In-app notifications stay in the application; no email or SMS is sent.

## Run on your computer

Requires **Node.js 22 or newer** and npm. In this project folder:

```sh
npm ci
npm run setup
npm start
```

Then visit http://127.0.0.1:3000. `npm run setup` generates Prisma Client, creates the SQLite file, applies the checked-in migration and inserts sample data only when the database has no users. It does not overwrite existing reports. No build step is needed.

Optional configuration:

```sh
cp .env.example .env
```

The defaults work without an `.env` file. Set `PORT`, `HOST`, `DATABASE_URL`, `COOKIE_SECURE` or `UPLOAD_DIR` if needed. A relative SQLite URL is resolved relative to `prisma/`, for example `file:./dev.db`. Stop the server with Ctrl+C. `npm run dev` restarts the backend when server source changes; reload the browser after frontend edits.

## Demo accounts

All use **`CityDemo!2026`**. The sign-in page also has buttons to fill these credentials.

| Role | Email | Use |
| --- | --- | --- |
| Citizen | citizen@fixmycity.local | Report, support, track, give feedback |
| Another citizen | neighbor@fixmycity.local | Support others' issues |
| Roads officer | officer@fixmycity.local | Assigned roads and public-space reports |
| Waste officer | officer2@fixmycity.local | Assigned waste reports |
| Water officer | officer3@fixmycity.local | Assigned water and drainage reports |
| Electrical officer | officer4@fixmycity.local | Assigned streetlight reports |
| Administrator | admin@fixmycity.local | Assignment, departments, categories, staff, analytics |

Public registration always creates a citizen. Administrators create staff accounts from Administration. Staff navigation contains My workspace, City analytics and Notifications (plus Administration for admins). Community board, reporting, and community support actions are citizen-only; staff attempting citizen routes return to My workspace. Demo passwords are for local use; do not expose this seeded database to the internet.

## Try the complete workflow

1. Sign in as a citizen, choose **Report an issue**, add a category, description, Mumbai, ward and address. Add up to three PNG/JPEG/WebP photos (2 MB each) and one MP4/WebM video (10 MB). The selected video previews before submission; saved videos have native playback controls. Optional latitude/longitude enables distance comparisons without mapping.
2. As you type, nearby matching open reports are suggested from title/address/locality/category, optionally distance within 300 metres. Support a matching report or submit a new one. Suggestions are heuristics, never automatic merges.
3. Open **My reports** to see the report and its timeline. Other citizens can support it once and receive future updates.
4. Sign in as admin. In **My workspace**, open the report, select a department and an officer in that department, and save the assignment. Categories route to a department automatically; admin can override routing on an individual report.
5. Sign in as the assigned officer. Open **My workspace**, start work with a progress note, then resolve it with a new resolution photo. Other officers cannot update this report.
6. Return as the reporting citizen. Give a 1–5 rating and feedback. Confirm the fix to close it, or reopen it to request more work. All previous history and evidence remain visible.
7. Check Notifications. Admin/Officer **City analytics** shows current totals, category/department workload, six-month reporting trend, average resolution time, satisfaction and overdue counts. Officers see their own assigned report data.
8. Normal reports target 72 hours; urgent ones target 24 hours. The server escalates overdue active reports on startup and every minute, once per open cycle. Admin can run the check manually from analytics. Reopening creates a fresh 72-hour target and permits a fresh escalation.

## Status rules

`SUBMITTED → ASSIGNED → IN_PROGRESS → RESOLVED → CLOSED`

The reporting citizen may instead move `RESOLVED → REOPENED → IN_PROGRESS → RESOLVED`. Admin may reassign active complaints. Resolution requires an assigned officer, a progress note and a new photo. Citizens cannot set staff statuses; officers can update only their assigned work.

## Project layout

```text
public/                  HTML view, CSS, vanilla JS and local SVG assets
src/app.js               Express application and security headers
src/server.js            Local HTTP server and periodic escalation
src/routes/              Express routers and role gates
src/controllers/         HTTP request/response handlers
src/services/            Credentials, uploads and complaint operations
src/middleware/          Sessions, CSRF, RBAC and login throttling
src/db.js                Prisma Client
prisma/schema.prisma     Database models and relations
prisma/migrations/       Reproducible initial migration
prisma/seed.js            Fictional sample data
scripts/setup.js         First-run setup
uploads/                 Runtime uploaded photos and videos (generated; ignored)
tests/flows.test.js       Real HTTP + isolated SQLite integration tests
docs/                    Implementation and API notes
```

## Verification

```sh
npm test
```

The tests create and remove **only the disposable `prisma/test.db`, `prisma/migration-test.db` and `tests/uploads/`**, seed their own accounts, start a temporary local HTTP port and exercise the real app. Keep those paths for disposable test data. Your normal `dev.db` and `uploads/` are not used by tests.

```sh
npx prisma validate
npm run db:studio
```

Studio is optional for inspecting the local database. For schema edits: `npx prisma migrate dev --name describe_change`.

## Security and operational notes

- Passwords use Node's scrypt with unique random salts; no plaintext credentials are stored in the database.
- Seven-day opaque sessions use a random token in an HttpOnly, SameSite=Strict cookie. Only its SHA-256 digest is stored in SQLite. Login rotates sessions and logout invalidates the current session. All protected writes require the session's CSRF token and reject a foreign Origin.
- RBAC is enforced on the server. Staff APIs do not expose password hashes. SQL queries use Prisma parameters. Browser-rendered user content is escaped; a strict Content Security Policy blocks inline scripts and third-party resources.
- Photo and video upload transport uses FileReader rather than a multipart library, to stay within the allowed dependencies. Server checks count, byte size, MIME allowlist file signatures, chunk/segment structure, dimensions (maximum 16 megapixels), and PNG checksums/decompression; stores random filenames outside public source; removes files if a database transaction fails. Videos have an allowlist, a 10 MB limit, container/track/sample validation and persistent metadata. MP4/WebM checks are structural; encoded samples are not decoded or transcoded. Use H.264 MP4 or VP8/VP9 WebM for broad playback support; codec availability depends on the browser. SVG/HTML and animated PNG/WebP uploads are rejected. Structural validation is not a full JPEG/WebP decoder or malware scanner. Uploaded evidence is accessible to anyone with its local URL, as are public complaint descriptions and addresses. Do not put private information in reports.
- This is a local, single-process application. SQLite and filesystem uploads must be backed up together. Escalation runs only while the server runs; startup catches missed deadlines. Login throttling is process-local and resets on restart.
- Before any real public rollout: replace demo accounts/data, serve behind HTTPS with `COOKIE_SECURE=1`, review privacy/retention and moderation, add operational monitoring/backups and a trusted image decoding/scanning service if required. Those integrations are outside this stack-constrained local build.
- If the port is busy, set `PORT=3001` in `.env`. If Prisma cannot download an engine during installation, allow npm/Prisma access to their official package/engine hosts, then rerun `npm ci` and setup. The setup script pre-creates new SQLite files for consistent first-run engine behavior.

Implementation references: [Prisma v6 connection URLs](https://www.prisma.io/docs/orm/v6/reference/connection-urls), [Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling/).

## Latest update

The service area, headings, form and fictional seed locations now use Mumbai only. New reports for another city are rejected. The additive video migration preserves original locations on genuine historical reports; only fictional `demo-*` samples are relocated. Existing complaints and photos remain intact. Run `npm run setup` after updating to apply the new migration, then restart the server and refresh the browser.
