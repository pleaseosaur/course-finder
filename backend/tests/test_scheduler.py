from datetime import date

import pytest

from scheduler import build_schedules, largest_gap, sections_conflict
from tests.helpers import meeting, section


def crn_sets(schedules):
    return [[s.crn for s in schedule] for schedule in schedules]


def test_lab_meeting_blocks_time():
    # the lecture times are compatible; only the Thursday lab collides
    lecture_lab = section("1", "CSCI 102", meeting("MWF", "11:00", "11:50"), meeting("R", "14:00", "15:50", kind="B"))
    thursday = section("2", "MATH 341", meeting("TR", "15:00", "15:50"))
    assert sections_conflict(lecture_lab, thursday)

    schedules, total, _ = build_schedules([lecture_lab, thursday], num_courses=2)
    assert schedules == [] and total == 0


def test_back_to_back_classes_do_not_conflict():
    a = section("1", "CSCI 367", meeting("MWF", "10:00", "10:50"))
    b = section("2", "CSCI 447", meeting("MWF", "10:50", "11:40"))
    assert not sections_conflict(a, b)


def test_non_overlapping_date_ranges_do_not_conflict():
    first_half = section("1", "PE 101", meeting("TR", "09:00", "09:50", end_date=date(2027, 2, 5)))
    second_half = section("2", "PE 102", meeting("TR", "09:00", "09:50", start_date=date(2027, 2, 8)))
    assert not sections_conflict(first_half, second_half)
    # and the gap check doesn't treat them as back to back
    assert largest_gap((first_half, second_half)) == 0


def test_same_crns_in_any_order_appear_once_earliest_first():
    late = section("3", "CSCI 405", meeting("MWF", "13:00", "13:50"))
    early = section("1", "MATH 341", meeting("MWF", "09:00", "09:50"))
    middle = section("2", "CSCI 367", meeting("MWF", "11:00", "11:50"))

    for order in ([late, early, middle], [middle, late, early], [early, middle, late]):
        schedules, total, _ = build_schedules(order, num_courses=3)
        assert total == 1
        assert crn_sets(schedules) == [["1", "2", "3"]]


def test_one_section_per_course():
    a1 = section("1", "CSCI 367", meeting("MWF", "10:00", "10:50"))
    a2 = section("2", "CSCI 367", meeting("MWF", "12:00", "12:50"))
    b = section("3", "CSCI 447", meeting("MWF", "11:00", "11:50"))

    schedules, _, _ = build_schedules([a1, a2, b], num_courses=2)
    assert crn_sets(schedules) == [["1", "3"], ["3", "2"]]

    schedules, _, _ = build_schedules([a1, a2], num_courses=2)
    assert schedules == []


def test_max_gap():
    a = section("1", "MATH 341", meeting("MWF", "09:00", "09:50"))
    b = section("2", "CSCI 447", meeting("MWF", "10:00", "10:50"))  # 10 min after a
    c = section("3", "CSCI 405", meeting("MWF", "13:00", "13:50"))  # 130 min after b

    schedules, _, _ = build_schedules([a, b, c], max_gap=20, num_courses=3)
    assert schedules == []
    schedules, _, _ = build_schedules([a, b, c], max_gap=20, num_courses=2)
    assert crn_sets(schedules) == [["1", "2"]]
    schedules, _, _ = build_schedules([a, b, c], max_gap=130, num_courses=3)
    assert crn_sets(schedules) == [["1", "2", "3"]]


def test_gap_is_measured_to_the_next_class_only():
    a = section("1", "MATH 341", meeting("T", "09:00", "09:50"))
    b = section("2", "CSCI 447", meeting("T", "10:00", "10:50"))
    c = section("3", "CSCI 405", meeting("T", "11:00", "11:50"))
    assert largest_gap((a, b, c)) == 10


def test_credit_limits_with_variable_credits():
    four = section("1", "CSCI 367", meeting("M", "09:00", "09:50"), credits=4)
    five = section("2", "CSCI 447", meeting("M", "10:00", "10:50"), credits=5)
    variable = section("3", "CSCI 498", credits=1, credits_max=5)  # async, 1-5 credits

    schedules, _, _ = build_schedules([four, five, variable], max_credits=9)
    assert ["1", "2", "3"] not in crn_sets(schedules)  # 10 credits minimum
    assert ["1", "2"] in crn_sets(schedules)

    schedules, _, _ = build_schedules([four, five, variable], min_credits=9)
    # the variable section can be taken for 5, so 4 + 1..5 reaches 9
    assert crn_sets(schedules) == [["1", "2", "3"], ["1", "2"], ["1", "3"], ["2", "3"]]


def test_any_size_when_num_courses_not_given_largest_first():
    a = section("1", "MATH 341", meeting("MWF", "09:00", "09:50"))
    b = section("2", "CSCI 447", meeting("MWF", "09:30", "10:20"))  # conflicts with a
    c = section("3", "CSCI 405", meeting("MWF", "11:00", "11:50"))

    schedules, total, _ = build_schedules([a, b, c])
    assert crn_sets(schedules) == [["1", "3"], ["2", "3"], ["1"], ["2"], ["3"]]
    assert total == 5


def test_async_sections_never_conflict_and_list_last():
    online = section("1", "CSCI 101")
    morning = section("2", "MATH 341", meeting("MTWRF", "08:00", "17:00"))
    schedules, _, _ = build_schedules([online, morning], num_courses=2)
    assert crn_sets(schedules) == [["2", "1"]]


def test_limit_keeps_best_and_reports_total():
    sections = [section(str(i), f"CSCI {100 + i}", meeting("M", f"{8 + i:02d}:00", f"{8 + i:02d}:50"))
                for i in range(6)]
    schedules, total, _ = build_schedules(sections, num_courses=2, limit=3)
    assert total == 15  # C(6, 2)
    assert crn_sets(schedules) == [["0", "1"], ["0", "2"], ["0", "3"]]


def test_duplicate_crns_in_input_are_ignored():
    a = section("1", "MATH 341", meeting("M", "09:00", "09:50"))
    b = section("2", "CSCI 447", meeting("M", "10:00", "10:50"))
    schedules, total, _ = build_schedules([a, a, b, b], num_courses=2)
    assert total == 1 and crn_sets(schedules) == [["1", "2"]]


def test_rejects_mixed_terms():
    with pytest.raises(ValueError):
        build_schedules([section("1", "A 1"), section("2", "B 1", term="202720")])


def test_search_stops_at_max_matches():
    sections = [section(str(i), f"CSCI {100 + i}", meeting("M", f"{8 + i:02d}:00", f"{8 + i:02d}:50"))
                for i in range(6)]
    schedules, total, truncated = build_schedules(sections, max_matches=10)
    assert total == 10 and truncated and len(schedules) == 10
    _, total, truncated = build_schedules(sections)
    assert total == 63 and not truncated  # 2^6 - 1 non-empty sets
