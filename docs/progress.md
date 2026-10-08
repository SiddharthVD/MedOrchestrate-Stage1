# Progress

Checkpoint: `stage1-demo-v1` (local Git tag), 8 October 2026.

Changed files: local Flask API, lexical search, fictional fixture, five view interface, strict date and input validation, citation importer, fixture evaluation, launcher, tests, and demonstration documentation.

Verified: 13 unit/API tests passed. `python launch.py` served local HTTP page/assets/status/search/compare/evaluation requests. The fixture has 3 cases, 12 invented records, and 6 hand-labeled fictional evaluation queries. Pending: interactive browser QA, real corpus, external benchmark evaluation, neural routes, learned routing, LoRA, and manuscript.

Smallest next task after Stage 1 browser acceptance: verify a permitted biomedical benchmark and freeze corpus/qrels/splits before implementing strong fixed retrieval baselines.

9 October 2026: Added a separate browser-only `site/` edition for GitHub Pages, a comprehensive project guide, and an Actions test/deploy workflow. The public edition uses the same fictional JSON fixture and does not run the Flask API or local citation import. `node site/smoke.mjs` passed and the static Evaluation view displayed 4/4 operational checks in a local browser. Python's 13 tests passed again. Public deployment remains to be verified.
