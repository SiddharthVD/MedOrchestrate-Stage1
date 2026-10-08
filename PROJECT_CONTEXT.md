# MedOrchestrate project context

## Purpose

College major project exploring whether patient aware and cost aware selection among retrieval routes can improve relevance or preserve relevance with less work. The formal research question remains untested.

Academic title from the handoff: **An Adaptive AI Framework for Orchestrating Retrieval-Augmented and Fine-Tuned Models for Personalized Healthcare Information Retrieval.**

## Current stage

Stage 1 local and public demonstration was built from scratch after Siddharth confirmed there was no existing code repository. Stage 2 adds a local, fixed BM25 benchmark on BEIR transformed NFCorpus. A later local CPU run fine-tuned MiniLM on 509 NFCorpus train pairs and compared four retrieval routes. The public workbench still searches only fictional cases and records; its research cards show aggregate real-data metrics. The formal patient-aware research question remains untested.

## Confirmed scope

- Local workbench for fictional patient context, question based evidence retrieval, ranked results, and an execution trace.
- CPU friendly lexical retrieval and a transparent adaptive rule for the first demonstration.
- No clinical assessment, diagnosis, treatment recommendations, real patient uploads, or clinical effectiveness claims.
- No paid services, real patient uploads, or clinical claims. The later MiniLM training run and its weights remain local; project source and aggregate benchmark metrics are public.

## Deliverables

- App: `medorchestrate/`, `templates/`, `static/`, `data/`.
- Tests: `tests/`; aggregate results: `artifacts/demo/`, `artifacts/benchmark/`, and `artifacts/training/`; ignored real data and raw runs: `data/benchmark/`; ignored model weights: `models/`.
- Demo and audit: `docs/`; research candidate notes: `research/`.
- Source handoff: `docs/MedOrchestrate_Codex_Handoff.docx`.

## Next gate

Preserve the frozen BM25 and first trained MiniLM comparisons. A stronger result needs repeated seeds and a fresh independent holdout. Patient-aware claims require a separate dataset with patient context and independently judged relevance. See `research/TRAINING_RUN.md` and `docs/PROJECT_GUIDE.md`.
