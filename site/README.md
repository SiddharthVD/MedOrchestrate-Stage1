# MedOrchestrate static demonstration

This directory is a browser-only version of the five-view workbench for GitHub Pages. It runs direct BM25, deterministic case-fact expansion, adaptive rule selection, route comparison, and fixture evaluation in JavaScript. It fetches the three fictional fixture files and two aggregate research summaries in `data/`; no Python process or external API is required.

All cases, records, and relevance judgments are invented. The metrics demonstrate software behavior only. Local citation import via CLI is available in the Flask project, not on this public static site.

The Evaluation view also shows separate read-only real-data checkpoints: Stage 2 direct BM25 metrics and the later trained MiniLM comparison from the BEIR NFCorpus test split. The only real-data results in this directory are aggregate JSON summaries. The corpus, query text, judgments, raw rankings, and model weights remain local. The browser demo does not execute the trained model; each card links to its research protocol or report.

To verify the committed fixture and retrieval behavior from the project root:

```sh
node site/smoke.mjs
```

To preview locally, serve this directory over HTTP (for example `python -m http.server 8000 --directory site`) and open `http://127.0.0.1:8000/`. Opening `index.html` directly as a `file://` URL may block JSON requests in browsers.
