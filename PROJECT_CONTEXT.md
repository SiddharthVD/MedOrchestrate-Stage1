# MedOrchestrate project context

## Purpose

College major project exploring whether patient aware and cost aware selection among retrieval routes can improve relevance or preserve relevance with less work. The formal research question remains untested.

Academic title from the handoff: **An Adaptive AI Framework for Orchestrating Retrieval-Augmented and Fine-Tuned Models for Personalized Healthcare Information Retrieval.**

## Current stage

Stage 1 local and public demonstration was built from scratch after Siddharth confirmed there was no existing code repository. Stage 2 adds a local, fixed BM25 benchmark on BEIR transformed NFCorpus. The public workbench still searches only fictional cases and records; its Stage 2 card shows aggregate benchmark metrics. The formal patient-aware research question remains untested.

## Confirmed scope

- Local workbench for fictional patient context, question based evidence retrieval, ranked results, and an execution trace.
- CPU friendly lexical retrieval and a transparent adaptive rule for the first demonstration.
- No clinical assessment, diagnosis, treatment recommendations, real patient uploads, or clinical effectiveness claims.
- No paid services, model training, real patient uploads, or clinical claims in Stage 2. The project source and aggregate benchmark metrics are published on GitHub; real benchmark source files stay local.

## Deliverables

- App: `medorchestrate/`, `templates/`, `static/`, `data/`.
- Tests: `tests/`; aggregate results: `artifacts/demo/` and `artifacts/benchmark/`; ignored real data and raw runs: `data/benchmark/`.
- Demo and audit: `docs/`; research candidate notes: `research/`.
- Source handoff: `docs/MedOrchestrate_Codex_Handoff.docx`.

## Next gate

Preserve the frozen NFCorpus BM25 baseline and its protocol, then implement fixed dense and hybrid baselines with matched evaluation. Patient-aware claims require a separate dataset with patient context and independently judged relevance. See `research/STAGE2_PROTOCOL.md` and `docs/PROJECT_GUIDE.md`.
