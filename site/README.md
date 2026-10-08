# MedOrchestrate static demonstration

This directory is a browser-only version of the five-view workbench for GitHub Pages. It runs direct BM25, deterministic case-fact expansion, adaptive rule selection, route comparison, and fixture evaluation in JavaScript. It fetches only the three committed JSON files in `data/`; no Python process or external API is required.

All cases, records, and relevance judgments are invented. The metrics demonstrate software behavior only. Local citation import via CLI is available in the Flask project, not on this public static site.

The Evaluation view also shows a separate read-only Stage 2 checkpoint: aggregate counts and fixed direct BM25 metrics from the real BEIR NFCorpus test split. The only Stage 2 data in this directory is `data/benchmark_summary.json`. The corpus, query text, judgments, and per-query run files remain local. The card links to the public research protocol in the repository.

To verify the committed fixture and retrieval behavior from the project root:

```sh
node site/smoke.mjs
```

To preview locally, serve this directory over HTTP (for example `python -m http.server 8000 --directory site`) and open `http://127.0.0.1:8000/`. Opening `index.html` directly as a `file://` URL may block JSON requests in browsers.
