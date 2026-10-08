# MedOrchestrate source audit

Date: 8 October 2026.

## Source found

The supplied handoff is `C:\Users\SIDDHARTH\Downloads\MedOrchestrate_Codex_Handoff.docx`. The only MedOrchestrate folder found locally during this task was `C:\Users\SIDDHARTH\OneDrive\College Work\MedOrchestrate`. It contained `PROJECT_CONTEXT.md` and no Git repository, application code, tests, or data. The handoff's reported 45 cases, 60 documents, and 33 passing tests could not be verified against an existing codebase.

Siddharth confirmed on 8 October 2026 that no existing code repository exists. This is a new Stage 1 project created from scratch in the Codex output workspace.

## Verified in this prototype

- Three fictional cases and 12 invented records in `data/`.
- Direct BM25, deterministic patient fact expansion, and a rule based adaptive choice in `medorchestrate/search.py`.
- Five views and source/route trace display in `templates/` and `static/`.
- Date filtering on fictional facts and explicit rejection of unavailable routes.
- Thirteen passing unit/API and retrieval checks from `python -m unittest discover -s tests -v`.
- Genuine HTTP `200` page, asset, status, search, compare, and evaluation checks after `python launch.py`, with raw results in `artifacts/demo/`.
- Strict `YYYY-MM-DD` validation prevents future fact leakage from compact or week dates.
- Six hand-labeled fictional queries support a smoke evaluation of Recall@5, MRR@5 and nDCG@5.
- Local citation metadata import validates format and dates but does not verify authenticity.

## Partial or missing

- The demo fixture has no real literature provenance or independent judgments. Its hand-labeled qrels are suitable only for software smoke tests.
- Dense retrieval, hybrid fusion, shared reranking, learned router, model rewriting, LoRA, formal evaluation, and paper are not implemented.
- No original codebase, model artifacts, or previously reported tests existed to audit.
- System inspection reported 16.8 GB total RAM, approximately 2.2 GB available RAM at capture, and approximately 10.5 GB free disk. GPU model/runtime compatibility was not verified because CIM/display enumeration was unavailable. See `artifacts/demo/environment.json`.
- A local HTTP request returned 200 when executed outside the shell sandbox. The Codex in-app browser blocked the preview, so interactive browser QA remains pending. `start.cmd` opens the default browser on the user's machine after server binding.
