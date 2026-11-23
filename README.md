# Fix My City

A civic issue reporting website for **Mumbai, Maharashtra**. Citizens report local problems, administrators assign work, and officers share progress and resolution evidence.

**[Open the live demo](https://fix-my-city-taupe-tau.vercel.app)**

This is an independent student project with fictional sample data, not an official municipal service. Use sample information when trying the public demo.

## Features

- Citizen registration and login with role-based dashboards.
- Complaints with a category, ward, text address, photos and an optional video.
- Department routing, admin assignment and officer progress updates.
- Status timelines, resolution photos, citizen ratings and reopening.
- Support for existing complaints and in-app notifications.
- Overdue escalation, staff analytics and duplicate suggestions using text and optional coordinates.

Reports accept up to **three PNG/JPEG/WebP photos, 2 MB each**, and **one MP4/WebM video, 10 MB**. Resolving a complaint requires a new photo and a progress note.

## Technology

| Part                     | Technology                                 |
| ------------------------ | ------------------------------------------ |
| Frontend                 | HTML, CSS, vanilla JavaScript              |
| Backend                  | Node.js, Express, MVC with a service layer |
| Database access          | Prisma ORM and Prisma Client               |
| Local database and media | SQLite and the `uploads/` folder           |
| Live hosting             | Vercel                                     |
| Live database and media  | Neon PostgreSQL and private Vercel Blob    |

**This repository contains the local SQLite version.** The live demo uses a separately maintained Vercel copy with hosted database and media storage. Deploying this repository unchanged to Vercel will not provide persistent SQLite or filesystem uploads.

## Run locally

Requires **Node.js 22 or newer** and npm.

```sh
git clone https://github.com/millimeow/FixMyCity.git
cd FixMyCity
npm ci
npm run setup
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

Setup generates Prisma Client, applies database migrations and inserts sample data when no users exist. Existing reports are preserved. Stop the server with `Ctrl+C`.

Optional configuration:

```sh
cp .env.example .env
```

The local defaults work without this file. Change `PORT` if port 3000 is occupied. `npm run dev` restarts the backend after source changes; refresh the browser after frontend edits.

## Demo accounts

All accounts use **`CityDemo!2026`**. The sign-in page has quick-fill buttons for citizen, officer and admin accounts.

| Role               | Email                    |
| ------------------ | ------------------------ |
| Citizen            | citizen@fixmycity.local  |
| Another citizen    | neighbor@fixmycity.local |
| Roads officer      | officer@fixmycity.local  |
| Waste officer      | officer2@fixmycity.local |
| Water officer      | officer3@fixmycity.local |
| Electrical officer | officer4@fixmycity.local |
| Admin              | admin@fixmycity.local    |

Public registration creates citizen accounts. Administrators create officer and admin accounts.

## Complaint workflow

1. **Citizen:** submit a complaint or support a suggested existing report.
2. **Admin:** assign a department and an officer belonging to that department.
3. **Assigned officer:** start work, add a progress note and resolve with a new photo.
4. **Reporting citizen:** rate the outcome and close the report, or reopen it for further work.

```text
SUBMITTED -> ASSIGNED -> IN_PROGRESS -> RESOLVED -> CLOSED
                                           |
                                           v
                                       REOPENED -> IN_PROGRESS -> RESOLVED
```

Normal reports have a **72-hour** target; urgent reports have **24 hours**. Reopening starts a fresh 72-hour target. Locally, overdue checks run at startup and every minute while the server runs. Online, they run during app requests and through a daily Vercel cron job. Admins can also check overdue reports manually.

## Project structure

```text
public/                  HTML, CSS, frontend JavaScript and assets
src/routes/              API routes and role requirements
src/controllers/         Request and response handlers
src/services/            Complaint rules, security and media validation
src/middleware/          Sessions, CSRF, roles and authentication throttling
src/app.js               Express configuration and error handling
src/server.js            Local server and escalation timer
src/db.js                Shared Prisma Client
prisma/                  Schema, migrations and sample data
scripts/                 Setup scripts
tests/                   Workflow, permission, migration and media tests
docs/                    Functional brief and technical notes
```

## Checks and database tools

```sh
npm test
npx prisma validate
npm run db:studio
```

Tests use disposable databases and a separate upload directory, not the normal local database or uploads. Prisma Studio is optional for inspecting records.

## Security and demo limits

Passwords use scrypt hashing with random salts. The server enforces cookie sessions, CSRF checks, roles and assignment ownership. Uploaded media is checked for type, size and structure; these checks are not a malware scanner or full media decoder.

The online demo stores media privately and requires sign-in to view evidence. The local version serves uploaded evidence by URL. Complaint descriptions and addresses are publicly viewable, so avoid sensitive information. Notifications are in-app only, and duplicate suggestions are heuristic rather than automatic merges.

The live demo uses free-tier services with usage limits. Replace demo accounts and review privacy, backups and operations before using the project as a real public service.

## Further documentation

- [Functional brief](docs/PS1.md)
- [API reference](docs/API.md)
