# Progress

Checkpoint: `stage1-demo-v1` (local Git tag), 8 October 2026.

Changed files: local Flask API, lexical search, fictional fixture, five view interface, strict date and input validation, citation importer, fixture evaluation, launcher, tests, and demonstration documentation.

Verified: 13 unit/API tests passed. `python launch.py` served local HTTP page/assets/status/search/compare/evaluation requests. The fixture has 3 cases, 12 invented records, and 6 hand-labeled fictional evaluation queries. Pending: interactive browser QA, real corpus, external benchmark evaluation, neural routes, learned routing, LoRA, and manuscript.

Smallest next task after Stage 1 browser acceptance: verify a permitted biomedical benchmark and freeze corpus/qrels/splits before implementing strong fixed retrieval baselines.

9 October 2026: Added a separate browser-only `site/` edition for GitHub Pages, a comprehensive project guide, and an Actions test/deploy workflow. The public edition uses the same fictional JSON fixture and does not run the Flask API or local citation import. `node site/smoke.mjs` passed and the static Evaluation view displayed 4/4 operational checks in a local browser. Python's 13 tests passed again. Public deployment remains to be verified.

9 October 2026: Pushed the full tracked project to the public `SiddharthVD/MedOrchestrate-Stage1` repository. GitHub Actions completed the Python and static checks, deployed `site/` through Pages, and reported success. The public URL loaded in a browser; its Evidence Search returned ranked fictional records, and Evaluation displayed 4/4 operational checks. Local Flask interactive browser acceptance and any real-corpus research remain separate follow-up work.

9 October 2026, Stage 2: Selected the BEIR transformed NFCorpus package after reviewing the original owner's academic-use terms. Added a pinned and verified local download, frozen file hashes and disjoint split checks, a fixed direct BM25 run, aggregate evaluation reports, local benchmark API/UI, and an aggregate-only public results card. The dataset and raw TREC runs remain in ignored local storage. Evaluated 323 judged test queries over 3,633 records: Recall/MRR/nDCG at 5 = 0.120006/0.507534/0.336423; at 10 = 0.151758/0.515477/0.309963. All 21 Python tests and the static site smoke pass. Neural retrieval, trained routing, patient-aware evaluation, and manuscript remain future work.

9 October 2026, training planning: Added `research/TRAINING_PLAN.md` for a small real-data bi-encoder experiment, train/dev/test separation, rights and resource gates, and a later patient-context dataset review. No model or training dependencies were installed and no weights were produced. Local train qrels contain positive grades only, so candidate negatives require explicit uncertainty handling.
