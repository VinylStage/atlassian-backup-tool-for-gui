# Roadmap

## Done

| Version | Item |
|---------|------|
| 1.1.1 | PDF browser resolution with fallback and coded errors (`PDF_BROWSER_NOT_FOUND` / `PDF_BROWSER_LAUNCH_FAILED`) |
| 1.1.1 | Client error localization (ko/en) with request id |
| 1.1.1 | Standard logging: OS log dir, JSON Lines, rotation, request id, access log |
| 1.1.1 | All dependencies latest, Node 24 baseline, npm audit 0 |
| 1.1.0 | Metadata include/exclude option |

## Next

| Priority | Item | Note |
|----------|------|------|
| High | ESLint flat config (`eslint.config.js`) | `npm run lint` fails since ESLint 9+ (no config in repo, pre-existing) |
| High | Unit tests (browser resolution, error localization, logger config) | no test runner in repo yet |
| Medium | Localize remaining server/client messages (validation, Confluence errors) via error codes | currently only PDF browser errors are coded |
| Medium | Surface per-page PDF conversion failures | currently logged as `warn`, ZIP returned with fewer PDFs |
| Low | UI language toggle (override `navigator.languages`) | |
