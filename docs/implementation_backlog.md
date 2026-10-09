# Implementation backlog

| Status | Task | Acceptance evidence |
| --- | --- | --- |
| COMPLETED | Local fictional fixture and lexical demo | Search and compare API output and 13 passing tests |
| COMPLETED | Five view workbench shell and route trace | Local page/API smoke; browser QA pending |
| COMPLETED | Confirm project starting point | Siddharth confirmed no existing code repository |
| COMPLETED | Stage 1 fixture evaluation | Six invented queries; raw Recall@5, MRR@5, nDCG@5 report |
| COMPLETED | Local Flask browser acceptance | Eight browser acceptance checks: offline demo, cases/search, comparison/evaluation, live backend, errors without fallback, sessions and mobile layout |
| COMPLETED | Public Stage 1 demo | Pages workflow passed; live search and 4/4 diagnostic checks verified in browser |
| COMPLETED | Real corpus and compatible qrels | NFCorpus source/rights note, pinned archive and file hashes, disjoint splits, local manifest |
| COMPLETED | Fixed lexical benchmark | Direct BM25 TREC run and aggregate test Recall/MRR/nDCG at 5 and 10 |
| COMPLETED | First real-data bi-encoder feasibility run | 509 positive train pairs, saved local weights, frozen dev selection and test comparison; `research/TRAINING_RUN.md` |
| BACKLOG | Broader training and independent holdout | More train queries, repeated seeds, external holdout, rights and cost review |
| COMPLETED | First dense and hybrid fixed comparators | Repeatable NFCorpus dev/test rankings and aggregate metrics; end-to-end cost accounting remains |
| BACKLOG | Learned cost aware controller | Disjoint splits and full call accounting |
| BACKLOG | Base and LoRA query rewriting | Feasible local model and actual adapter weights |
| BACKLOG | Formal experiments and paper | Frozen runs, uncertainty, ablations, citations |
| COMPLETED LOCALLY | Topic-first lexical real research search | 225 licensed study records, source-provided links, local Europe PMC endpoint, filters and browser acceptance; public deployment deferred |
| COMPLETED LOCALLY | Study-concept graph and collections | Source-backed indexing/mention edges, graph and connection list, saved citations, reload, export and study comparison |
| COMPLETED | Browser trained-model acceptance | Six-text CPU/WASM parity with matched batches, full-snapshot semantic and RRF60 hybrid browser tests |
| PLANNED | Richer biomedical assertions | Canonical vocabulary IDs, contextual assertions with evidence, review state and held-out annotation audit |
| PLANNED | Graph-assisted retrieval and live backend | Frozen evaluation against fixed routes, full resource accounting, separately reviewed backend hosting |

| COMPLETED PILOT | Contextual biomedical relationships | Nine exact source-reported assertions; populations, designs, negative findings and limitations; not medically reviewed |
