import { DAY_NAMES, DAY_ORDER, formatTime, toMinutes } from "../format.js";

const PX_PER_MINUTE = 0.6;

// A compact week view of one schedule; each course keeps its list colour.
export default function WeekGrid({ sections }) {
  const blocks = sections.flatMap((s, n) =>
    s.meetings.flatMap((m) =>
      [...m.days].map((day) => ({ day, start: toMinutes(m.start), end: toMinutes(m.end), n, s, m })),
    ),
  );
  if (!blocks.length) return null;

  const weekend = blocks.some((b) => b.day === "S" || b.day === "U");
  const days = [...(weekend ? DAY_ORDER : "MTWRF")];
  const first = Math.floor(Math.min(...blocks.map((b) => b.start)) / 60) * 60;
  const last = Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60) * 60;
  const hours = [];
  for (let t = first; t < last; t += 60) hours.push(t);
  const height = (last - first) * PX_PER_MINUTE;

  return (
    <div className="week" style={{ "--days": days.length }} role="img"
         aria-label="Week view of this schedule">
      <div />
      {days.map((d) => (
        <div key={d} className="week-day-name">{DAY_NAMES[d]}</div>
      ))}
      <div className="week-hours" style={{ height }}>
        {hours.map((t) => (
          <span key={t} style={{ top: (t - first) * PX_PER_MINUTE }}>
            {formatTime(`${t / 60}:00`).replace(":00", "")}
          </span>
        ))}
      </div>
      {days.map((d) => (
        <div key={d} className="week-col" style={{ height }}>
          {hours.map((t) => (
            <div key={t} className="week-line" style={{ top: (t - first) * PX_PER_MINUTE }} />
          ))}
          {blocks
            .filter((b) => b.day === d)
            .map((b, i) => (
              <div
                key={i}
                className={`week-block c${b.n % 6}`}
                style={{ top: (b.start - first) * PX_PER_MINUTE, height: (b.end - b.start) * PX_PER_MINUTE }}
                title={`${b.s.course}${b.s.instructor ? ` (${b.s.instructor})` : ""} ${formatTime(b.m.start)}–${formatTime(b.m.end)}`}
              >
                {b.s.course}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
