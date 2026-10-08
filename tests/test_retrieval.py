import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from medorchestrate.app import app
from medorchestrate.corpus import ingest_jsonl, read_imported
from medorchestrate.evaluate import evaluate, mrr_at_k, ndcg_at_k, recall_at_k
from medorchestrate.search import bm25, load_fixture, run_search


class RetrievalTests(unittest.TestCase):
    def setUp(self):
        self.cases, self.documents = load_fixture()

    def test_bm25_empty_and_deterministic_ties(self):
        self.assertEqual(bm25('any', []), [])
        self.assertEqual(bm25('', self.documents), [])
        self.assertEqual(bm25('kidney', self.documents, limit=0), [])
        first = bm25('kidney', self.documents)
        self.assertEqual(first, bm25('kidney', self.documents))

    def test_documents_are_filtered_by_publication_date(self):
        result = run_search('kidney', self.cases[0], '2021-01-01', 'direct_bm25', self.documents)
        self.assertTrue(all(row['year'] < 2021 for row in result['results']))
        self.assertEqual(result['trace']['eligible_documents'], 3)

    def test_route_evaluation_has_valid_bounded_metrics(self):
        report = evaluate(k=5)
        self.assertEqual(report['query_count'], 6)
        self.assertEqual(set(report['routes']), {'direct_bm25', 'expanded_bm25', 'adaptive'})
        for route in report['routes'].values():
            for metric in ('mean_recall_at_k', 'mean_mrr_at_k', 'mean_ndcg_at_k'):
                self.assertGreaterEqual(route[metric], 0)
                self.assertLessEqual(route[metric], 1)

    def test_metric_examples(self):
        relevance = {'A': 2, 'B': 1}
        self.assertEqual(recall_at_k(['Z', 'A'], relevance, 2), 0.5)
        self.assertEqual(mrr_at_k(['Z', 'A'], relevance, 2), 0.5)
        self.assertAlmostEqual(ndcg_at_k(['A', 'B'], relevance, 2), 1.0)

    def test_import_validates_citation_provenance(self):
        record = {'id': 'PMID:123', 'title': 'Supplied paper', 'abstract': 'An abstract', 'source': 'Journal', 'year': 2025, 'published_on': '2025-06-01', 'source_type': 'journal', 'url': 'https://example.org/paper'}
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            source = Path(folder) / 'records.jsonl'
            output = Path(folder) / 'corpus.json'
            source.write_text(json.dumps(record) + '\n', encoding='utf-8')
            manifest = ingest_jsonl(source, output)
            self.assertEqual(manifest['kind'], 'user_supplied_citations')
            self.assertEqual(len(read_imported(output)['documents']), 1)
            record['published_on'] = '2025-W22-7'
            source.write_text(json.dumps(record) + '\n', encoding='utf-8')
            with self.assertRaises(ValueError):
                ingest_jsonl(source, output)

    def test_malformed_manifest_is_unavailable_without_breaking_demo(self):
        record = {'id': 'PMID:123', 'title': 'Supplied paper', 'abstract': 'An abstract', 'source': 'Journal', 'year': 2025, 'published_on': '2025-06-01', 'source_type': 'journal', 'url': 'https://example.org/paper'}
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as folder:
            source = Path(folder) / 'records.jsonl'
            output = Path(folder) / 'corpus.json'
            source.write_text(json.dumps(record) + '\n', encoding='utf-8')
            manifest = ingest_jsonl(source, output)
            for field, value in (('kind', 'fictional_demo'), ('provenance_note', None)):
                with self.subTest(field=field):
                    damaged = {**manifest, field: value}
                    output.write_text(json.dumps(damaged), encoding='utf-8')
                    with self.assertRaises(ValueError):
                        read_imported(output)
        with patch('medorchestrate.app.read_imported', side_effect=ValueError('invalid manifest')):
            client = app.test_client()
            status = client.get('/api/status')
            self.assertEqual(status.status_code, 200)
            self.assertEqual(status.get_json()['available_corpora'], ['fictional-demo-v1'])
            corpora = client.get('/api/corpora')
            self.assertEqual(corpora.status_code, 200)
            self.assertEqual([row['id'] for row in corpora.get_json()['corpora']], ['fictional-demo-v1'])
            self.assertIn('import_error', corpora.get_json())


if __name__ == '__main__':
    unittest.main()
