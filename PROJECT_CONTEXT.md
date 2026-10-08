# MedOrchestrate project context

## Purpose

College major project exploring whether patient aware and cost aware selection among retrieval routes can improve relevance or preserve relevance with less work. The formal research question remains untested.

Academic title from the handoff: **An Adaptive AI Framework for Orchestrating Retrieval-Augmented and Fine-Tuned Models for Personalized Healthcare Information Retrieval.**

## Current stage

Stage 1 local demonstration, started from scratch on 8 October 2026 after Siddharth confirmed that no existing code repository exists. The project currently uses fictional cases and invented records only. The 9 October 2026 faculty presentation is the immediate checkpoint; later research phases have evidence gates rather than fixed dates.

## Confirmed scope

- Local workbench for fictional patient context, question based evidence retrieval, ranked results, and an execution trace.
- CPU friendly lexical retrieval and a transparent adaptive rule for the first demonstration.
- No clinical assessment, diagnosis, treatment recommendations, real patient uploads, or clinical effectiveness claims.
- No paid services, model training, publication, or data upload authorized.

## Deliverables

- App: `medorchestrate/`, `templates/`, `static/`, `data/`.
- Tests: `tests/`; raw results: `artifacts/demo/`.
- Demo and audit: `docs/`; research candidate notes: `research/`.
- Source handoff: `docs/MedOrchestrate_Codex_Handoff.docx`.

## Next gate

Select an appropriately licensed public biomedical benchmark with compatible corpus and judgments. Define its exact task, partitions, and comparison budget before claiming a research result. See `research/benchmark_candidates.md`.
