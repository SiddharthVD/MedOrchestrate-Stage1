# Real-data model training plan

## Goal and claim boundary

Train a small **bi-encoder retriever** to rank medical literature for NFCorpus questions, compare it with the frozen direct BM25 baseline, and then decide whether more complex retrieval is justified. This experiment measures literature retrieval. NFCorpus has no dated patient cases or patient-specific relevance judgments, so it cannot validate the project's patient-aware controller or clinical use.

The immediate deliverable is a reproducible local training run, a saved model and run manifest, development-set comparisons, and one frozen test comparison. A learned patient-aware route is a separate research track requiring patient-context queries with independently assessed document relevance.

## Starting point and constraints

- The pinned BEIR transformed NFCorpus package is already downloaded locally and hash-verified under ignored `data/benchmark/`. It contains 3,633 documents, 3,237 total queries, and 2,590/324/323 judged train/dev/test queries. Keep the archive, text, qrels, raw rankings, and trained weights out of the public repository pending a specific redistribution review. The original owner permits academic use; BEIR does not grant dataset rights on its behalf. Cite Boteva et al. and BEIR.
- The training qrels in this local edition contain positive grades only. Unjudged documents are **unknown**, not verified irrelevant. Contrastive in-batch negatives and BM25-mined candidates can contain false negatives. Deduplicate positive document IDs within each batch, avoid pairing a query with one of its other known positives as a negative, and document this limitation.
- Stage 2 has already reported test BM25 scores. Treat those as a published checkpoint, not as a tuning signal. Make all model and threshold choices on train/dev only; run the selected training recipe on test once. For any stronger later claim, obtain a fresh independent holdout or external dataset.
- The machine has about 9 GB free on the project drive. GPU support has not been established; `nvidia-smi` and PyTorch are unavailable in the current environment. Keep a CPU-capable first run and measure actual memory, time, and disk use before scaling up.

## Work sequence

| Gate | Work | Exit evidence |
| --- | --- | --- |
| 1. Freeze training inputs | Reuse the Stage 2 loader and hashes. Export train-positive query/document ID pairs locally; assert every pair belongs to train qrels and every dev/test query ID is absent. Record exact document text construction, truncation, seed, and package/model revisions. | Versioned training config and validation report with counts, split checks, and hashes; no benchmark text committed. |
| 2. Untuned comparator | Load one compact, permitted pretrained sentence encoder and index all 3,633 documents. Run it **without fine-tuning** on dev, alongside fixed BM25. Select the model for feasible CPU runtime and documented weights/license, not dev performance alone. | Saved dev rankings, Recall/MRR/graded nDCG at 5 and 10, elapsed time, peak memory, model provenance. |
| 3. First trained model | Fine-tune the same encoder on train-positive query/document pairs with a contrastive ranking loss. Start with a capped, seeded sample and short pilot; use duplicate-free batches and a conservative text length. Add hard negatives only after auditing likely false negatives. Save a local checkpoint each epoch. | A real weight delta and training log; reproducible seed/config; no out-of-memory or storage failure. |
| 4. Select on dev | Compare trained dense retrieval, untuned dense retrieval, BM25, and a fixed BM25+dense fusion on the 324 dev queries. Choose one model checkpoint and fusion weight using dev only. Report paired query-level differences and uncertainty; include retrieval and model load costs. | Signed-off frozen config specifying metric priority, cutoff, checkpoint hash, fusion rule, and total call budget. |
| 5. Locked evaluation | Produce test rankings once from the frozen config for all 323 test queries. Apply the same metric definitions as Stage 2. Include BM25, untuned dense, trained dense, and fixed hybrid comparators. Report absolute scores and paired changes, including regressions and uncertainty; do not retune after seeing test results. | Raw local TREC runs and hashes; public aggregate-only report, reproducible command, and method/limitation notes. |
| 6. Patient-aware track | Identify a separately licensed collection with patient-context topics and relevance judgments. Audit how cases, candidate documents, dates, and judgments align. Keep its data and evaluation distinct from NFCorpus. Train a route selector only when training cases and honest route labels exist; compare against fixed routes with full cost accounting. | Dataset rights record and split protocol before any patient-aware model or claim. |

## Suggested first experiment

Use a compact general-purpose sentence encoder with permitted local academic use. Encode `title + text` for documents and the raw question for queries; keep the same field choice for untuned and trained runs. Start with one short CPU pilot, perhaps a few thousand distinct train query–positive pairs and one epoch. The exact model, batch size, text length, sample count, and learning rate must be recorded in the config after checking available memory and the model's license. Expand only if the pilot fits the machine. Use the Sentence Transformers training interface with a multiple-negatives ranking loss; its documented duplicate-free batch sampler helps, but cannot eliminate all false negatives from incomplete judgments.

Do **not** train a LoRA query rewriter or patient-aware controller in this first experiment. A query rewriter requires faithful target rewrites or an independently evaluated reward, and the current corpus does not contain patient facts. Training a model merely to reproduce the existing BM25 route would not answer the research question.

## Success and stop rules

The experiment is successful as an engineering milestone if the model trains from real train qrels, its weights and runs are reproducible, the split is clean, and its results are reported honestly—even if BM25 wins. A performance claim requires a predeclared primary measure (suggested: graded nDCG@10), a comparison with the same untuned backbone and BM25, paired uncertainty, and no test-driven iteration. Stop or scale down if the pilot exceeds available disk/RAM or cannot finish within an agreed time budget.

## Implementation checklist

1. Add `train-retriever` and `evaluate-retriever` commands with a separate optional dependency file and pinned versions; keep Stage 1/2 installation lightweight.
2. Add a train-pair validator and split-leakage tests, then implement local checkpoint/resume and deterministic run output.
3. Extend benchmark reports with model identifier, weights hash, training config hash, train data hash, seed, hardware, runtime, and peak memory.
4. Add `models/` and training output directories to `.gitignore`; publish only code, protocol, aggregate results, and a model card after rights review.
5. Keep the GitHub Pages demo fictional and read-only. Show aggregate experiment results there only after the locked evaluation is complete.

## Source notes

- [Original NFCorpus terms and dataset description](https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/)
- [BEIR dataset table and rights disclaimer](https://github.com/beir-cellar/beir)
- [Sentence Transformers ranking loss and training inputs](https://sbert.net/docs/package_reference/sentence_transformer/losses.html)
- [Sentence Transformers training overview](https://sbert.net/docs/sentence_transformer/training_overview.html)
- [TREC Precision Medicine topics and qrels](https://trec.nist.gov/data/precmed2019.html) and [TREC Clinical Trials overview](https://trec.nist.gov/pubs/trec32/papers/overview_32.pdf) are candidates for the later patient-context track; their collection access, rights, scale, and task match still need review.
