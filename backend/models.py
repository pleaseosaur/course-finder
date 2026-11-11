"""Course section data model and conversion from Banner's JSON.

A Section is identified by (term, crn). CRNs are only unique within a term,
but every scheduling run works inside a single term, so the CRN alone is
used as the key there.

At WWU a section's lab (or other required component) is not a separate
linked CRN: it is listed as an extra meeting inside the same CRN. Every
meeting of a section therefore blocks out time, so a CRN's `meetings` list
is its full time requirement.
"""

import html
from dataclasses import dataclass, field
from datetime import date, datetime

DAYS = "MTWRFSU"  # Mon..Sun; R = Thursday, S = Saturday, U = Sunday
_BANNER_DAY_KEYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")


# Banner section attributes worth showing students: WWU's General University
# Requirements (GURs) and Writing Proficiency points, as code -> full name.
# Students know them by code, so tags show the code and the name on hover.
# Other attributes (delivery method, department tags, fees) are dropped.
REQUIREMENTS = {
    "ACOM": "Communication, block A",
    "BCOM": "Communication, block B",
    "CCOM": "Communication, block C",
    "HUM": "Humanities",
    "SSC": "Social Sciences",
    "QSR": "Quantitative and Symbolic Reasoning",
    "SCI": "Natural Sciences",
    "LSCI": "Natural Sciences with lab",
    "ACGM": "Comparative, Gender and Multicultural Studies, block A",
    "BCGM": "Comparative, Gender and Multicultural Studies, block B",
    "WP1": "Writing Proficiency, 1 point",
    "WP2": "Writing Proficiency, 2 points",
    "WP3": "Writing Proficiency, 3 points",
}


def _minutes(hhmm):
    """Banner time string '1340' -> minutes since midnight (820)."""
    return int(hhmm[:2]) * 60 + int(hhmm[2:])


def format_minutes(minutes):
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def _parse_date(value):
    return datetime.strptime(value, "%m/%d/%Y").date() if value else None


@dataclass(frozen=True)
class Meeting:
    """One recurring meeting pattern, e.g. lecture MWF 11:00-11:50."""
    days: frozenset          # subset of DAYS
    start: int               # minutes since midnight
    end: int
    start_date: date | None = None
    end_date: date | None = None
    kind: str = ""           # Banner meetingScheduleType: L lecture, B lab, ...
    location: str = ""

    def dates_overlap(self, other):
        # missing dates are treated as spanning the whole term
        if None in (self.start_date, self.end_date, other.start_date, other.end_date):
            return True
        return self.start_date <= other.end_date and other.start_date <= self.end_date

    def to_dict(self):
        return {
            "days": "".join(d for d in DAYS if d in self.days),
            "start": format_minutes(self.start),
            "end": format_minutes(self.end),
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "kind": self.kind,
            "location": self.location,
        }


@dataclass(frozen=True)
class Requirement:
    """A GUR or Writing Proficiency attribute, e.g. HUM / Humanities."""
    code: str
    name: str

    @property
    def is_gur(self):
        return not self.code.startswith("WP")

    def to_dict(self):
        return {"code": self.code, "name": self.name, "gur": self.is_gur}


@dataclass(frozen=True)
class Section:
    term: str
    crn: str
    subject: str
    number: str
    title: str
    credits_min: float
    credits_max: float
    schedule_type: str = ""
    instructor: str = ""
    method: str = ""         # FTF, HYBD, DIOL, ...
    seats_available: int | None = None
    seats_total: int | None = None
    wait_count: int | None = None
    meetings: tuple = field(default_factory=tuple)  # timed meetings only; () = no set time
    # online/hybrid with no set meeting time; arranged in-person courses
    # (research, thesis, internship) have no set time but aren't async
    asynchronous: bool = False
    requirements: tuple = field(default_factory=tuple)  # Requirement, in REQUIREMENTS order

    @property
    def course_key(self):
        """Sections sharing this key are alternatives for the same course."""
        return f"{self.subject} {self.number}"

    @property
    def has_set_time(self):
        return bool(self.meetings)

    def earliest_start(self):
        """Earliest clock time this section meets on any day (None if no set time)."""
        return min((m.start for m in self.meetings), default=None)

    def to_dict(self):
        return {
            "term": self.term,
            "crn": self.crn,
            "course": self.course_key,
            "subject": self.subject,
            "number": self.number,
            "title": self.title,
            "credits_min": self.credits_min,
            "credits_max": self.credits_max,
            "schedule_type": self.schedule_type,
            "instructor": self.instructor,
            "method": self.method,
            "seats_available": self.seats_available,
            "seats_total": self.seats_total,
            "wait_count": self.wait_count,
            "meetings": [m.to_dict() for m in self.meetings],
            "asynchronous": self.asynchronous,
            "requirements": [r.to_dict() for r in self.requirements],
        }


def _parse_meeting(meeting_time):
    if not meeting_time.get("beginTime") or not meeting_time.get("endTime"):
        return None  # asynchronous or TBA: takes no time slot
    days = frozenset(d for d, key in zip(DAYS, _BANNER_DAY_KEYS) if meeting_time.get(key))
    if not days:
        return None
    building = meeting_time.get("building") or ""
    room = meeting_time.get("room") or ""
    return Meeting(
        days=days,
        start=_minutes(meeting_time["beginTime"]),
        end=_minutes(meeting_time["endTime"]),
        start_date=_parse_date(meeting_time.get("startDate")),
        end_date=_parse_date(meeting_time.get("endDate")),
        kind=meeting_time.get("meetingScheduleType") or "",
        location=f"{building} {room}".strip(),
    )


def _credits(raw):
    # creditHours is usually null; the real value is creditHourLow, and
    # variable-credit sections ('TO' / 'OR' indicator) also set creditHourHigh.
    low = raw.get("creditHourLow")
    if low is None:
        low = raw.get("creditHours") or 0
    high = raw.get("creditHourHigh")
    return float(low), float(high if high is not None else low)


def _primary_instructor(raw):
    faculty = raw.get("faculty") or []
    primary = next((f for f in faculty if f.get("primaryIndicator")), faculty[0] if faculty else None)
    return html.unescape(primary.get("displayName") or "") if primary else ""


def _requirements(raw):
    found = {}
    for attribute in raw.get("sectionAttributes") or []:
        code = attribute.get("code") or ""
        description = html.unescape(attribute.get("description") or "")
        if code in REQUIREMENTS:
            found[code] = Requirement(code, REQUIREMENTS[code])
        elif description.startswith(f"GUR {code}-"):
            # a GUR added after REQUIREMENTS was written: "GUR XYZ-Some Name"
            found[code] = Requirement(code, description.removeprefix(f"GUR {code}-"))
    order = list(REQUIREMENTS)
    return tuple(sorted(found.values(), key=lambda r: order.index(r.code) if r.code in order else len(order)))


def section_from_banner(raw):
    """Convert one item of Banner's searchResults `data` list into a Section."""
    meetings = []
    async_component = False
    for mf in raw.get("meetingsFaculty") or []:
        meeting_time = mf.get("meetingTime") or {}
        async_component |= meeting_time.get("meetingTypeDescription") == "Asynchronous"
        meeting = _parse_meeting(meeting_time)
        if meeting is not None:
            meetings.append(meeting)
    credits_min, credits_max = _credits(raw)
    method = raw.get("instructionalMethod") or ""
    return Section(
        term=raw["term"],
        crn=raw["courseReferenceNumber"],
        subject=raw["subject"],
        number=raw["courseNumber"],
        title=html.unescape(raw.get("courseTitle") or ""),  # Banner HTML-escapes text
        credits_min=credits_min,
        credits_max=credits_max,
        schedule_type=html.unescape(raw.get("scheduleTypeDescription") or ""),
        instructor=_primary_instructor(raw),
        method=method,
        seats_available=raw.get("seatsAvailable"),
        seats_total=raw.get("maximumEnrollment"),
        wait_count=raw.get("waitCount"),
        meetings=tuple(meetings),
        asynchronous=not meetings and (method not in ("", "FTF") or async_component),
        requirements=_requirements(raw),
    )
