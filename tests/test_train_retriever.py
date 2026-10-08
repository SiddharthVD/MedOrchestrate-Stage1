"""Split and contrastive batching checks that require no neural dependencies."""

import unittest

from medorchestrate.train_retriever import sample_positive_pairs, safe_batches


class TrainingPreparationTests(unittest.TestCase):
    def test_sample_is_seeded_one_positive_per_query(self):
        qrels = {f"q{number}": {f"d{number}": 1, f"e{number}": 1} for number in range(10)}
        first = sample_positive_pairs(qrels, seed=42, limit=6)
        self.assertEqual(first, sample_positive_pairs(qrels, seed=42, limit=6))
        self.assertEqual(len({query for query, _ in first}), 6)
        self.assertTrue(all(doc in qrels[query] for query, doc in first))

    def test_batch_never_uses_another_known_positive_as_negative(self):
        qrels = {"q1": {"d1": 1, "d3": 1}, "q2": {"d2": 1, "d3": 1},
                 "q3": {"d3": 1, "d1": 1}, "q4": {"d4": 1}}
        batches = safe_batches([("q1", "d1"), ("q2", "d2"), ("q3", "d3"), ("q4", "d4")], qrels, 3)
        for batch in batches:
            for query, doc in batch:
                for other_query, other_doc in batch:
                    if query != other_query:
                        self.assertNotIn(other_doc, qrels[query])
        self.assertGreaterEqual(len(batches), 1)


if __name__ == "__main__":
    unittest.main()
