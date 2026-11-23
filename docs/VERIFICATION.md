# Verification — 14 November 2026

- Clean package installation succeeded with the lockfile; Prisma Client regenerated successfully.
- `npm run setup` succeeded against both the existing local database and an empty `setup-smoke.db`, creating migrations and seed data from scratch. The disposable smoke database was removed.
- `npx prisma validate` passed.
- Final `npm test`: **16 tests passed, 0 failed**. Tests use their own disposable SQLite database and upload directory.
- Real HTTP coverage: invalid registration/credentials, citizen-only registration, CSRF and RBAC, upload type/size/structure restrictions, report/evidence creation and routing, text duplicate suggestions, filtering, idempotent support, assignment permissions, cross-officer protection, resolution evidence, feedback privacy, reopening, second repair and confirmed closure, personal notifications, idempotent escalation, analytics, staff/department creation and logout.
- Browser verification: citizen sign-in, full report form, nearby suggestion, submission and timeline; admin sign-in, assignment and analytics; desktop/mobile community layout. Mobile at 390px and desktop at 1440px showed no horizontal overflow. Mobile menu supports open, explicit close, outside click and Escape.
- Independent code review found feedback leaking through history and superficial image checks. Regression tests reproduced both, fixes passed, and follow-up review found no remaining blocking findings in those changes.
- JPEG/WebP validation is structural, not a full image decoder or malware scanner. This is a local demo with fictional seeded accounts/data and no government/email/SMS integration.

## Role navigation, Mumbai and video update

- Automated coverage expanded to staff-only navigation/direct-route redirects, Mumbai-only intake, preservation of genuine historical locations during migration, MP4/WebM spoof/size/count/truncation checks, real media fixtures, video persistence and HTTP 206 range playback.
- Browser: officer and admin each show zero Report an issue links and zero Community board links. Staff opening #report redirect to #dashboard. Brand and footer show Mumbai.
- Citizen: city is readonly Mumbai; MP4 selection previews successfully. A labeled demo report was submitted with video. Saved native player loaded a 5.055-second clip without error and played with currentTime advancing.
- New media uses native HTML video; no frontend framework, video-processing dependency or external runtime service was added.

Latest full run: **23 tests passed, 0 failed**. Prisma validation passed. Browser confirmed MP4 playback advancing in the saved report and both staff roles had zero citizen-action links.
