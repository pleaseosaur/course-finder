import { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { courseNumberSort, describeTimes, formatCredits, formatMeeting } from "../format.js";
import RequirementTags from "./RequirementTags.jsx";

const LEVELS = ["100", "200", "300", "400", "500"];

// "GUR" and "WP" match any GUR or any Writing Proficiency; otherwise one code.
// Lab science (LSCI) courses count toward the Natural Sciences (SCI) GUR.
function meetsRequirement(section, wanted) {
  const requirements = section.requirements || [];
  if (wanted === "GUR") return requirements.some((r) => r.gur);
  if (wanted === "WP") return requirements.some((r) => !r.gur);
  return requirements.some((r) => r.code === wanted || (wanted === "SCI" && r.code === "LSCI"));
}

// one entry per code, keeping the backend's order
function uniqueRequirements(sections) {
  const byCode = new Map();
  for (const s of sections) for (const r of s.requirements || []) byCode.set(r.code, r);
  return [...byCode.values()];
}

export default function CourseBrowser({ term, selectedCrns, onAdd, onRemove }) {
  const [subjects, setSubjects] = useState([]);
  const [subject, setSubject] = useState("");
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [asyncOnly, setAsyncOnly] = useState(false);
  const [requirement, setRequirement] = useState("");
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSubjects([]);
    setSubject("");
    setError("");
    api
      .subjects(term)
      .then((list) => !cancelled && setSubjects(list))
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [term]);

  useEffect(() => {
    setSections([]);
    setExpanded(null);
    if (!subject) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api
      .sections(term, subject)
      .then((list) => !cancelled && setSections(list))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [term, subject]);

  // sections grouped into courses, filtered, sorted by course number
  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    const groups = new Map();
    for (const s of sections) {
      if (openOnly && !(s.seats_available > 0)) continue;
      if (asyncOnly && !s.asynchronous) continue;
      if (requirement && !meetsRequirement(s, requirement)) continue;
      if (level && s.number[0] !== level[0]) continue;
      if (q && !`${s.course} ${s.title} ${s.instructor}`.toLowerCase().includes(q)) continue;
      if (!groups.has(s.course)) groups.set(s.course, { key: s.course, number: s.number, title: s.title, sections: [] });
      groups.get(s.course).sections.push(s);
    }
    return [...groups.values()].sort((a, b) => courseNumberSort(a.number, b.number));
  }, [sections, query, level, openOnly, asyncOnly, requirement]);

  // requirement filter choices: only what this subject actually offers
  const requirementOptions = useMemo(() => {
    const options = uniqueRequirements(sections).filter((r) => r.gur);
    if (options.some((r) => r.code === "LSCI") && !options.some((r) => r.code === "SCI")) {
      options.push({ code: "SCI", name: "Natural Sciences" });
    }
    return options.sort((a, b) => a.code.localeCompare(b.code));
  }, [sections]);
  const offersWriting = sections.some((s) => (s.requirements || []).some((r) => !r.gur));

  // the GUR filter carries over between subjects, unless the new one doesn't offer it
  useEffect(() => {
    if (!requirement || !sections.length) return;
    const offered =
      requirement === "WP" ? offersWriting
      : requirement === "GUR" ? requirementOptions.length > 0
      : requirementOptions.some((r) => r.code === requirement);
    if (!offered) setRequirement("");
  }, [requirement, sections, requirementOptions, offersWriting]);

  return (
    <section className="panel browser" aria-labelledby="browse-heading">
      <h2 id="browse-heading">Browse courses</h2>

      <label className="field">
        <span>Subject</span>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!subjects.length}>
          <option value="">{subjects.length ? "Choose a subject…" : "Loading subjects…"}</option>
          {subjects.map((s) => (
            <option key={s.code} value={s.code}>
              {s.description} ({s.code})
            </option>
          ))}
        </select>
      </label>

      {subject && (
        <div className="filters">
          <label className="field grow">
            <span>Search</span>
            <input
              type="search"
              placeholder="Number, title or instructor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Level</span>
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">All</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {(requirementOptions.length > 0 || offersWriting) && (
            <label className="field">
              <span>GUR</span>
              <select value={requirement} onChange={(e) => setRequirement(e.target.value)}>
                <option value="">All</option>
                {requirementOptions.length > 0 && <option value="GUR">Any GUR</option>}
                {requirementOptions.map((r) => (
                  <option key={r.code} value={r.code} title={r.name}>
                    {r.code}
                  </option>
                ))}
                {offersWriting && (
                  <option value="WP" title="Any Writing Proficiency course">
                    Any WP
                  </option>
                )}
              </select>
            </label>
          )}
          <label className="checkbox">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            Open seats only
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={asyncOnly} onChange={(e) => setAsyncOnly(e.target.checked)} />
            Async only
          </label>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading {subject} sections from WWU…</p>}
      {!loading && subject && !error && !courses.length && <p className="muted">No courses match.</p>}

      <ul className="course-list">
        {courses.map((course) => {
          const isOpen = expanded === course.key;
          const added = course.sections.filter((s) => selectedCrns.has(s.crn)).length;
          return (
            <li key={course.key} className={isOpen ? "course open" : "course"}>
              <button
                type="button"
                className="course-toggle"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : course.key)}
              >
                <span className="course-code">{course.key}</span>
                <span className="course-title">
                  {course.title}
                  <RequirementTags requirements={uniqueRequirements(course.sections)} />
                </span>
                <span className="course-meta">
                  {added > 0 && <span className="badge">{added} added</span>}
                  {course.sections.length} {course.sections.length === 1 ? "section" : "sections"}
                </span>
              </button>
              {isOpen && (
                <SectionTable sections={course.sections} selectedCrns={selectedCrns} onAdd={onAdd} onRemove={onRemove} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SectionTable({ sections, selectedCrns, onAdd, onRemove }) {
  return (
    <div className="table-wrap">
      <table className="sections">
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Add</span>
            </th>
            <th scope="col">CRN</th>
            <th scope="col">Meets</th>
            <th scope="col">Instructor</th>
            <th scope="col">GUR</th>
            <th scope="col">Credits</th>
            <th scope="col">Seats</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => {
            const added = selectedCrns.has(s.crn);
            return (
              <tr key={s.crn} className={added ? "added" : undefined}>
                <td>
                  {added ? (
                    <button
                      type="button"
                      className="icon-button remove"
                      onClick={() => onRemove(s.crn)}
                      aria-label={`Remove CRN ${s.crn}`}
                      title="Remove from my courses"
                    >
                      −
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="icon-button add"
                      onClick={() => onAdd(s)}
                      aria-label={`Add CRN ${s.crn}`}
                      title="Add to my courses"
                    >
                      +
                    </button>
                  )}
                </td>
                <td className="mono">{s.crn}</td>
                <td>
                  {s.meetings.length ? (
                    s.meetings.map((m, i) => <div key={i}>{formatMeeting(m)}</div>)
                  ) : (
                    <span className={s.asynchronous ? "" : "muted"}>{describeTimes(s)}</span>
                  )}
                  <div className="muted small">{s.schedule_type}</div>
                </td>
                <td>{s.instructor || <span className="muted">TBA</span>}</td>
                <td>
                  <RequirementTags requirements={s.requirements} />
                </td>
                <td>{formatCredits(s.credits_min, s.credits_max)}</td>
                <td className={s.seats_available > 0 ? "" : "full"}>{s.seats_available ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
