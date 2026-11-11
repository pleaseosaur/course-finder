import { forwardRef, useState } from "react";
import { describeFreeWeekdays, describeSeats, describeTimes, formatCredits } from "../format.js";
import WeekGrid from "./WeekGrid.jsx";
import RequirementTags from "./RequirementTags.jsx";

// Which cards are collapsed, by key; everything starts expanded.
export function useCollapsed() {
  const [collapsed, setCollapsed] = useState(() => new Set());
  const toggle = (key) =>
    setCollapsed((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  return { collapsed, toggle, expandAll: () => setCollapsed(new Set()), collapseAll: (keys) => setCollapsed(new Set(keys)) };
}

// One schedule: a header that collapses it, and its classes with a week view.
// `lead` and `actions` are controls either side of the header's toggle;
// `notes` are things that changed since a plan was saved.
const ScheduleCard = forwardRef(function ScheduleCard(
  { schedule, id, title, badge, notes = [], onDismissNotes, open, onToggle, lead, actions, style, dragging },
  ref,
) {
  const freeDays = describeFreeWeekdays(schedule.sections);
  const classes = ["schedule", open && "open", dragging && "dragging"].filter(Boolean).join(" ");
  return (
    <li ref={ref} style={style} className={classes}>
      <div className="schedule-header">
        {lead}
        <button
          type="button"
          className="schedule-toggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <span className="chevron" aria-hidden="true" />
          <h3>{title}</h3>
          {badge && <span className="badge plan-badge">{badge}</span>}
          {notes.length > 0 && <span className="badge changed-badge">Changed</span>}
          <span className="muted">
            {schedule.sections.length} {schedule.sections.length === 1 ? "course" : "courses"} ·{" "}
            {formatCredits(schedule.credits_min, schedule.credits_max)} credits
          </span>
          {freeDays && <span className="free-days">{freeDays}</span>}
          {!open && (
            <span className="schedule-summary small">{schedule.sections.map((s) => s.course).join(" · ")}</span>
          )}
        </button>
        {actions && <div className="schedule-actions">{actions}</div>}
      </div>
      <div id={id} className="schedule-body" hidden={!open}>
        {notes.length > 0 && (
          <div className="notice plan-notes">
            <ul>
              {notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
            {onDismissNotes && (
              <button type="button" className="link-button no-print" onClick={onDismissNotes}>
                Got it
              </button>
            )}
          </div>
        )}
        <ol className="schedule-sections">
          {schedule.sections.map((s, n) => (
            <li key={s.crn}>
              <span className={`swatch c${n % 6}`} aria-hidden="true" />
              <div>
                <strong>{s.course}</strong> <span className="mono muted">CRN {s.crn}</span>{" "}
                <RequirementTags requirements={s.requirements} />
                <div className="small">{s.instructor || "Instructor TBA"}</div>
                <div className="small muted">{describeTimes(s)}</div>
                {describeSeats(s) && (
                  <div className={s.seats_available > 0 ? "small seats" : "small seats full"}>{describeSeats(s)}</div>
                )}
              </div>
            </li>
          ))}
        </ol>
        <WeekGrid sections={schedule.sections} />
      </div>
    </li>
  );
});

export default ScheduleCard;
