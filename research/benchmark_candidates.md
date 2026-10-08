# Biomedical benchmark selection

**Selected for Stage 2 local evaluation:** the BEIR-transformed NFCorpus package. The exact archive, hashes, split rules, and usage limits are recorded in [STAGE2_PROTOCOL.md](STAGE2_PROTOCOL.md).

The [original NFCorpus project](https://www.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/) permits academic use and requires a citation to Boteva et al. (2016). The [BEIR project](https://github.com/beir-cellar/beir) provides a smaller transformed edition with a published archive checksum, but explicitly does not grant rights to its constituent datasets. Consequently, the Stage 2 corpus and qrels stay local and are not published to GitHub.

NFCorpus measures retrieval for its own non-patient queries. Its judgments cannot establish whether patient facts improve evidence retrieval, and must never be paired with the fictional cases or demonstration judgments. Stage 2 reports a fixed direct BM25 baseline and a frozen test protocol. Learned routes and patient-aware comparisons remain later research work.
