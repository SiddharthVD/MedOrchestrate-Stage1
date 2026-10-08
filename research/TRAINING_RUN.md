# NFCorpus trained retrieval experiment

## What was trained

On 9 October 2026, a local CPU run fine-tuned the compact [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) sentence encoder (Apache-2.0; revision `1110a243fdf4706b3f48f1d95db1a4f5529b4d41`) on the pinned BEIR transformed NFCorpus **train** split. The model ranks literature for NFCorpus questions. It is not a patient-aware route selector, query rewriter, LoRA adapter, or clinical model.

The [NFCorpus owner](https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/) permits academic use but does not clearly permit public redistribution of the source data. [BEIR](https://github.com/beir-cellar/beir) also disclaims dataset rights. The corpus, queries, qrels, raw rankings, downloaded base model, and fine-tuned weights remain local and ignored by Git. The repository contains code, input and run hashes, and aggregate results only. Citation: Boteva et al. (2016), *A Full-Text Learning to Rank Dataset for Medical Information Retrieval*; Thakur et al. (2021), *BEIR*.

## Protocol and actual run

The frozen [Stage 2 protocol](STAGE2_PROTOCOL.md) validates the exact archive and all five extracted file hashes. The split query IDs are disjoint: 2,590 train, 324 dev, and 323 test. The shared corpus has 3,633 documents. The train qrels have 110,575 positive pairs and no explicitly judged negatives in this edition. Unjudged documents are unknown; in-batch contrastive negatives may contain unlabeled positives.

One seeded positive document was sampled per train query. This first CPU run sampled 512 train queries; the safe batch constructor used **509 pairs** in 81 batches after excluding conflicts and incomplete singleton batches. It fine-tuned for one epoch with batch size 8, learning rate `2e-5`, maximum length 128 tokens, and normalized cosine in-batch cross-entropy (scale 20). Queries used raw question text. Documents used title plus text. Seed was 42. Training took **77.9 seconds** and saved real weights locally. The weights hash, package versions, file hashes, exact settings, and training loss are in the [training manifest](../artifacts/training/training-manifest.json). The weight hash is a provenance identifier, not a public download.

All methods ranked the same 3,633 documents and used the same qrels and metric code. Direct BM25 matches the previously reported Stage 2 test metric values. The fixed hybrid combines the top 10 BM25 and trained-dense rankings by reciprocal rank fusion with constant 60, then returns 10 results. It is a two-route system and incurs both route costs. The primary selection measure was **graded nDCG@10 on dev**. The selected hybrid and model hash were recorded before the test evaluation in the [selection record](../artifacts/training/dev-selection.json). No settings were changed after the test result.

| Split / route | Recall@10 | MRR@10 | Graded nDCG@10 |
| --- | ---: | ---: | ---: |
| Dev: BM25 | 0.110153 | 0.466013 | 0.270391 |
| Dev: untuned dense | 0.135200 | 0.479579 | 0.300660 |
| Dev: trained dense | 0.138709 | 0.491638 | 0.305182 |
| Dev: BM25 + trained dense | **0.142117** | **0.513060** | **0.314967** |
| Test: BM25 | 0.151758 | 0.515477 | 0.309963 |
| Test: untuned dense | 0.153692 | 0.512824 | 0.315489 |
| Test: trained dense | 0.162674 | 0.502327 | 0.319476 |
| Test: BM25 + trained dense | **0.169259** | **0.541454** | **0.340181** |

The selected hybrid's test nDCG@10 difference versus BM25 is **+0.030218**. A seeded paired bootstrap over the 323 judged queries gave a descriptive 95% interval of **[+0.016486, +0.043226]**, with 113 query wins, 79 losses, and 131 ties. The trained dense route alone improved nDCG@10 by only +0.009513 versus BM25; its bootstrap interval includes zero and its MRR was lower. The run therefore supports a limited finding about this hybrid on this benchmark, not a claim that the fine-tuned encoder alone is reliably superior. Full aggregate reports are [dev](../artifacts/training/dev-aggregate.json) and [test](../artifacts/training/test-aggregate.json).

On the test machine, BM25 indexing and searching took 0.90 seconds for the 323 queries; trained dense corpus/query encoding and searching took 67.8 seconds. These observed times exclude model loading, process startup, and the hybrid's separate BM25 call. They are not normalized cross-machine latency or service cost. The hybrid's quality gain comes with substantially more work.

## Reproduce locally

Run from the project root, after following the [Stage 2 fetch and freeze steps](STAGE2_PROTOCOL.md):

```powershell
python -m venv .venv-train
python -m pip --python .venv-train install -r requirements-train.txt
.\.venv-train\Scripts\python.exe -m medorchestrate.train_retriever prepare
.\.venv-train\Scripts\python.exe -m medorchestrate.train_retriever train --max-pairs 512 --batch-size 8
.\.venv-train\Scripts\python.exe -m medorchestrate.train_retriever evaluate --split dev
.\.venv-train\Scripts\python.exe -m medorchestrate.train_retriever evaluate --split test
```

The `dev` command writes an ignored local `selection.json`; `test` refuses to run without it or if the model/data hashes change. The default local weights are `models/nfcorpus-minilm-v1/`. Raw TREC rankings and local reports are under ignored `data/benchmark/training_runs/`. Keep these local unless dataset and model redistribution rights are separately reviewed. The optional training dependencies do not alter the core Flask installation.

## Limits and next gate

- Only 509 of 2,590 train queries contributed one pair each. This is a small feasibility run, not an exhaustive training study. A stronger training claim needs additional seeds and a fresh independent holdout; the original test scores were visible from Stage 2.
- The train qrels contain only positive labels and the benchmark judgments are incomplete. In-batch negatives are screened against known train positives but can still be false negatives. Recall and nDCG are defined relative to the provided judgments.
- NFCorpus questions have no dated patient context. This run does not test personalized retrieval, clinical decision support, or medical safety.
- The public GitHub Pages workbench remains a fictional JavaScript demo. It displays this experiment's aggregate scores but does not execute the trained model. Local model serving and patient-aware evaluation are later, separate gates.

Before a patient-aware claim, select a governed dataset with case facts, questions, candidate literature, and independent relevance judgments. Review its access rights and split protocol before training a controller. [TREC Precision Medicine](https://trec.nist.gov/data/precmed2019.html) is a candidate for review, not an approved or ingested dataset in this project.
