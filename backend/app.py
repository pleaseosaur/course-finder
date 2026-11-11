"""Course Finder API.

GET  /api/terms                                   available terms, newest first
GET  /api/terms/<term>/subjects                   subjects offered in a term
GET  /api/terms/<term>/sections?subject=<code>    every section of one subject
POST /api/terms/<term>/schedules                  build schedules from selected CRNs
POST /api/terms/<term>/plans                      current details of saved plans (My Plan)
GET  /api/health                                  liveness check for the host (no Banner call)

Any other path serves the built React app from frontend/dist (production);
in development the Vite dev server serves it instead.
"""

import re
from datetime import datetime, timezone
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory
from werkzeug.security import safe_join

from banner import BannerClient, BannerError
from scheduler import DEFAULT_LIMIT, build_schedules, order_sections, sections_conflict

WWU_MAX_CREDITS = 18  # used when the student doesn't set a maximum
MAX_PLANS = 50
MAX_PLAN_SECTIONS = 30

# Banner subject codes are short and mostly letters, but a few have a space
# or slash ("I T", "A/HI"), so the subject travels as a query parameter
SUBJECT_CODE = re.compile(r"[A-Za-z0-9][A-Za-z0-9 /&]{0,7}")

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

app = Flask(__name__, static_folder=None)
banner = BannerClient()


class BadRequest(Exception):
    pass


@app.errorhandler(BadRequest)
def bad_request(error):
    return jsonify(error=str(error)), 400


@app.errorhandler(BannerError)
def banner_error(error):
    return jsonify(error=str(error)), 502


def _optional_number(body, name, cast=float, minimum=0):
    value = body.get(name)
    if value is None or value == "":
        return None
    try:
        value = cast(value)
    except (TypeError, ValueError):
        raise BadRequest(f"{name} must be a number")
    if value < minimum:
        raise BadRequest(f"{name} must be at least {minimum}")
    return value


def _valid_subject(subject):
    return isinstance(subject, str) and SUBJECT_CODE.fullmatch(subject) is not None


def _lookup_selections(term, selections, max_items=None):
    """[{"subject": "CSCI", "crn": "10061"}, ...] -> (Section objects, CRNs not found).

    The subject says which (cached) subject search the CRN came from, so
    resolving a selection never needs a whole-term fetch.
    """
    if not isinstance(selections, list) or not selections:
        raise BadRequest("selections must be a non-empty list")
    if max_items and len(selections) > max_items:
        raise BadRequest(f"at most {max_items} sections per plan")
    found, unknown = [], []
    for item in selections:
        if not isinstance(item, dict) or not _valid_subject(item.get("subject")) or not item.get("crn"):
            raise BadRequest("each selection needs a subject and a crn")
        crn = str(item["crn"])
        match = next((s for s in banner.get_sections(term, item["subject"]) if s.crn == crn), None)
        if match is None:
            unknown.append(crn)
        else:
            found.append(match)
    return found, unknown


def _resolve_selections(term, selections):
    found, unknown = _lookup_selections(term, selections)
    if unknown:
        raise BadRequest(f"unknown CRNs for term {term}: {unknown}")
    return found


def _iso(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat()


def _freshness(term, subjects):
    """How old the Banner data behind a response is, and when a refetch would get newer data."""
    times = [t for t in (banner.sections_fetched_at(term, s) for s in set(subjects)) if t is not None]
    if not times:
        return {"fetched_at": None, "fresh_until": None}
    oldest = min(times)
    return {"fetched_at": _iso(oldest), "fresh_until": _iso(oldest + banner.cache_ttl)}


def _schedule_json(schedule):
    return {
        "crns": [s.crn for s in schedule],
        "credits_min": sum(s.credits_min for s in schedule),
        "credits_max": sum(s.credits_max for s in schedule),
        "sections": [s.to_dict() for s in schedule],
    }


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/api/terms")
def terms():
    return jsonify(banner.get_terms())


@app.get("/api/terms/<term>/subjects")
def subjects(term):
    return jsonify(banner.get_subjects(term))


@app.get("/api/terms/<term>/sections")
def sections(term):
    subject = request.args.get("subject", "")
    if not _valid_subject(subject):
        raise BadRequest("invalid subject")
    return jsonify([s.to_dict() for s in banner.get_sections(term, subject)])


@app.post("/api/terms/<term>/schedules")
def schedules(term):
    body = request.get_json(silent=True) or {}
    selected = _resolve_selections(term, body.get("selections"))

    max_credits = _optional_number(body, "max_credits")
    results, total, truncated = build_schedules(
        selected,
        max_gap=_optional_number(body, "max_gap", int),
        num_courses=_optional_number(body, "num_courses", int, minimum=1),
        min_credits=_optional_number(body, "min_credits"),
        max_credits=WWU_MAX_CREDITS if max_credits is None else max_credits,
        limit=_optional_number(body, "limit", int, minimum=1) or DEFAULT_LIMIT,
    )
    return jsonify(
        total=total,
        truncated=truncated,
        schedules=[_schedule_json(schedule) for schedule in results],
        **_freshness(term, [s.subject for s in selected]),
    )


@app.post("/api/terms/<term>/plans")
def plans(term):
    """Look up saved plans again: body {"plans": [[{subject, crn}, ...], ...]}.

    Each plan comes back with its sections' current details, the CRNs Banner
    no longer lists, and whether its classes now overlap. Only the subjects
    in the plans are fetched, and those go through the same cache as browsing.
    """
    body = request.get_json(silent=True) or {}
    saved = body.get("plans")
    if not isinstance(saved, list) or not saved or len(saved) > MAX_PLANS:
        raise BadRequest(f"plans must be a list of 1 to {MAX_PLANS} plans")
    refreshed, subjects = [], []
    for selections in saved:
        found, missing = _lookup_selections(term, selections, MAX_PLAN_SECTIONS)
        subjects += [item["subject"].upper() for item in selections]
        schedule = order_sections(found)
        conflict = any(sections_conflict(a, b) for i, a in enumerate(schedule) for b in schedule[i + 1:])
        refreshed.append({**_schedule_json(schedule), "missing": missing, "conflict": conflict})
    return jsonify(plans=refreshed, **_freshness(term, subjects))


@app.get("/", defaults={"path": ""})
@app.get("/<path:path>")
def frontend(path):
    if path.startswith("api/") or not FRONTEND_DIST.is_dir():
        abort(404)
    file = safe_join(str(FRONTEND_DIST), path) if path else None
    if file and Path(file).is_file():
        # Vite fingerprints files in assets/, so they can be cached for good
        max_age = 31_536_000 if path.startswith("assets/") else 0
        return send_from_directory(FRONTEND_DIST, path, max_age=max_age)
    return send_from_directory(FRONTEND_DIST, "index.html", max_age=0)


if __name__ == "__main__":
    # 5000 is taken by AirPlay Receiver on macOS
    app.run(port=5001, debug=True)
