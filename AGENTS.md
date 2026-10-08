# Project instructions

MedOrchestrate is a local research prototype. The immediate milestone is a repeatable Stage 1 faculty demonstration. The workbench uses fictional cases and an invented fixture. Never describe its records, judgments, or rankings as clinical evidence or a measured research improvement.

Before editing, inspect the current files and tests. Preserve working behavior and user changes. Keep routes and response schemas honest: unavailable dense, hybrid, neural rewrite, and LoRA routes must remain unavailable until actual implementations and artifacts exist.

Use dated facts only when available by the query date. Keep imported citation metadata separate from the fictional fixture, and do not infer authenticity from a URL field. Do not combine fixture qrels with another corpus. No real patient data, paid service, large model download, upload, or publication is assumed.

Run relevant tests and a page/API smoke after changes. Update `docs/progress.md`, `docs/decisions.md`, and the backlog with actual outcomes and limitations. Keep research claims tied to a frozen dataset, compatible qrels, run manifest, and genuine outputs.

For concurrent work, one owner per file. Backend owns `medorchestrate/`, `data/`, and backend tests; frontend owns `templates/` and `static/`; the lead integrates shared docs, startup, and acceptance checks. Reviewers may run read-only checks.
