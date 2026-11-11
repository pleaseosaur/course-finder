import pytest

import app as app_module
from tests.helpers import meeting, section

SECTIONS = {
    "MATH": [
        section("10", "MATH 341", meeting("MWF", "09:00", "09:50")),
        section("11", "MATH 341", meeting("MWF", "10:00", "10:50")),
    ],
    "CSCI": [
        section("20", "CSCI 447", meeting("MWF", "10:00", "10:50")),
    ],
}


FETCHED_AT = 1_800_000_000  # 2027-01-15T08:00:00Z


class FakeBanner:
    cache_ttl = 900

    def __init__(self):
        self.section_requests = []

    def sections_fetched_at(self, term, subject):
        return FETCHED_AT if subject in SECTIONS else None

    def get_terms(self):
        return [{"code": "202710", "description": "Winter 2027", "view_only": False}]

    def get_subjects(self, term):
        return [{"code": "CSCI", "description": "Computer Science"}, {"code": "MATH", "description": "Mathematics"}]

    def get_sections(self, term, subject):
        self.section_requests.append(subject)
        return SECTIONS.get(subject.upper(), []) if term == "202710" else []


@pytest.fixture
def banner(monkeypatch):
    fake = FakeBanner()
    monkeypatch.setattr(app_module, "banner", fake)
    return fake


@pytest.fixture
def client(banner):
    return app_module.app.test_client()


def selections(*pairs):
    return [{"subject": subject, "crn": crn} for subject, crn in pairs]


def test_terms(client):
    assert client.get("/api/terms").get_json()[0]["code"] == "202710"


def test_subjects(client):
    assert [s["code"] for s in client.get("/api/terms/202710/subjects").get_json()] == ["CSCI", "MATH"]


def test_sections_for_one_subject(client, banner):
    crns = [s["crn"] for s in client.get("/api/terms/202710/sections?subject=CSCI").get_json()]
    assert crns == ["20"]
    assert banner.section_requests == ["CSCI"]


def test_subject_codes_with_spaces_and_slashes(client, banner):
    for subject in ("I T", "A/HI"):
        assert client.get("/api/terms/202710/sections", query_string={"subject": subject}).status_code == 200
    assert banner.section_requests == ["I T", "A/HI"]


def test_sections_rejects_bad_subject(client, banner):
    for query in ("", "?subject=", "?subject=CSCI;DROP", "?subject=" + "A" * 20):
        assert client.get(f"/api/terms/202710/sections{query}").status_code == 400
    assert banner.section_requests == []


def test_schedules(client, banner):
    response = client.post("/api/terms/202710/schedules", json={
        "selections": selections(("MATH", "10"), ("MATH", "11"), ("CSCI", "20")),
        "num_courses": 2, "max_gap": 20,
    })
    body = response.get_json()
    assert response.status_code == 200
    assert body["total"] == 1
    assert body["truncated"] is False
    assert body["schedules"][0]["crns"] == ["10", "20"]
    assert body["schedules"][0]["credits_min"] == 8
    assert body["schedules"][0]["sections"][1]["meetings"][0]["start"] == "10:00"
    # only the subjects the selections came from are looked up
    assert set(banner.section_requests) == {"MATH", "CSCI"}


def test_schedules_rejects_unknown_crn(client):
    response = client.post("/api/terms/202710/schedules",
                           json={"selections": selections(("MATH", "10"), ("CSCI", "99"))})
    assert response.status_code == 400
    assert "99" in response.get_json()["error"]


def test_schedules_rejects_bad_input(client):
    for body in ({}, {"selections": []}, {"selections": [{"crn": "10"}]},
                 {"selections": selections(("MATH", "10")), "max_gap": "soon"}):
        assert client.post("/api/terms/202710/schedules", json=body).status_code == 400


def test_schedules_default_to_wwu_credit_max(client, monkeypatch):
    seen = {}

    def fake_build(sections, **kwargs):
        seen.update(kwargs)
        return [], 0, False

    monkeypatch.setattr(app_module, "build_schedules", fake_build)
    client.post("/api/terms/202710/schedules", json={"selections": selections(("MATH", "10"))})
    assert seen["max_credits"] == app_module.WWU_MAX_CREDITS
    client.post("/api/terms/202710/schedules",
                json={"selections": selections(("MATH", "10")), "max_credits": 20})
    assert seen["max_credits"] == 20


def test_health_does_not_call_banner(client, banner):
    assert client.get("/api/health").get_json() == {"status": "ok"}
    assert banner.section_requests == []


@pytest.fixture
def dist(tmp_path, monkeypatch):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<title>Course Finder</title>")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)")
    monkeypatch.setattr(app_module, "FRONTEND_DIST", tmp_path)
    return tmp_path


def test_serves_built_frontend(client, dist):
    page = client.get("/")
    assert page.status_code == 200 and b"Course Finder" in page.data
    asset = client.get("/assets/index-abc123.js")
    assert asset.status_code == 200
    assert "max-age=31536000" in asset.headers["Cache-Control"]


def test_unknown_paths_fall_back_to_the_app_but_not_for_api(client, dist):
    assert b"Course Finder" in client.get("/some/page").data
    assert client.get("/api/nope").status_code == 404


def test_cannot_read_files_outside_dist(client, dist):
    (dist.parent / "secret.txt").write_text("secret")
    response = client.get("/../secret.txt")
    assert b"secret" not in response.data
    response = client.get("/assets/%2e%2e/%2e%2e/secret.txt")
    assert b"secret" not in response.data


def test_no_frontend_build_means_404(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module, "FRONTEND_DIST", tmp_path / "missing")
    assert client.get("/").status_code == 404


def test_schedules_report_data_age(client):
    body = client.post("/api/terms/202710/schedules", json={"selections": selections(("MATH", "10"))}).get_json()
    assert body["fetched_at"] == "2027-01-15T08:00:00+00:00"
    assert body["fresh_until"] == "2027-01-15T08:15:00+00:00"


def test_plans_return_current_details(client, banner):
    response = client.post("/api/terms/202710/plans", json={"plans": [
        selections(("CSCI", "20"), ("MATH", "10")),
        selections(("MATH", "11"), ("CSCI", "20"), ("MATH", "99")),
    ]})
    body = response.get_json()
    assert response.status_code == 200
    first, second = body["plans"]
    assert first["crns"] == ["10", "20"]  # earliest to latest
    assert (first["missing"], first["conflict"]) == ([], False)
    assert second["crns"] == ["20", "11"]  # same start time: by course code
    assert (second["missing"], second["conflict"]) == (["99"], True)
    assert body["fresh_until"] == "2027-01-15T08:15:00+00:00"
    assert set(banner.section_requests) == {"MATH", "CSCI"}


def test_plans_reject_bad_input(client):
    for body in ({}, {"plans": []}, {"plans": "x"}, {"plans": [[]]}, {"plans": [selections(("MA TH;", "1"))]},
                 {"plans": [selections(("MATH", "10"))] * 51}):
        assert client.post("/api/terms/202710/plans", json=body).status_code == 400
