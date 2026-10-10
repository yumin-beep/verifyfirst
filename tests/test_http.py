"""HTTP boundaries with a mocked model; these are not model accuracy tests."""
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from core import DomainError, MemoryStore, validate_extraction

CLIENT = 'http-test-browser-001'
TEXT = 'I am campus IT. Send your login code.'
RAW = {'claims': [{'kind': 'identity', 'quote': 'I am campus IT.'}],
       'requests': [{'kind': 'credential', 'quote': 'Send your login code.'}], 'channels': []}


class HTTPBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.httpd.daemon_threads = True
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown(); cls.httpd.server_close(); cls.thread.join()

    def setUp(self):
        server.STORE = MemoryStore()
        self.model = patch.object(server, 'run_model', return_value=(*validate_extraction(TEXT, RAW), 1))
        self.model.start()
        self.addCleanup(self.model.stop)

    def request(self, path, body=None, extra=None, method=None):
        method = method or ('POST' if body is not None else 'GET')
        data = body if isinstance(body, bytes) else json.dumps(body).encode() if body is not None else None
        headers = {'Host': f'127.0.0.1:{self.port}', 'Content-Type': 'application/json',
                   'X-VerifyFirst': '1', 'Origin': f'http://127.0.0.1:{self.port}'}
        headers.update(extra or {})
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=3)
        conn.request(method, path, body=data, headers=headers)
        response = conn.getresponse()
        status, response_headers, raw = response.status, dict(response.getheaders()), response.read()
        conn.close()
        try: value = json.loads(raw)
        except ValueError: value = raw
        return status, value, response_headers

    def analyze(self):
        status, result, _ = self.request('/api/analyze', {'text': TEXT, 'client_id': CLIENT, 'revision': 1})
        self.assertEqual(status, 200)
        return result['analysis']

    def check_body(self, analysis, **changes):
        body = {'analysis_id': analysis['id'], 'client_id': CLIENT, 'revision': 1,
                'check_id': 'identity', 'state': 'confirmed', 'source_type': 'known_contact'}
        body.update(changes)
        return body

    def test_flow_returns_grounded_evidence_and_confirmed_user_record(self):
        analysis = self.analyze()
        self.assertEqual(analysis['requests'][0]['quote'], 'Send your login code.')
        status, result, headers = self.request('/api/check', self.check_body(analysis))
        self.assertEqual(status, 200)
        self.assertEqual(result['analysis']['checks'][0]['state'], 'confirmed')
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertNotIn('safe', result['analysis'])

    def test_foreign_host_rejected(self):
        self.assertEqual(self.request('/api/manual', extra={'Host': 'evil.test'})[0], 403)

    def test_foreign_origin_rejected(self):
        self.assertEqual(self.request('/api/manual', extra={'Origin': 'https://evil.test'})[0], 403)

    def test_missing_app_header_rejected(self):
        self.assertEqual(self.request('/api/reset', {'client_id': CLIENT, 'revision': 1}, {'X-VerifyFirst': ''})[0], 403)

    def test_source_and_path_traversal_not_served(self):
        for path in ['/server.py', '/core.py', '/tests/fixtures.json', '/../server.py', '/%2e%2e/server.py', '/evidence/local-model-evaluation.json']:
            with self.subTest(path=path): self.assertEqual(self.request(path)[0], 404)

    def test_malformed_json_and_nonobject_rejected(self):
        self.assertEqual(self.request('/api/analyze', b'{oops')[0], 400)
        self.assertEqual(self.request('/api/analyze', [1, 2])[0], 400)

    def test_oversized_body_rejected(self):
        self.assertEqual(self.request('/api/analyze', b'x' * (server.MAX_BODY+1))[0], 413)

    def test_cross_session_cannot_read_or_mutate_analysis(self):
        a = self.analyze()
        status, result, _ = self.request('/api/check', self.check_body(a, client_id='http-other-browser-2'))
        self.assertEqual(status, 409)
        self.assertNotIn('analysis', result)

    def test_no_confirmation_without_independent_route(self):
        a = self.analyze()
        self.assertEqual(self.request('/api/check', self.check_body(a, source_type='none'))[0], 400)

    def test_reset_invalidates_old_analysis(self):
        a = self.analyze()
        self.assertEqual(self.request('/api/reset', {'client_id': CLIENT, 'revision': 2})[0], 200)
        self.assertEqual(self.request('/api/check', self.check_body(a))[0], 409)
        self.assertIsNone(server.STORE.entries[CLIENT]['analysis'])

    def test_model_failure_is_explicit_without_fake_analysis(self):
        with patch.object(server, 'run_model', side_effect=DomainError('model_failure', 'Unavailable', 503)):
            status, result, _ = self.request('/api/analyze', {'text': TEXT, 'client_id': CLIENT, 'revision': 1})
        self.assertEqual(status, 503)
        self.assertTrue(result['manual_available'])
        self.assertNotIn('analysis', result)

    def test_manual_mode_never_calls_model(self):
        status, result, _ = self.request('/api/manual')
        self.assertEqual(status, 200)
        self.assertEqual(len(result['checks']), 3)
        self.assertIn('Manual review', result['notices'][0])
        server.run_model.assert_not_called()

    def test_model_busy_fails_without_queueing_private_input(self):
        server.MODEL_SLOT.acquire()
        try:
            status, result, _ = self.request('/api/analyze', {'text': TEXT, 'client_id': CLIENT, 'revision': 1})
        finally: server.MODEL_SLOT.release()
        self.assertEqual(status, 429)
        self.assertEqual(result['error']['code'], 'model_busy')
        self.assertIsNone(server.STORE.entries[CLIENT]['analysis'])


if __name__ == '__main__':
    unittest.main()
