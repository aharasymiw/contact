# conTact WebRTC Lab

An educational full-stack web app that teaches how WebRTC works while also
letting two signed-in users call each other using live browser media devices.

## Stack targets

- Node.js 24.14.1 LTS
- Express 5.2.1
- PostgreSQL 18.3
- TypeScript 6.0.2
- React 19.2.4
- `pg` 8.20.0
- Zod 4.3.6
- Tailwind CSS 4.2.2
- Vite 8.0.3
- Playwright 1.55.1

## Why this app is structured this way

- The Express server owns authentication, PostgreSQL persistence, and the
  signaling API.
- Shared TypeScript modules plus Zod schemas keep the client and server in
  sync on request, response, and event payload shapes.
- The React client owns the media pipeline, `RTCPeerConnection`, and the
  explainer UI that narrates what WebRTC is doing.
- Signaling uses plain HTTP plus Server-Sent Events instead of third-party
  WebSocket packages so the codebase stays inside the package constraints.
- The app targets the browser APIs directly, with no WebRTC abstraction
  libraries, so the tutorial content lines up with the implementation.

## Local setup

1. Copy `.env.example` to `.env` if you need custom PostgreSQL credentials.
2. Start PostgreSQL 18 locally.
3. Run `npm install`.
4. Run `npm run db:setup`.
5. Run `npm run typecheck`.
6. Run `npm run dev`.

To install the repo-managed pre-commit hook that runs lint, format checks, and
tests before each commit, run `npm run hooks:install`.

## End-to-end tests

- Install the browser runtime once with `npx playwright install chromium`.
- Run the full browser suite with `npm run test:e2e`.
- Use `npm run test:e2e:headed` or `npm run test:e2e:debug` when you want to
  watch the flow interactively.
- Playwright boots the real Express + Vite app on `127.0.0.1:3100` and uses a
  dedicated PostgreSQL database named `contact_webrtc_lab_playwright` by
  default.
- Override the end-to-end database with `PGDATABASE_E2E` if you want a
  different isolated test database.

## Continuous integration

- GitHub Actions runs on pushes, pull requests, and manual dispatches.
- The `Quality` job runs install, typecheck, lint, format check, unit tests,
  and the production build.
- The `End To End` job starts PostgreSQL 18, installs Playwright Chromium, and
  runs the browser suite against the real app.

## Notes for the live demo

- Open the app in two browser windows.
- Register two accounts.
- Each user can pick camera, microphone, and speaker targets per call.
- Speaker device switching depends on `HTMLMediaElement.setSinkId()`, which is
  available in Chromium-based browsers but not every browser.
- The demo uses public STUN servers only. That is enough for many local and
  home-network tests, but a production deployment would also need a TURN
  service for harder NAT scenarios.
- Tailwind CSS 4 is compiled through the official `@tailwindcss/vite` plugin.
- The visual system is still intentionally raw-CSS-first, using CSS variables
  for the main design language and leaving Tailwind available where utility
  classes are useful.

## Security notes

- State-changing API routes now enforce same-origin requests by checking
  `Origin` and `Referer`.
- Auth endpoints are rate-limited in-process using `AUTH_RATE_LIMIT_WINDOW_MS`
  and `AUTH_RATE_LIMIT_MAX`.
- HTTP responses include baseline hardening headers such as CSP,
  `X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- Set `APP_ORIGIN` explicitly in production, and configure `TRUST_PROXY` when
  TLS terminates in front of the Node process.
