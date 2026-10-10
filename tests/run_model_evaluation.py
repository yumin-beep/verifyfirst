"""Run the real installed local model on authored synthetic cases, never user messages."""
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server import MODEL, local_json, run_model
from core import DomainError, make_checklist

PATTERNS = {
    'payment': r'\b(pay|transfer|send money|gift cards?)\b',
    'credential': r'\b(password|login code|one.time code|verification code)\b',
    'remote_access': r'\b(remote access|screen control)\b',
    'software': r'\b(install|download)\b',
    'link': r'\b(click|open the link|visit)\b',
    'channel_change': r'\b(new number|new account|message me at)\b',
    'secrecy': r'\b(secret|do not tell|don.t tell)\b',
    'urgency': r'\b(now|immediately|urgent|within .*minutes)\b',
}


def baseline(text):
    return sorted(k for k, pattern in PATTERNS.items() if re.search(pattern, text, re.I))


def main():
    fixtures = json.loads((ROOT/'tests/fixtures.json').read_text())
    if isinstance(fixtures, dict):
        cases = fixtures['cases']
    else:
        cases = fixtures
    results = []
    for case in cases:
        text = case['text']
        expected = sorted(case['expected_request_kinds'])
        started = time.monotonic()
        row = {'id': case['id'], 'text': text, 'expected_request_kinds': expected,
               'keyword_baseline': baseline(text)}
        try:
            evidence, notices, elapsed = run_model(text)
            got = sorted(set(v['kind'] for v in evidence['requests']))
            encoded = text.encode('utf-16-le')
            valid = all(encoded[item['start']*2:item['end']*2].decode('utf-16-le') == item['quote']
                        for group in evidence.values() for item in group)
            row.update(status='ok', observed_request_kinds=got, exact_request_set=got == expected,
                       evidence=evidence, notices=notices, elapsed_ms=elapsed,
                       all_quotes_match_utf16=valid,
                       all_checks_initially_pending=all(c['state'] == 'pending' for c in make_checklist(evidence['requests'])))
        except DomainError as exc:
            row.update(status='rejected', error_code=exc.code, error_message=str(exc), exact_request_set=False,
                       elapsed_ms=round((time.monotonic()-started)*1000))
        row['baseline_exact_request_set'] = row['keyword_baseline'] == expected
        results.append(row)
        print(f"{case['id']}: {row['status']}, exact request set={row['exact_request_set']}", flush=True)
    latencies = sorted(r['elapsed_ms'] for r in results)
    tags = local_json('/api/tags', timeout=2)
    metadata = next((v for v in tags['models'] if v.get('name') == MODEL), {})
    report = {'run_at_utc': datetime.now(timezone.utc).isoformat(), 'model': MODEL,
        'model_digest': metadata.get('digest'), 'model_details': metadata.get('details'),
        'dataset': '10 authored synthetic English development examples; not an independent benchmark or user study',
        'method': 'Expected request types fixed before execution. Real local structured-output generation, then source validation. Baseline is a deliberately simple keyword list, not a security product.',
        'summary': {'cases':len(results), 'successful_responses':sum(r['status']=='ok' for r in results),
            'exact_request_sets':sum(r['exact_request_set'] for r in results),
            'baseline_exact_request_sets':sum(r['baseline_exact_request_set'] for r in results),
            'p50_ms':statistics.median(latencies), 'p95_nearest_rank_ms':latencies[math.ceil(.95*len(latencies))-1]},
        'source_sha256': {name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
                         for name in ['core.py','server.py','tests/fixtures.json','tests/run_model_evaluation.py']},
        'cases':results}
    (ROOT/'evidence/local-model-evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report['summary']))


if __name__ == '__main__':
    main()
