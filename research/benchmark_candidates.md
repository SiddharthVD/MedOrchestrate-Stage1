# Biomedical benchmark candidate

**Candidate for the next phase:** NFCorpus in the BEIR retrieval format. The [BEIR project](https://github.com/beir-cellar/beir) lists NFCorpus among its biomedical retrieval datasets and documents the common corpus, query, and qrels loading workflow. The [BEIR NFCorpus dataset card](https://huggingface.co/datasets/BeIR/nfcorpus) describes its task as retrieval of scientific articles for queries about nutritional facts, with a 3,633 record corpus. This is **not** a patient specific clinical relevance benchmark.

The BEIR repository explicitly says that constituent datasets retain their own terms and that users must determine permission and cite the original owner. The Hugging Face mirror labels NFCorpus CC BY-SA 4.0, but original source terms and exact edition still need verification before downloading or redistributing data. The original [NFCorpus project page](https://webserver.cl.uni-heidelberg.de/statnlpgroup/nfcorpus/) and [BEIR documentation](https://github.com/beir-cellar/beir) are the first sources to check.

No NFCorpus files have been downloaded or evaluated in Stage 1. The invented demo qrels must never be applied to NFCorpus.
