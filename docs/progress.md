# Progress

Checkpoint: `stage1-demo-v1` (local Git tag), 8 October 2026.

Changed files: local Flask API, lexical search, fictional fixture, five view interface, strict date and input validation, citation importer, fixture evaluation, launcher, tests, and demonstration documentation.

Verified: 13 unit/API tests passed. `python launch.py` served local HTTP page/assets/status/search/compare/evaluation requests. The fixture has 3 cases, 12 invented records, and 6 hand-labeled fictional evaluation queries. Pending: interactive browser QA, real corpus, external benchmark evaluation, neural routes, learned routing, LoRA, and manuscript.

Smallest next task after Stage 1 browser acceptance: verify a permitted biomedical benchmark and freeze corpus/qrels/splits before implementing strong fixed retrieval baselines.

9 October 2026: Added a separate browser-only `site/` edition for GitHub Pages, a comprehensive project guide, and an Actions test/deploy workflow. The public edition uses the same fictional JSON fixture and does not run the Flask API or local citation import. `node site/smoke.mjs` passed and the static Evaluation view displayed 4/4 operational checks in a local browser. Python's 13 tests passed again. Public deployment remains to be verified.

9 October 2026: Pushed the full tracked project to the public `SiddharthVD/MedOrchestrate-Stage1` repository. GitHub Actions completed the Python and static checks, deployed `site/` through Pages, and reported success. The public URL loaded in a browser; its Evidence Search returned ranked fictional records, and Evaluation displayed 4/4 operational checks. Local Flask interactive browser acceptance and any real-corpus research remain separate follow-up work.

9 October 2026, Stage 2: Selected the BEIR transformed NFCorpus package after reviewing the original owner's academic-use terms. Added a pinned and verified local download, frozen file hashes and disjoint split checks, a fixed direct BM25 run, aggregate evaluation reports, local benchmark API/UI, and an aggregate-only public results card. The dataset and raw TREC runs remain in ignored local storage. Evaluated 323 judged test queries over 3,633 records: Recall/MRR/nDCG at 5 = 0.120006/0.507534/0.336423; at 10 = 0.151758/0.515477/0.309963. All 21 Python tests and the static site smoke pass. Neural retrieval, trained routing, patient-aware evaluation, and manuscript remain future work.

9 October 2026, training planning: Added `research/TRAINING_PLAN.md` for a small real-data bi-encoder experiment, train/dev/test separation, rights and resource gates, and a later patient-context dataset review. No model or training dependencies were installed and no weights were produced. Local train qrels contain positive grades only, so candidate negatives require explicit uncertainty handling.

9 October 2026, first training run: Installed an optional CPU training environment, pinned MiniLM revision and package versions, trained on 509 sampled NFCorpus train pairs in 81 steps (77.9 seconds), and saved local weights. Development queries selected the fixed BM25 + trained dense RRF60 route. One locked test run over 323 queries gave nDCG@10 0.340181 versus BM25 0.309963; trained dense alone gave 0.319476 and lower MRR than BM25. Aggregate reports, run hashes, costs, paired uncertainty and limitations are in `research/TRAINING_RUN.md`. This is literature retrieval, not patient-aware evaluation; an independent holdout and patient-context dataset remain future work.

9 October 2026, expanded scope planning: User selected students/researchers for a requested research knowledge graph. Added `docs/KNOWLEDGE_GRAPH_PLAN.md` with topic-first real study search, disease/symptom/intervention/study/concept schema, contextual evidence provenance, source/rights choices, graph UI and collections, architecture/hosting limits, staged acceptance and evaluation. The plan also explains the current small fictional corpus and disconnected local model as reasons the public experience feels narrow. No graph, source ingestion or hosted model API was implemented in this change.
