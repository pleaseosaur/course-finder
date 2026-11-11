"""Client for WWU's Banner class search JSON endpoints.

Sections are fetched one subject at a time (about a second each) rather
than a whole term at once (about half a minute).

Banner keeps the selected term and the last search in the HTTP session: a
second search on the same session returns the first search's results. So
every search uses its own requests.Session.
"""

import html
import threading
import time

import requests

from models import section_from_banner

BASE_URL = "https://registration.banner.wwu.edu/StudentRegistrationSsb/ssb"
PAGE_SIZE = 500   # Banner's maximum page size
CACHE_TTL = 15 * 60  # seconds; seat counts change, so don't cache forever
TIMEOUT = 30


class BannerError(RuntimeError):
    pass


class BannerClient:
    def __init__(self, base_url=BASE_URL, cache_ttl=CACHE_TTL):
        self.base_url = base_url
        self.cache_ttl = cache_ttl
        self._cache = {}  # key -> (monotonic fetch time, wall-clock fetch time, value)
        self._lock = threading.Lock()

    def _cached(self, key, fetch):
        with self._lock:
            hit = self._cache.get(key)
            if hit and time.monotonic() - hit[0] < self.cache_ttl:
                return hit[2]
        value = fetch()
        with self._lock:
            self._cache[key] = (time.monotonic(), time.time(), value)
        return value

    def sections_fetched_at(self, term, subject):
        """When the cached sections of `subject` came from Banner (Unix time), or None.

        Banner itself reports no update times: its seat counts are live, so
        the age of this cache is how out of date the data can be.
        """
        hit = self._cache.get(("sections", term, subject.upper()))
        return hit[1] if hit else None

    def _get_json(self, session, path, **params):
        response = session.get(f"{self.base_url}/{path}", params=params, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()

    def get_terms(self, max_terms=20):
        """Terms newest first: [{"code", "description", "view_only"}]."""
        def fetch():
            with requests.Session() as session:
                raw = self._get_json(session, "classSearch/getTerms", searchTerm="", offset=1, max=max_terms)
            return [
                {
                    "code": t["code"],
                    "description": t["description"].replace("(View Only)", "").strip(),
                    "view_only": "(View Only)" in t["description"],
                }
                for t in raw
            ]
        return self._cached(("terms", max_terms), fetch)

    def get_subjects(self, term):
        """Subjects offered in `term`: [{"code": "CSCI", "description": "Computer Science"}]."""
        def fetch():
            with requests.Session() as session:
                raw = self._get_json(session, "classSearch/get_subject", searchTerm="", term=term, offset=1, max=500)
            return [{"code": s["code"], "description": html.unescape(s["description"])} for s in raw]
        return self._cached(("subjects", term), fetch)

    def get_sections(self, term, subject):
        """Every section of `subject` offered in `term`, as Section objects."""
        subject = subject.upper()
        return self._cached(("sections", term, subject), lambda: self._fetch_sections(term, subject))

    def _fetch_sections(self, term, subject):
        with requests.Session() as session:
            # selecting the term sets the session state the search depends on
            response = session.post(
                f"{self.base_url}/term/search", params={"mode": "search"}, data={"term": term}, timeout=TIMEOUT
            )
            response.raise_for_status()

            raw_sections = []
            offset = 0
            while True:
                page = self._get_json(
                    session, "searchResults/searchResults",
                    txt_term=term, txt_subject=subject, pageOffset=offset, pageMaxSize=PAGE_SIZE,
                )
                if not page.get("success", True):
                    raise BannerError(f"Banner search failed for {subject} in term {term}")
                raw_sections.extend(page.get("data") or [])
                offset += PAGE_SIZE
                if offset >= (page.get("totalCount") or 0):
                    break

        sections = [section_from_banner(raw) for raw in raw_sections]
        # guard against a stale session returning another search's results
        wrong = {(s.term, s.subject) for s in sections} - {(term, subject)}
        if wrong:
            raise BannerError(f"Banner returned {sorted(wrong)} when asked for {subject} in term {term}")
        return sections
