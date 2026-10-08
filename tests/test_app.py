import unittest

from medorchestrate.app import app
from medorchestrate.search import load_fixture, run_search, valid_facts


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.cases, self.documents = load_fixture()

    def test_status_matches_fixture(self):
        result = self.client.get('/api/status').get_json()
        self.assertEqual(result['cases'], len(self.cases))
        self.assertEqual(result['documents'], len(self.documents))
        self.assertIn('adaptive', result['available_routes'])
        self.assertIn('lora_rewrite', result['unavailable_routes'])

    def test_future_fact_is_excluded(self):
        facts = valid_facts(self.cases[0], '2026-03-01')
        self.assertNotIn('Albuminuria', [fact['label'] for fact in facts])

    def test_adaptive_route_executes_and_traces(self):
        output = run_search('What evidence discusses glucose lowering treatment?', self.cases[0], '2026-10-08', 'adaptive', self.documents)
        self.assertEqual(output['executed_route'], 'expanded_bm25')
        self.assertEqual(output['trace']['calls']['retrieval'], 1)
        self.assertIn('kidney', output['trace']['added_terms'])
        self.assertGreater(len(output['results']), 0)

    def test_search_rejects_unavailable_route(self):
        response = self.client.post('/api/search', json={'case_id': self.cases[0]['id'], 'question': 'kidney', 'route': 'dense'})
        self.assertEqual(response.status_code, 400)

    def test_search_rejects_bad_date(self):
        response = self.client.post('/api/search', json={'case_id': self.cases[0]['id'], 'question': 'kidney', 'as_of': 'bad'})
        self.assertEqual(response.status_code, 400)

    def test_case_and_search_reject_noncanonical_dates(self):
        case_id = self.cases[0]['id']
        for date_value in ('20260101', '2026-W01-1'):
            with self.subTest(date_value=date_value):
                self.assertEqual(self.client.get(f'/api/cases/{case_id}?as_of={date_value}').status_code, 400)
                response = self.client.post('/api/search', json={'case_id': case_id, 'question': 'kidney', 'as_of': date_value})
                self.assertEqual(response.status_code, 400)
                with self.assertRaises(ValueError):
                    valid_facts(self.cases[0], date_value)

    def test_search_rejects_non_object_json_and_null_date(self):
        for value in ([], 'text'):
            with self.subTest(value=value):
                self.assertEqual(self.client.post('/api/search', json=value).status_code, 400)
        response = self.client.post('/api/search', json={'case_id': self.cases[0]['id'], 'question': 'kidney', 'as_of': None})
        self.assertEqual(response.status_code, 400)


if __name__ == '__main__':
    unittest.main()
