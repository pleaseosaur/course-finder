import { useState } from "react";
import { planKey } from "../plan.js";
import ScheduleCard, { useCollapsed } from "./ScheduleCard.jsx";

const PAGE = 20;

export default function ScheduleResults({ results, selectedCrns, planLabels, onTogglePlan }) {
  const [shown, setShown] = useState(PAGE);
  const { collapsed, toggle, expandAll, collapseAll } = useCollapsed();
  const { schedules, total, truncated, basis } = results;
  const visible = schedules.slice(0, shown);

  const stale = basis.length !== selectedCrns.size || basis.some((crn) => !selectedCrns.has(crn));

  return (
    <section id="results" className="results" aria-labelledby="results-heading">
      <div className="results-heading">
        <h2 id="results-heading">
          {total === 0 ? "No schedules fit" : `${total.toLocaleString()} ${total === 1 ? "schedule" : "schedules"}`}
        </h2>
        {schedules.length > 1 && (
          <div className="results-actions">
            <button type="button" className="link-button" onClick={expandAll}>
              Expand all
            </button>
            <button type="button" className="link-button" onClick={() => collapseAll(schedules.map(planKey))}>
              Collapse all
            </button>
          </div>
        )}
      </div>
      {stale && <p className="notice">Your course list has changed since these were built. Build again to update.</p>}
      {truncated && (
        <p className="notice">
          The search stopped early because there were too many combinations. Add a credit limit, number of courses
          or time-between-classes limit to narrow it down.
        </p>
      )}
      {total > schedules.length && (
        <p className="muted">Showing the first {schedules.length.toLocaleString()}, with the most courses and earliest starts first.</p>
      )}
      {total === 0 && (
        <p className="muted">Try allowing more time between classes, raising the credit limit, or adding more sections.</p>
      )}

      <ol className="schedule-list">
        {visible.map((schedule, i) => {
          const key = planKey(schedule);
          const planned = planLabels.get(key);
          return (
            <ScheduleCard
              key={key}
              schedule={schedule}
              id={`schedule-${key}`}
              title={`Option ${i + 1}`}
              badge={planned}
              open={!collapsed.has(key)}
              onToggle={() => toggle(key)}
              actions={
                <button
                  type="button"
                  className={`icon-button ${planned ? "remove" : "add"}`}
                  onClick={() => onTogglePlan(schedule)}
                  aria-label={`${planned ? "Remove" : "Add"} Option ${i + 1} ${planned ? "from" : "to"} My Plan`}
                  title={planned ? "Remove from My Plan" : "Add to My Plan"}
                >
                  {planned ? "−" : "+"}
                </button>
              }
            />
          );
        })}
      </ol>
      {shown < schedules.length && (
        <button type="button" className="secondary" onClick={() => setShown(shown + PAGE)}>
          Show more
        </button>
      )}
    </section>
  );
}
