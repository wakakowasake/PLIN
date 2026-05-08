# PLIN Coding Notes

## Current Scope
- This repository supports only the web frontend and Firebase Functions backend.
- Do not add Capacitor, Android, React Native, React, or TypeScript here.
- Keep changes minimal and aligned to the current `public/` runtime.

## Runtime Overview
- Main app entry: `public/index.html`
- Public viewer entry: `public/openview.html`
- Main frontend logic: `public/js/ui.js`, `public/js/ui-transit.js`
- Firebase Functions backend: `functions/index.js`
- Shared CSS build: `public/static/css/input.css` -> `public/static/css/style.css`

## Development Workflow
- Use `nvm install 20` and `nvm use 20`
- Install dependencies in the repo root and in `functions/`
- Use `npm run dev`, `npm run build`, `npm run build:css`, `npm run serve`
- Sync the viewer copy with `npm run sync:openview` before deployment when needed

## Implementation Notes
- Prefer updating the current vanilla JS modules instead of introducing new abstractions.
- Authentication is web-only: Google popup first, redirect fallback if popup is blocked.
- Backend config should use `/api` only on localhost and the deployed endpoint elsewhere.
- `functions/openview.html` is a deployment copy, so source-first changes belong in `public/openview.html`.
