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
| PLANNED | Train small real-data bi-encoder | `research/TRAINING_PLAN.md`; implementation, actual weights, and measured results pending |
| BACKLOG | Dense and hybrid fixed baselines | Repeatable rankings with matched budget |
| BACKLOG | Learned cost aware controller | Disjoint splits and full call accounting |
| BACKLOG | Base and LoRA query rewriting | Feasible local model and actual adapter weights |
| BACKLOG | Formal experiments and paper | Frozen runs, uncertainty, ablations, citations |
