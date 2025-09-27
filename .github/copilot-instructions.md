# Copilot instructions for ISweep_wireframe

This project is a very small single-page static website (HTML-only). The guidance below helps AI coding agents be immediately productive when making edits or adding features.

What this repo contains

- `index.html/index.html` — the single HTML document and main artifact.
- `README.md` — a short project description: "making my webpage for my idea".

Project priorities

- Keep the site minimal, semantic HTML-first, and accessible.
- Avoid adding frameworks unless the user requests them.
- Prefer small, incremental changes and explain them in the PR description.

Files & patterns to reference

- `index.html/index.html` — Add markup, classes, and minimal inline CSS or link to a new `styles.css` in a `css/` folder.
- If JS is required, add `js/` and place a small, well-scoped script file; keep `defer` on script tags.

Conventions and decisions discovered here

- Single-page site: changes should not assume multi-page routing or a build system.
- No existing CSS/JS tooling: avoid introducing bundlers or Node-based toolchains unless the user asks.

Typical tasks and how to perform them

- Add a stylesheet: create `css/styles.css`, link it from the head, and keep styles minimal.
- Add a script: create `js/main.js`, reference it with `<script src="js/main.js" defer></script>` at the end of `<body>`.
- Improve accessibility: add `lang` attributes (already present), meaningful `<title>`, landmark roles, and semantic tags.

Examples from this repo

- Head meta viewport is set: keep `meta name="viewport" content="width=device-width, initial-scale=1.0"` as-is.
- The current document is minimal; any new assets should use plain relative paths (e.g., `css/styles.css`).

What not to do

- Do not add package managers, build pipelines, or heavy dependencies without explicit user consent.
- Do not rename `index.html` or move it; keep the site root reachable.

PR guidance

- Describe the user's goal, files changed, and a short test (e.g., "Open `index.html` in a browser and verify header text").
- Keep diffs small and focused.

If you need clarification

- Ask the user whether they want a static enhancement (HTML/CSS/JS) or a move to a framework/build system. Provide options and trade-offs.

Footer: keep edits discoverable and reversible — prefer explicit files (e.g., `css/styles.css`, `js/main.js`) over large config changes.
