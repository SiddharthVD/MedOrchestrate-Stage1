import json
from pathlib import Path
import unittest
from scripts.build_relationships import SPECS

class AssertionTests(unittest.TestCase):
    def test_all_published_assertions_are_exact_source_grounded(self):
        root=Path(__file__).resolve().parents[1]
        corpus=json.loads((root/'site/data/research-corpus.json').read_text(encoding='utf8'))
        payload=json.loads((root/'site/data/relationships.json').read_text())
        docs={doc['id']:doc for doc in corpus['documents']}
        self.assertEqual(payload['corpus_updated_at'],corpus['updated_at'])
        self.assertEqual(len(payload['assertions']),len(SPECS))
        for row in payload['assertions']:
            doc=docs[row['study_id']]
            self.assertIn(row['evidence'],doc['abstract'])
            self.assertEqual(row['source_url'],doc['source_url'])
            self.assertEqual(row['license'],doc['license'])
            self.assertTrue(row['population'] and row['limitations'] and row['study_design'])
            self.assertIn('NOT independently medically reviewed',row['review_status'])
            self.assertNotIn(row['predicate'],['TREATS','CAUSES','CURES'])
        self.assertTrue(any(row['predicate'].startswith('NO_') for row in payload['assertions']))
