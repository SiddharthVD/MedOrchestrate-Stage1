import unittest
from unittest.mock import patch
from medorchestrate.app import app
from medorchestrate.research import ResearchError


class WorkspaceIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_home_has_explicit_offline_default_and_no_fake_models(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 200)
        text = response.get_data(as_text=True)
        self.assertIn('value="demo" selected', text)
        self.assertIn('workspace-api.js', text)
        self.assertIn('search-case-select', text)

    def test_only_demonstration_data_is_exposed(self):
        with self.client.get('/demo-data/cases.json') as response:
            self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get('/demo-data/queries.jsonl').status_code, 404)
        self.assertEqual(self.client.get('/demo-data/benchmark_manifest.json').status_code, 404)
        self.assertEqual(self.client.get('/research/../../PROJECT_CONTEXT.md').status_code, 404)

    def test_real_research_api_and_assets(self):
        for url in ('/research/', '/research/research-style.css'):
            with self.client.get(url) as response:
                self.assertEqual(response.status_code, 200)
        status = self.client.get('/api/research/status').get_json()
        self.assertTrue(status['available'])
        result = self.client.get('/api/research/search?query=asthma').get_json()
        self.assertEqual(result['mode'], 'snapshot')
        self.assertTrue(result['results'])
        self.assertTrue(all(row['source_url'].startswith('https://europepmc.org/') for row in result['results']))

    def test_source_failure_does_not_fall_back(self):
        with patch('medorchestrate.research.search_live', side_effect=ResearchError('Source down')):
            response = self.client.get('/api/research/search?query=asthma&mode=live')
        self.assertEqual(response.status_code, 502)
        self.assertFalse(response.get_json()['fallback_used'])
        self.assertEqual(response.get_json()['mode'], 'live')
        self.assertEqual(self.client.get('/api/research/search?query=x').status_code, 400)
        self.assertEqual(self.client.get('/api/research/search?query=asthma&mode=invalid').status_code, 400)


if __name__ == '__main__':
    unittest.main()
