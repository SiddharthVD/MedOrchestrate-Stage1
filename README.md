# MedOrchestrate

Research prototype of a patient aware medical literature retrieval workbench. Stage 1 uses fictional cases and invented evidence records to demonstrate route selection, ranking, and execution traces. Stage 2 adds a real, locally evaluated fixed BM25 baseline on NFCorpus. A subsequent local experiment trained a small MiniLM retriever on NFCorpus train judgments and compared it with BM25 and a fixed hybrid. It is **not** a clinical tool or a validated patient-aware retrieval system.

Read the [project guide](docs/PROJECT_GUIDE.md) for the purpose, implemented scope, limitations, future research gates, and next steps. The public `site/` edition runs entirely in the browser with the fictional fixture; the local Flask workbench includes the API and command-line citation import.

The local workspace now defaults to **Demo Data**, using the existing fictional fixtures without an external internet connection or AI API. **Live API** explicitly connects to the existing local Flask case/search/compare/evaluation endpoints; failures never switch silently to demo data. The dashboard shows the active engine, unavailable routes and recent browser-local sessions. Case and cutoff selectors are available beside search, and edited questions are marked exploratory and unscored.

The optional local [real-literature explorer](http://127.0.0.1:8000/research/) searches a separately licensed 225-record Europe PMC snapshot. It includes an interactive study/concept graph, source/full-text/PDF links where supplied, saved citation collections, JSON/BibTeX/RIS export and study comparison. Live Europe PMC discovery uses the local research API and requires an explicit source selection. Graph edges represent indexing or literal mentions, not treatment or causal claims. Some external page/PDF checks return HTTP 403; source-provided links are not a guarantee of accessibility. The [scope plan](docs/KNOWLEDGE_GRAPH_PLAN.md) describes richer assertions and later research gates.

The user's latest time-limited local-workspace instructions defer cloud deployment and large-scale neural integration. An export of the existing trained model and pilot embeddings has been prepared locally; browser inference is **not acceptance-verified** in this session. No new training or large evaluation was run. The existing public Pages deployment has not been updated with these local changes.

**Live fictional demo:** [Open MedOrchestrate Stage 1](https://siddharthvd.github.io/MedOrchestrate-Stage1/).

## Run locally

On Windows, double-click `start.cmd`. It starts the server, waits until it is ready, and opens the default browser. Keep its terminal window open while using the workbench.

Alternatively, from this folder run:

```powershell
python -m pip install -r requirements.txt
python launch.py
```

Open http://127.0.0.1:8000. Python 3.10 or newer is recommended.

Run the included checks:

```powershell
python -m unittest discover -s tests -v
node site/smoke.mjs
node static/workspace-smoke.cjs
node site/research-smoke.mjs
```

## Demonstration

Select **Fictional type 2 diabetes case**. Keep the date at `2026-10-08`. In Medical Evidence Search, run the suggested question with the adaptive rule. The rule expands a short query with available case facts and executes BM25 over 12 invented records. Inspect the ranked results and trace. Strategy Comparison runs direct BM25 and the adaptive route on the same input.

The fixture records deliberately have no external links. They are software test material, not published papers. The trained dense and hybrid routes run in the separate local benchmark experiment; the interactive fictional demo still uses lexical routes. Model rewriting, LoRA, and trained patient-aware routing remain pending.

## Stage 2 real benchmark

The local Python workbench now accepts a frozen BEIR-format NFCorpus dataset for an independent **fixed direct BM25** evaluation. The real data, fictional cases, and fictional qrels are kept separate. The NFCorpus dataset is not included in this public repository or GitHub Pages site because the original owner permits academic use but does not clearly authorize public redistribution.

Follow the [Stage 2 protocol](research/STAGE2_PROTOCOL.md) to download the pinned archive, verify its hashes, freeze the manifest, and reproduce the test run. The first run evaluated 323 judged test queries over 3,633 documents. The [aggregate results at 5](artifacts/benchmark/nfcorpus-bm25-k5.json) and [at 10](artifacts/benchmark/nfcorpus-bm25-k10.json) are included with provenance and run hashes. These scores describe literature retrieval on NFCorpus; it has no dated patient cases or patient-specific judgments. No model has been trained in Stage 2.

The [real-data training plan](research/TRAINING_PLAN.md) sets out the experiment, split and rights checks, honest comparisons, and a separate gate for patient-aware research. Its first local experiment is complete.
The [training run report](research/TRAINING_RUN.md) records the completed 509-pair CPU run, the dev-selected hybrid, all four test comparators, costs, and limitations. The selected hybrid reached nDCG@10 **0.340181** versus BM25 **0.309963** on NFCorpus test queries. The trained dense route alone had lower MRR than BM25. Only aggregate results and hashes are public; model weights remain local.

The Research Evaluation view computes Recall@5, MRR@5 and nDCG@5 for six hand-labeled questions about the invented records. These numbers verify the evaluation code and do not measure clinical relevance. The same raw run can be saved with `python -m medorchestrate.evaluate --output artifacts/demo/fixture_evaluation.json`.

To search separately imported citation metadata, provide a local JSONL file with `id`, `title`, `abstract`, `source`, `year`, `published_on` (`YYYY-MM-DD`), `source_type`, and an HTTP(S) `url`. Run `python -m medorchestrate.corpus path/to/records.jsonl`, then select the imported corpus in the workbench. The importer checks field format, dates, IDs, and URLs; it does not verify that the citations or links are genuine. Do not import patient information.

## Components

| Module | Input | Output | Example |
| --- | --- | --- | --- |
| Case loader | Fictional case ID and date | Facts available by that date | Albuminuria is hidden before 2026-09-01. |
| Query expansion | Question and available facts | Additional search terms | A short diabetes query gains kidney related terms. |
| BM25 | Query and fixture records | Ranked matching records | A kidney query ranks kidney records. |
| Adaptive rule | Question length and available facts | Chosen lexical route | A short question with facts selects expanded BM25. |
| Trace | Executed route and calls | Inspectable JSON | Shows one retrieval call and terms added. |

## Current research limit

The fixture has only hand-labeled judgments for invented records, with no independent clinical review. Ranking changes, fixture metrics, and local latency cannot establish that adaptive selection improves medical relevance. NFCorpus now supports fixed BM25, trained dense, and hybrid comparisons for literature retrieval. The next research milestone is a fresh independent holdout and a suitable dataset with patient context and independently judged relevance for the adaptive question.

See [the audit](docs/audit_report.md), [progress](docs/presentation_progress.md), and [demo guide](docs/final_demo_guide.md).
