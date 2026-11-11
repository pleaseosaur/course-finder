import { describeTimes, formatCredits } from "../format.js";
import RequirementTags from "./RequirementTags.jsx";

export default function SelectedList({ selected, onRemove }) {
  const courseCount = new Set(selected.map((s) => s.course)).size;
  const sorted = [...selected].sort((a, b) => a.course.localeCompare(b.course, undefined, { numeric: true }));

  return (
    <section className="panel selected" aria-labelledby="selected-heading">
      <h2 id="selected-heading">
        My courses{" "}
        <span className="muted count">
          {selected.length} {selected.length === 1 ? "section" : "sections"}, {courseCount}{" "}
          {courseCount === 1 ? "course" : "courses"}
        </span>
      </h2>

      {!selected.length && (
        <p className="muted">Pick a subject, open a course and press + on the sections you'd consider taking.</p>
      )}

      <ul className="selected-list">
        {sorted.map((s) => (
          <li key={s.crn}>
            <div className="selected-info">
              <div>
                <strong>{s.course}</strong> <span className="mono muted">CRN {s.crn}</span>
              </div>
              <div className="small">
                {s.title} <RequirementTags requirements={s.requirements} />
              </div>
              <div className="small muted">
                {describeTimes(s)} · {formatCredits(s.credits_min, s.credits_max)} cr
                {s.instructor && ` · ${s.instructor}`}
              </div>
            </div>
            <button
              type="button"
              className="icon-button remove"
              onClick={() => onRemove(s.crn)}
              aria-label={`Remove CRN ${s.crn}`}
              title="Remove from consideration"
            >
              −
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
