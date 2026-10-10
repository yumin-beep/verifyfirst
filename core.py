"""Source-grounded extraction and user-reported verification state.

This module cannot authenticate identities or decide that a message is safe.
New code authored with OpenAI Codex assistance for ForgeHacks, 2026-10-10.
"""
from copy import deepcopy
import re
import secrets
import threading
import time

MAX_TEXT = 2400
TTL_SECONDS = 20 * 60
KINDS = {
    'claims': {'identity': 'Claimed identity', 'role': 'Claimed role or authority',
               'relationship': 'Claimed relationship', 'account_issue': 'Claimed account issue',
               'opportunity': 'Claimed opportunity', 'emergency': 'Claimed emergency'},
    'requests': {'payment': 'Requested payment or transfer', 'credential': 'Requested password or code',
                 'remote_access': 'Requested remote access', 'software': 'Requested installation',
                 'link': 'Requested link visit', 'channel_change': 'Requested channel change',
                 'secrecy': 'Requested secrecy', 'urgency': 'Pressure to act quickly',
                 'other': 'Other requested action'},
    'channels': {'phone': 'Number supplied in the message', 'email': 'Email supplied in the message',
                 'url': 'URL supplied in the message', 'handle': 'Handle supplied in the message'},
}
SOURCES = {'known_contact', 'official_site', 'in_person', 'none'}
STATES = {'pending', 'confirmed', 'contradicted', 'unclear'}


class DomainError(ValueError):
    def __init__(self, code, message, status=422):
        super().__init__(message)
        self.code, self.status = code, status


def validate_text(text):
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT:
        raise DomainError('invalid_text', f'Enter 1–{MAX_TEXT} characters of message text.', 400)
    if any(0xD800 <= ord(c) <= 0xDFFF or ord(c) == 0 for c in text):
        raise DomainError('invalid_text', 'The message contains unsupported control characters.', 400)
    return text


def utf16_offset(text, index):
    return len(text[:index].encode('utf-16-le')) // 2


def _negated_request(quote):
    # A narrow fail-closed guard; not a general semantic truth check.
    return bool(re.search(r"\b(?:do\s+not|don['’]t|never|not\s+to|no\s+need\s+to)\b|하지\s*마|보내지\s*마|공유하지\s*마", quote, re.I))


def validate_extraction(text, raw):
    """Return grounded arrays and notices. Malformed shape is an explicit error."""
    validate_text(text)
    if not isinstance(raw, dict) or set(raw) != set(KINDS):
        raise DomainError('model_shape', 'The local model returned an unsupported structure. Use manual review or retry.')
    result, rejected, seen = {}, 0, set()
    for group, kinds in KINDS.items():
        entries = raw[group]
        if not isinstance(entries, list) or len(entries) > 6:
            raise DomainError('model_shape', 'The local model returned too many or invalid evidence items.')
        accepted = []
        for entry in entries:
            if not isinstance(entry, dict) or set(entry) != {'kind', 'quote'}:
                rejected += 1; continue
            kind, quote = entry['kind'], entry['quote']
            if not isinstance(kind, str) or kind not in kinds or not isinstance(quote, str) or not 3 <= len(quote) <= 350:
                rejected += 1; continue
            first = text.find(quote)
            # Reject repeated occurrences instead of silently choosing a location.
            if first < 0 or text.find(quote, first + 1) >= 0 or (group, kind, quote) in seen:
                rejected += 1; continue
            clause_start = max(text.rfind(mark, 0, first) for mark in '.!?\n') + 1
            ends = [text.find(mark, first + len(quote)) for mark in '.!?\n']
            clause_end = min([v for v in ends if v >= 0] or [len(text)])
            if group == 'requests' and _negated_request(text[clause_start:clause_end]):
                rejected += 1; continue
            seen.add((group, kind, quote))
            accepted.append({'id': f'{group}-{len(accepted)+1}', 'kind': kind, 'label': kinds[kind],
                             'quote': quote, 'start': utf16_offset(text, first),
                             'end': utf16_offset(text, first + len(quote))})
        result[group] = accepted
    count = sum(map(len, result.values()))
    if rejected and not count:
        raise DomainError('ungrounded_output', 'No model evidence passed source validation. Review the message manually.')
    notices = ['This shows claims made in a message, not verified facts. Exact quotes do not prove the model interpreted them correctly.',
               'No link, number, account or identity has been checked. No evidence found does not mean a message is safe.']
    if rejected:
        notices.append(f'{rejected} unsupported, duplicate, ambiguous or negated model item(s) were omitted. Review the original text for missing context.')
    if not count:
        notices.append('The model extracted no supported evidence. Use the manual checklist; the sender remains unverified.')
    return result, notices


def make_checklist(requests=()):
    checks = [
        ('identity', 'Check the claimed identity', 'Using a contact you already knew or an independently located official site, ask whether this person or organization sent the message.'),
        ('channel', 'Choose a route outside this message', 'Do not rely on the message’s link, reply address, new number or caller ID. Use a previously known contact, an independently located official site, or speak in person.'),
        ('request', 'Check the exact request separately', 'Through that independent route, ask whether the specific action and any changed instructions are genuine. A familiar name alone does not verify the request.'),
    ]
    extra = {
        'payment': ('payment', 'Check payment or account changes', 'Before acting, independently confirm the reason and intended recipient. Never treat details supplied only in this message as verified.'),
        'credential': ('credential', 'Keep passwords and login codes private', 'Do not share passwords or one-time login codes in a reply. Open your familiar account app or contact support through a known route.'),
        'remote_access': ('access', 'Pause remote-access requests', 'Do not grant device access based on this message. Independently check the claimed support request before any action.'),
        'software': ('install', 'Pause unfamiliar installations', 'Independently verify why software is requested and obtain it through a source you already trust, not a message link.'),
        'link': ('link', 'Use your familiar app or website', 'Do not use the supplied link as proof. Open the app or website you already know and check the request there.'),
        'channel_change': ('change', 'Check the new contact route', 'Verify a claimed new number or account through the old contact route or in person before switching.'),
        'secrecy': ('secrecy', 'Get a second perspective', 'A secrecy request is a reason to pause. Discuss the request with a trusted person through an independent route.'),
        'urgency': ('urgency', 'Pause the deadline pressure', 'Allow time to check. A demand for immediate action does not authenticate the sender.'),
    }
    for kind in dict.fromkeys(item['kind'] for item in requests):
        if kind in extra:
            checks.append(extra[kind])
    return [{'id': key, 'title': title, 'why': why, 'state': 'pending', 'source_type': None}
            for key, title, why in checks]


def manual_checklist():
    return {'checks': make_checklist(), 'notices': ['Manual review: no AI analysis has been performed.',
        'These steps record your own checks; they cannot authenticate a sender or establish safety.']}


def validate_check_update(state, source_type):
    if not isinstance(state, str) or (source_type is not None and not isinstance(source_type, str)) or state not in STATES or source_type not in SOURCES | {None}:
        raise DomainError('invalid_check', 'Choose a supported check state and contact source.', 400)
    if state == 'confirmed' and source_type not in SOURCES - {'none'}:
        raise DomainError('independent_source_required', 'A confirmation needs a route obtained independently of the message.', 400)
    if state != 'pending' and source_type is None:
        raise DomainError('invalid_check', 'Choose a contact source or no independent route.', 400)
    return {'state': state, 'source_type': source_type}


def validate_session_identity(client_id, revision):
    if not isinstance(client_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{16,80}', client_id):
        raise DomainError('invalid_client', 'A random browser session identifier is required.', 400)
    if type(revision) is not int or not 0 <= revision <= 2**31-1:
        raise DomainError('invalid_revision', 'A valid request revision is required.', 400)


class MemoryStore:
    """Bounded, expiring per-tab state. Input is absent while the model runs."""
    def __init__(self, clock=time.monotonic, ttl=TTL_SECONDS, max_sessions=64):
        self.clock, self.ttl, self.max_sessions = clock, ttl, max_sessions
        self.entries, self.lock = {}, threading.Lock()

    def _purge(self):
        now = self.clock()
        for client in [k for k, v in self.entries.items() if now - v['touched'] >= self.ttl]:
            del self.entries[client]

    def cleanup(self):
        with self.lock:
            self._purge()

    def begin(self, client_id, revision):
        validate_session_identity(client_id, revision)
        with self.lock:
            self._purge()
            old = self.entries.get(client_id)
            if old and revision <= old['revision']:
                raise DomainError('stale', 'This request was replaced. Analyze the current message again.', 409)
            if not old and len(self.entries) >= self.max_sessions:
                raise DomainError('busy', 'Too many local sessions. Clear an existing session or wait.', 429)
            ticket = secrets.token_urlsafe(18)
            self.entries[client_id] = {'revision': revision, 'ticket': ticket, 'touched': self.clock(), 'analysis': None}
            return ticket

    def finish(self, client_id, revision, ticket, text, evidence, notices):
        with self.lock:
            self._purge()
            entry = self.entries.get(client_id)
            if not entry or entry['revision'] != revision or entry['ticket'] != ticket:
                raise DomainError('stale', 'The message was cleared or replaced before analysis completed.', 409)
            analysis = {'id': secrets.token_urlsafe(24), 'text': text, **deepcopy(evidence),
                        'checks': make_checklist(evidence['requests']), 'notices': list(notices)}
            entry.update(analysis=analysis, touched=self.clock())
            return deepcopy(analysis)

    def reset(self, client_id, revision):
        # A text-free tombstone prevents older in-flight work from recreating state.
        self.begin(client_id, revision)

    def update_check(self, client_id, revision, analysis_id, check_id, state, source_type):
        validate_session_identity(client_id, revision)
        update = validate_check_update(state, source_type)
        if not isinstance(analysis_id, str) or not isinstance(check_id, str):
            raise DomainError('invalid_check', 'A current analysis and check identifier are required.', 400)
        with self.lock:
            self._purge()
            entry = self.entries.get(client_id)
            if not entry or entry['revision'] != revision or not entry['analysis'] or entry['analysis']['id'] != analysis_id:
                raise DomainError('stale', 'This analysis expired or belongs to a different session. Analyze again.', 409)
            check = next((v for v in entry['analysis']['checks'] if v['id'] == check_id), None)
            if check is None:
                raise DomainError('invalid_check', 'This check is not part of the current analysis.', 400)
            check.update(update)
            entry['touched'] = self.clock()
            return deepcopy(entry['analysis'])
