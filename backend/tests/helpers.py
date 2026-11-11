from datetime import date

from models import Meeting, Section

TERM_START = date(2027, 1, 5)
TERM_END = date(2027, 3, 19)


def hm(text):
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def meeting(days, start, end, start_date=TERM_START, end_date=TERM_END, kind="L"):
    return Meeting(frozenset(days), hm(start), hm(end), start_date, end_date, kind)


def section(crn, course, *meetings, credits=4, credits_max=None, term="202710"):
    subject, number = course.split()
    return Section(
        term=term, crn=crn, subject=subject, number=number, title=course,
        credits_min=credits, credits_max=credits if credits_max is None else credits_max,
        meetings=tuple(meetings),
    )
