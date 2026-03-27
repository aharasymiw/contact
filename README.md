# conTact WebRTC Lab

An educational full-stack web app that teaches how WebRTC works while also
letting two signed-in users call each other using live browser media devices.

## Stack targets

- Node.js 24.14.1 LTS
- Express 5.2.1
- PostgreSQL 18.3
- React 19.2.4
- `pg` 8.20.0
- Tailwind CSS 4.2.2
- Vite 8.0.3

## Why this app is structured this way

- The Express server owns authentication, PostgreSQL persistence, and the
  signaling API.
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
5. Run `npm run dev`.

To install the repo-managed pre-commit hook that runs lint, format checks, and
tests before each commit, run `npm run hooks:install`.

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
