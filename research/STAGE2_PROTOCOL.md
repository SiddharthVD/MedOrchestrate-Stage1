# Stage 2: real retrieval benchmark protocol

## Scope

Stage 2 adds a reproducible **literature retrieval evaluation** on a real benchmark. It does not train a model or evaluate patient-specific recommendations. The GitHub Pages workbench remains a fictional demonstration; the benchmark runs locally and its source data is not committed to the public repository.

## Dataset and provenance

Use the BEIR-formatted NFCorpus archive at [TU Darmstadt](https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/nfcorpus.zip). This is a transformed edition of [Heidelberg's original NFCorpus v1](https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/), not an interchangeable copy. The original page describes academic use, requires citation of Boteva et al. (2016), and does not expressly authorize public redistribution. [BEIR](https://github.com/beir-cellar/beir) likewise says it does not grant dataset use rights. Therefore, download and evaluate locally; do not push the corpus, queries, qrels, or archive to GitHub.

| Item | Frozen value for this checkpoint |
| --- | --- |
| Package | BEIR `nfcorpus.zip`, listed 15 January 2021 |
| Download URL | `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/nfcorpus.zip` |
| Archive size | 2,448,432 bytes |
| Archive MD5 (BEIR published) | `a89dba18a62ef92f7d323ec890a0d38d` |
| Archive SHA-256 (locally observed) | `efe5be03f8c5b86a5870102d0599d227c8c6e2484328e68c6522560385671b0b` |
| Corpus | 3,633 records in `corpus.jsonl` |
| Queries | 3,237 in `queries.jsonl` |
| Train / dev / test queries with judgments | 2,590 / 324 / 323 |
| Qrels | `qrels/train.tsv`, `qrels/dev.tsv`, `qrels/test.tsv` |

The checksum applies to the named BEIR package. The original Heidelberg archive has a different checksum, counts, and packaging. Do not use its statistics or judgments as if they were from this BEIR package.

## Evaluation rules

1. Validate archive and extracted file hashes before using a run. Record the source URL, edition, SHA-256 file hashes, split, retriever and tokenizer versions, route, ranking cutoff, and output hashes in a run manifest. Use the Git commit for the exact source revision when reproducing a published result.
2. Keep train, development, and test query IDs disjoint. Use the shared document corpus across splits, following BEIR format. Never use test qrels to select BM25 parameters, query processing, a route, a model, or a threshold.
3. Start with a **fixed direct BM25** baseline over the complete corpus. Log every ranked document ID and score. Report at least Recall@5, MRR@5, and nDCG@5 with the evaluated query count. State the exact relevance threshold used for binary metrics.
4. Use development data for any later tuning. Freeze the selected method before one test evaluation. Retain raw per-query rankings and metrics so results can be reproduced and errors reviewed.
5. NFCorpus queries are information needs about nutrition and medical literature. They are not dated patient cases and their qrels are not patient-specific. Do not combine them with the fictional case facts or demo qrels, and do not interpret a benchmark score as clinical usefulness.
6. Treat training as a later research gate. If a labeled training route is added, fit only on the train split, choose settings on dev, then evaluate once on test. Keep untrained lexical retrieval as a comparator.

## Reproduction and outputs

Run the following from the project root in PowerShell. The fetch command verifies the published archive MD5, the locally recorded archive SHA-256, and SHA-256 hashes of all five extracted files.

```powershell
python scripts/fetch_nfcorpus.py
python -m medorchestrate.benchmark freeze `
  --data-dir data/benchmark/nfcorpus `
  --dataset-id nfcorpus `
  --edition "BEIR transformed NFCorpus (2021-01-15 archive)" `
  --source-url "https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/nfcorpus.zip" `
  --rights-source-url "https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/" `
  --license-statement "Original NFCorpus page permits academic use; local research evaluation only; public redistribution not asserted" `
  --citation "Boteva et al. (2016), A Full-Text Learning to Rank Dataset for Medical Information Retrieval; Thakur et al. (2021), BEIR" `
  --rights-reviewed `
  --archive data/benchmark/nfcorpus.zip
python -m medorchestrate.benchmark evaluate --data-dir data/benchmark/nfcorpus --k 5 --run-output data/benchmark/runs/nfcorpus-bm25-k5.trec --output data/benchmark/runs/nfcorpus-bm25-k5.json
python -m medorchestrate.benchmark evaluate --data-dir data/benchmark/nfcorpus --k 10 --run-output data/benchmark/runs/nfcorpus-bm25-k10.trec --output data/benchmark/runs/nfcorpus-bm25-k10.json
```

`--rights-reviewed` records that the original source terms were reviewed for this local academic use; it does not claim the user gave a legal attestation. The freeze command checks that the train, development, and test query IDs are disjoint and writes `data/benchmark/nfcorpus/benchmark_manifest.json`. The local TREC run files contain document and query IDs; they remain under the ignored `data/benchmark/` directory. Aggregate reports and hashes are in `artifacts/benchmark/` without benchmark texts or relevance judgments.

### Fixed Stage 2 baseline result

The first frozen direct BM25 run evaluated 323 judged **test** queries against 3,633 documents. Binary Recall/MRR count grades greater than zero as relevant; nDCG uses the supplied grades. These are retrieval scores on NFCorpus, not evidence of patient-specific benefit.

| Cutoff | Mean Recall | Mean MRR | Mean nDCG | Aggregate report |
| --- | ---: | ---: | ---: | --- |
| 5 | 0.120006 | 0.507534 | 0.336423 | [JSON](../artifacts/benchmark/nfcorpus-bm25-k5.json) |
| 10 | 0.151758 | 0.515477 | 0.309963 | [JSON](../artifacts/benchmark/nfcorpus-bm25-k10.json) |

The metrics are descriptive baseline observations. No BM25 parameter tuning or model training was performed on these queries.

## Using your own data later

Own article or citation collections can be indexed locally for search if they have stable IDs and usable text. **Training or measuring quality also needs questions and relevance judgments**, ideally created independently of the search route. Patient records require a separate privacy and governance review before any use; do not add them to the public repository or GitHub Pages site. If the data is from patients, confirm the applicable rules for your institution and jurisdiction before ingestion, and keep access restricted.

### Sources

- [Original NFCorpus page and terms](https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/)
- [BEIR dataset table, archive checksum, and license disclaimer](https://github.com/beir-cellar/beir)
- [BEIR custom data format](https://github.com/beir-cellar/beir/wiki/Load-your-custom-dataset)
