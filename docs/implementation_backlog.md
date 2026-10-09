# Implementation backlog

| Status | Task | Acceptance evidence |
| --- | --- | --- |
| COMPLETED | Local fictional fixture and lexical demo | Search and compare API output and 13 passing tests |
| COMPLETED | Five view workbench shell and route trace | Local page/API smoke; browser QA pending |
| COMPLETED | Confirm project starting point | Siddharth confirmed no existing code repository |
| COMPLETED | Stage 1 fixture evaluation | Six invented queries; raw Recall@5, MRR@5, nDCG@5 report |
| IN PROGRESS | Local Flask browser acceptance | Page/API smoke passed; interactive Flask browser walkthrough remains |
| COMPLETED | Public Stage 1 demo | Pages workflow passed; live search and 4/4 diagnostic checks verified in browser |
| COMPLETED | Real corpus and compatible qrels | NFCorpus source/rights note, pinned archive and file hashes, disjoint splits, local manifest |
| COMPLETED | Fixed lexical benchmark | Direct BM25 TREC run and aggregate test Recall/MRR/nDCG at 5 and 10 |
| COMPLETED | First real-data bi-encoder feasibility run | 509 positive train pairs, saved local weights, frozen dev selection and test comparison; `research/TRAINING_RUN.md` |
| BACKLOG | Broader training and independent holdout | More train queries, repeated seeds, external holdout, rights and cost review |
| COMPLETED | First dense and hybrid fixed comparators | Repeatable NFCorpus dev/test rankings and aggregate metrics; end-to-end cost accounting remains |
| BACKLOG | Learned cost aware controller | Disjoint splits and full call accounting |
| BACKLOG | Base and LoRA query rewriting | Feasible local model and actual adapter weights |
| BACKLOG | Formal experiments and paper | Frozen runs, uncertainty, ablations, citations |
| PLANNED | Topic-first real research search | Permitted study pilot, actual source links, cached local trained-model/BM25 search; `docs/KNOWLEDGE_GRAPH_PLAN.md` |
| PLANNED | Research knowledge graph | Canonical concepts, source-backed study links, bounded interactive explorer and accessible list view |
| PLANNED | Research collections and richer assertions | Saved studies/citation export; contextual assertions with evidence, review state and held-out annotation audit |
| PLANNED | Graph-assisted retrieval and live backend | Frozen evaluation against fixed routes, full resource accounting, separately reviewed backend hosting |
