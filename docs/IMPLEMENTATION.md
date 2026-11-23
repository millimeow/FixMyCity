# Fix My City design and implementation plan

Goal: the complete local civic reporting system from PS1.md with no map or heatmap.
Architecture: Express MVC serves static HTML/CSS/vanilla JavaScript and JSON API. Prisma models SQLite; Node crypto, fs, path, HTTP and Events provide credentials, sessions, uploads and application events. Only Express, Prisma and Prisma Client are dependencies.

File ownership: prisma/schema.prisma and migrations model users, sessions, departments, categories, complaints, evidence, history, support, feedback and notifications. src/services owns transactional operations, duplicates and escalation; src/middleware owns authentication, CSRF and RBAC; src/controllers and src/routes expose HTTP; public is the responsive UI; tests uses real HTTP against isolated SQLite.

- [x] Write failing HTTP tests for auth, complaint lifecycle, uploads, permissions, feedback, support, notifications, escalation and administration.
- [x] Implement persistent opaque sessions and scrypt hashes; citizen-only registration, throttling and CSRF.
- [x] Implement complaint routing, assignments, legal status transitions, evidence, feedback and reopening as transactions.
- [x] Implement idempotent notifications/escalation, duplicate scoring without mapping and staff analytics.
- [x] Build community board, report form, role workspaces, timeline, inbox and administration.
- [x] Run fresh setup, automated tests, desktop/mobile checks; document run commands, accounts, API and limitations.

Review focus: privilege escalation; cross-officer access; malformed/oversized images; repeated support/escalation; reopening deadlines and history.

Design: Operate mode. Warm white, forest green, charcoal and amber. Compact sidebar and community issue queue, strong report action, readable timelines. Native typography and authored geometric SVG category symbols. No remote assets. Mumbai, Maharashtra; assume with text wards, 72-hour normal and 24-hour urgent SLA; optional coordinates enable distance suggestions without maps/geocoding. Photos only, per final request.
