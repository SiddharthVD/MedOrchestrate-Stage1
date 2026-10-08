# MedOrchestrate static demonstration

This directory is a browser-only version of the five-view workbench for GitHub Pages. It runs direct BM25, deterministic case-fact expansion, adaptive rule selection, route comparison, and fixture evaluation in JavaScript. It fetches only the three committed JSON files in `data/`; no Python process or external API is required.

All cases, records, and relevance judgments are invented. The metrics demonstrate software behavior only. Local citation import via CLI is available in the Flask project, not on this public static site.

To verify the committed fixture and retrieval behavior from the project root:

```sh
node site/smoke.mjs
```

To preview locally, serve this directory over HTTP (for example `python -m http.server 8000 --directory site`) and open `http://127.0.0.1:8000/`. Opening `index.html` directly as a `file://` URL may block JSON requests in browsers.
