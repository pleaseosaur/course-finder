"""Build conflict-free class schedules from a student's selected sections.

The student picks any number of sections (CRNs). Sections of the same
course are alternatives, so a schedule contains at most one section per
course. Every meeting of a section (lecture, lab, ...) blocks out time.

A schedule is an unordered set of CRNs, and the search builds each set
exactly once, so the same classes in a different order never appear twice.
Each schedule's sections are listed earliest to latest.
"""

import heapq
import math
from collections import defaultdict

from models import DAYS

DEFAULT_LIMIT = 500
# Stop searching after this many matches so an unconstrained request
# (many courses, no credit cap) can't run for minutes.
MAX_MATCHES = 200_000


def meetings_conflict(a, b):
    return (
        bool(a.days & b.days)
        and a.dates_overlap(b)
        and a.start < b.end
        and b.start < a.end
    )


def sections_conflict(a, b):
    return any(meetings_conflict(ma, mb) for ma in a.meetings for mb in b.meetings)


def largest_gap(schedule):
    """Longest wait in minutes between back-to-back meetings on the same day.

    Meetings whose date ranges don't overlap (e.g. first-half and second-half
    quarter classes) are never back to back, so they don't create a gap.
    """
    largest = 0
    for day in DAYS:
        day_meetings = [m for s in schedule for m in s.meetings if day in m.days]
        for m in day_meetings:
            next_starts = [o.start for o in day_meetings if o.start >= m.end and o.dates_overlap(m)]
            if next_starts:
                largest = max(largest, min(next_starts) - m.end)
    return largest


def order_sections(sections):
    """Earliest to latest by first meeting time; sections with no set time last."""
    return tuple(sorted(
        sections,
        key=lambda s: (s.earliest_start() if s.has_set_time else math.inf, s.course_key, s.crn),
    ))


def _schedule_sort_key(schedule):
    starts = tuple(s.earliest_start() if s.has_set_time else math.inf for s in schedule)
    return (-len(schedule), starts, tuple(s.crn for s in schedule))


def _group_by_course(sections):
    groups = defaultdict(dict)
    for s in sections:
        groups[s.course_key][s.crn] = s  # dict drops duplicate CRNs
    return [list(groups[key].values()) for key in sorted(groups)]


def _search(groups, num_courses, max_credits):
    """Yield every conflict-free set of sections, one section per chosen course.

    Pruning happens while the set is built: a section that conflicts with
    one already chosen, or pushes the minimum credit total over the cap, is
    never extended further.
    """
    chosen = []

    def visit(i, credits_min):
        remaining = len(groups) - i
        if num_courses is not None and len(chosen) + remaining < num_courses:
            return
        if i == len(groups) or (num_courses is not None and len(chosen) == num_courses):
            if chosen:
                yield tuple(chosen)
            return
        for section in groups[i]:
            new_credits = credits_min + section.credits_min
            if max_credits is not None and new_credits > max_credits:
                continue
            if any(sections_conflict(section, other) for other in chosen):
                continue
            chosen.append(section)
            yield from visit(i + 1, new_credits)
            chosen.pop()
        yield from visit(i + 1, credits_min)  # leave this course out

    yield from visit(0, 0.0)


def build_schedules(sections, max_gap=None, num_courses=None, min_credits=None,
                    max_credits=None, limit=DEFAULT_LIMIT, max_matches=MAX_MATCHES):
    """Return (schedules, total_matching, truncated).

    sections     -- the student's selected Section objects (one term)
    max_gap      -- max minutes between back-to-back classes on a day (None = any)
    num_courses  -- exact number of courses per schedule (None = any size)
    min_credits  -- schedule must be able to reach this many credits
    max_credits  -- schedule's minimum credit total must not exceed this

    Variable-credit sections count as their low value against max_credits
    and their high value toward min_credits.

    schedules is at most `limit` items, each a tuple of Sections ordered
    earliest to latest. Larger schedules come first, then those that start
    earliest. total_matching counts every schedule that passed the filters;
    if it reaches max_matches the search stops early and truncated is True,
    so the returned schedules are the best of those found so far.
    """
    terms = {s.term for s in sections}
    if len(terms) > 1:
        raise ValueError(f"sections span multiple terms: {sorted(terms)}")
    if num_courses is not None and num_courses < 1:
        raise ValueError("num_courses must be at least 1")

    total = 0

    def matching():
        nonlocal total
        for schedule in _search(_group_by_course(sections), num_courses, max_credits):
            if min_credits is not None and sum(s.credits_max for s in schedule) < min_credits:
                continue
            if max_gap is not None and largest_gap(schedule) > max_gap:
                continue
            total += 1
            yield order_sections(schedule)
            if total >= max_matches:
                return

    if limit is None:
        best = sorted(matching(), key=_schedule_sort_key)
    else:
        best = heapq.nsmallest(limit, matching(), key=_schedule_sort_key)
    return best, total, total >= max_matches

