import copy
from datetime import date

from models import section_from_banner

# Trimmed from a real Banner searchResults item (Winter 2027, CSCI 102):
# the lab is a second meeting inside the same CRN, not a separate section.
LECTURE_LAB = {
    "term": "202710",
    "courseReferenceNumber": "10061",
    "subject": "CSCI",
    "courseNumber": "102",
    "courseTitle": "Computer-Mediated Communications",
    "creditHours": None,
    "creditHourLow": 4,
    "creditHourHigh": None,
    "creditHourIndicator": None,
    "scheduleTypeDescription": "Lecture/Lab",
    "instructionalMethod": "FTF",
    "seatsAvailable": 20,
    "maximumEnrollment": 24,
    "waitCount": 0,
    "faculty": [{"displayName": "Instructor, Example", "primaryIndicator": True}],
    "meetingsFaculty": [
        {"meetingTime": {
            "beginTime": "1100", "endTime": "1150", "startDate": "01/05/2027", "endDate": "03/19/2027",
            "building": "CF", "room": "110", "meetingScheduleType": "L",
            "monday": True, "tuesday": False, "wednesday": True, "thursday": False,
            "friday": True, "saturday": False, "sunday": False,
        }},
        {"meetingTime": {
            "beginTime": "1400", "endTime": "1550", "startDate": "01/05/2027", "endDate": "03/19/2027",
            "building": "KB", "room": "307", "meetingScheduleType": "B",
            "monday": False, "tuesday": False, "wednesday": False, "thursday": True,
            "friday": False, "saturday": False, "sunday": False,
        }},
    ],
}


def test_lab_meeting_is_part_of_the_section():
    s = section_from_banner(LECTURE_LAB)
    assert s.crn == "10061"
    assert s.course_key == "CSCI 102"
    assert s.instructor == "Instructor, Example"
    assert [(sorted(m.days), m.start, m.end, m.kind) for m in s.meetings] == [
        (["F", "M", "W"], 11 * 60, 11 * 60 + 50, "L"),
        (["R"], 14 * 60, 15 * 60 + 50, "B"),
    ]
    assert s.meetings[0].start_date == date(2027, 1, 5)
    assert s.meetings[1].location == "KB 307"


def test_untimed_meetings_are_dropped():
    raw = copy.deepcopy(LECTURE_LAB)
    for mf in raw["meetingsFaculty"]:
        mf["meetingTime"]["beginTime"] = None
        mf["meetingTime"]["endTime"] = None
    s = section_from_banner(raw)
    assert s.meetings == ()
    assert not s.has_set_time
    assert not s.asynchronous  # in-person with no set time is arranged, not async
    assert s.earliest_start() is None


def test_credits_use_low_and_high_values():
    assert section_from_banner(LECTURE_LAB).credits_min == 4.0
    assert section_from_banner(LECTURE_LAB).credits_max == 4.0

    variable = dict(LECTURE_LAB, creditHours=1, creditHourLow=1, creditHourHigh=2, creditHourIndicator="TO")
    s = section_from_banner(variable)
    assert (s.credits_min, s.credits_max) == (1.0, 2.0)


def test_to_dict_formats_times():
    d = section_from_banner(LECTURE_LAB).to_dict()
    assert d["course"] == "CSCI 102"
    assert d["meetings"][0]["days"] == "MWF"
    assert d["meetings"][1] == {
        "days": "R", "start": "14:00", "end": "15:50",
        "start_date": "2027-01-05", "end_date": "2027-03-19", "kind": "B", "location": "KB 307",
    }


def test_banner_html_entities_are_decoded():
    raw = dict(LECTURE_LAB, courseTitle="Math Applications &amp; Reasoning")
    assert section_from_banner(raw).title == "Math Applications & Reasoning"


def _without_times(raw, meeting_type="Class"):
    raw = copy.deepcopy(raw)
    for mf in raw["meetingsFaculty"]:
        mf["meetingTime"].update(beginTime=None, endTime=None, meetingTypeDescription=meeting_type)
    return raw


def test_online_section_with_no_set_time_is_asynchronous():
    online = dict(_without_times(LECTURE_LAB), instructionalMethod="DIOL")
    assert section_from_banner(online).asynchronous
    assert section_from_banner(online).to_dict()["asynchronous"] is True


def test_asynchronous_meeting_type_marks_section_asynchronous():
    assert section_from_banner(_without_times(LECTURE_LAB, "Asynchronous")).asynchronous


def test_online_section_with_set_times_is_not_asynchronous():
    assert not section_from_banner(dict(LECTURE_LAB, instructionalMethod="DIOL")).asynchronous


def test_gur_and_writing_attributes_become_requirements():
    raw = dict(LECTURE_LAB, sectionAttributes=[
        {"code": "FTF", "description": "DELIVERY Face-to-Face"},
        {"code": "WP3", "description": "WP3 Writing Proficiency 3 Pts"},
        {"code": "HistField-US", "description": "HistField-US-United States"},
        {"code": "QSR", "description": "GUR QSR-Quant&amp;Symbolic Reason"},
        {"code": "HUM", "description": "GUR HUM-Humanities"},
    ])
    requirements = section_from_banner(raw).to_dict()["requirements"]
    assert [r["code"] for r in requirements] == ["HUM", "QSR", "WP3"]
    assert requirements[0] == {"code": "HUM", "name": "Humanities", "gur": True}
    assert requirements[2]["gur"] is False


def test_unknown_gur_code_keeps_banner_name():
    raw = dict(LECTURE_LAB, sectionAttributes=[{"code": "NEW", "description": "GUR NEW-Brand New Area"}])
    [requirement] = section_from_banner(raw).requirements
    assert (requirement.code, requirement.name) == ("NEW", "Brand New Area")


def test_section_without_attributes_has_no_requirements():
    assert section_from_banner(LECTURE_LAB).to_dict()["requirements"] == []


def test_seat_counts():
    full = dict(LECTURE_LAB, seatsAvailable=0, waitCount=3)
    assert section_from_banner(LECTURE_LAB).to_dict()["seats_total"] == 24
    assert (section_from_banner(full).seats_available, section_from_banner(full).wait_count) == (0, 3)
