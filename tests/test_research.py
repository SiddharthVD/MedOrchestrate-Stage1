import unittest
from datetime import date

from medorchestrate.research import (
    TOPICS, allowed_license, build_pilot, ep_query, graph_neighborhood,
    load_snapshot, normalize_record, search_live, search_snapshot, validate_search,
)


def source_record(article_id='123', title='Asthma treatment research', license_value='cc by'):
    return {
        'id': article_id, 'source': 'MED', 'pmid': article_id, 'pmcid': 'PMC' + article_id,
        'doi': '10.1234/test.' + article_id, 'title': title,
        'abstractText': '<p>Asthma treatment is discussed in this article. The study describes inhaled corticosteroid treatment and outcomes in adults with asthma.</p>',
        'authorList': {'author': [{'fullName': 'Ada Researcher'}]},
        'journalInfo': {'journal': {'title': 'Example Journal'}},
        'pubTypeList': {'pubType': ['Journal Article', 'Clinical Trial']},
        'meshHeadingList': {'meshHeading': [{'descriptorName': 'Asthma'}]},
        'firstPublicationDate': '2025-06-01', 'isOpenAccess': 'Y', 'license': license_value,
        'fullTextUrlList': {'fullTextUrl': [
            {'availabilityCode': 'OA', 'documentStyle': 'html', 'url': 'https://europepmc.org/articles/PMC' + article_id},
            {'availabilityCode': 'OA', 'documentStyle': 'pdf', 'url': 'https://europepmc.org/articles/PMC' + article_id + '?pdf=render'},
        ]},
    }


class StubClient:
    def __init__(self, records):
        self.records = records
        self.calls = []

    def fetch_page(self, query, *, page_size, cursor):
        self.calls.append((query, page_size, cursor))
        return {'hitCount': len(self.records), 'resultList': {'result': self.records}}


class ResearchTests(unittest.TestCase):
    def test_normalization_preserves_source_links_and_provenance(self):
        doc = normalize_record(source_record(), today=date(2026, 10, 9), retrieved_at='2026-10-09T00:00:00+00:00')
        self.assertEqual(doc['id'], 'MED:123')
        self.assertEqual(doc['license'], 'cc by')
        self.assertEqual(doc['pmid'], '123')
        self.assertEqual(doc['fulltext_url'], 'https://europepmc.org/articles/PMC123')
        self.assertEqual(doc['pdf_url'], 'https://europepmc.org/articles/PMC123?pdf=render')
        self.assertIn('Ada Researcher', doc['authors'])
        self.assertEqual(doc['retrieved_at'], '2026-10-09T00:00:00+00:00')
        self.assertTrue(any(item['relation'] == 'INDEXED_WITH' and item['label'] == 'Asthma' for item in doc['concepts']))
        self.assertTrue(any(item['relation'] == 'MENTIONS' and item['id'] == 'literal:asthma' for item in doc['concepts']))

    def test_non_reusable_future_and_linkless_records_are_excluded(self):
        for license_value in ('cc by-nc', 'cc by-nd', None):
            with self.subTest(license_value=license_value):
                self.assertIsNone(normalize_record(source_record(license_value=license_value), today=date(2026, 10, 9)))
        future = source_record()
        future['firstPublicationDate'] = '2026-11-01'
        self.assertIsNone(normalize_record(future, today=date(2026, 10, 9)))
        linkless = source_record()
        linkless['fullTextUrlList'] = {'fullTextUrl': []}
        self.assertIsNone(normalize_record(linkless, today=date(2026, 10, 9)))
        self.assertIsNone(allowed_license('cc by-nc'))

    def test_search_validation_and_live_bounded_mapping(self):
        self.assertIn('OPEN_ACCESS:y', ep_query('asthma', year_from=2020, source='MED'))
        for bad in ('x', 'asthma" OR LICENSE:cc', '*' * 201):
            with self.subTest(query=bad):
                with self.assertRaises(ValueError):
                    validate_search(query=bad)
        with self.assertRaises(ValueError):
            validate_search(query='asthma', year_from=2025, year_to=2020)
        client = StubClient([source_record(), source_record('124', license_value='cc by-nc')])
        result = search_live('asthma treatment', client=client, limit=5, year_from=2020,
                             publication_type='Clinical Trial', source='MED')
        self.assertEqual(result['mode'], 'live')
        self.assertEqual(result['result_count'], 1)
        self.assertEqual(result['results'][0]['id'], 'MED:123')
        self.assertLessEqual(len(client.calls), 3)

    def test_snapshot_search_and_graph_edges_are_evidence_only(self):
        doc = normalize_record(source_record(), today=date(2026, 10, 9))
        corpus = {'version': 'research-pilot-v1', 'updated_at': '2026-10-09T00:00:00+00:00',
                  'source': {'license_policy': 'CC BY'}, 'topics': TOPICS, 'documents': [doc]}
        result = search_snapshot('asthma treatment', corpus=corpus, limit=5)
        self.assertEqual(result['result_count'], 1)
        graph = graph_neighborhood(corpus, 'literal:asthma')
        self.assertEqual(graph['count'], 1)
        self.assertEqual({edge['relation'] for edge in graph['edges']}, {'MENTIONS'})
        self.assertEqual(graph['edges'][0]['study_url'], doc['source_url'])

    def test_curated_pilot_has_balance_and_actual_schema(self):
        topics = TOPICS[:2]
        client = StubClient([source_record('123'), source_record('124', title='Kidney and asthma treatment')])
        corpus = build_pilot(client=client, target=2, today=date(2026, 10, 9), topics=topics)
        self.assertEqual(corpus['document_count'], 2)
        self.assertEqual(len(corpus['query_log']), 2)
        self.assertTrue(all(doc['license'] == 'cc by' for doc in corpus['documents']))

    def test_saved_pilot_is_licensed_and_real(self):
        corpus = load_snapshot()
        self.assertEqual(corpus['document_count'], 225)
        self.assertEqual(len(corpus['topics']), 15)
        self.assertEqual(len({doc['id'] for doc in corpus['documents']}), 225)
        self.assertTrue(all(doc['id'].startswith(('MED:', 'PMC:')) and doc['fulltext_url'] for doc in corpus['documents']))
        self.assertTrue(all(doc['published_on'] <= '2026-10-09' for doc in corpus['documents']))


if __name__ == '__main__':
    unittest.main()
