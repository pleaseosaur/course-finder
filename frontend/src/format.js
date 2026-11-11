export const DAY_ORDER = "MTWRFSU";
export const DAY_NAMES = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri", S: "Sat", U: "Sun" };

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatMeeting(meeting) {
  const lab = meeting.kind === "B" ? " (lab)" : "";
  return `${meeting.days} ${formatTime(meeting.start)}–${formatTime(meeting.end)}${lab}`;
}

export function formatCredits(min, max) {
  return min === max ? `${min}` : `${min}–${max}`;
}

export function courseNumberSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

// All of a section's meeting times, or why it has none.
export function describeTimes(section) {
  if (section.meetings.length) return section.meetings.map(formatMeeting).join(", ");
  return section.asynchronous ? "Async (online)" : "No set time";
}

const WEEKDAY_PLURALS = { M: "Mondays", T: "Tuesdays", W: "Wednesdays", R: "Thursdays", F: "Fridays" };

// "No classes on Mondays & Fridays" for the weekdays a schedule leaves free.
// Schedules with no set meeting times at all get no note.
export function describeFreeWeekdays(sections) {
  const busy = new Set(sections.flatMap((s) => s.meetings.flatMap((m) => [...m.days])));
  if (!busy.size) return "";
  const free = [..."MTWRF"].filter((d) => !busy.has(d)).map((d) => WEEKDAY_PLURALS[d]);
  if (!free.length) return "";
  const list = free.length === 1 ? free[0] : `${free.slice(0, -1).join(", ")} & ${free.at(-1)}`;
  return `No classes on ${list}`;
}

// "12 of 30 seats open", or "Full · 3 on waitlist"; "" when Banner gave no count
export function describeSeats(section) {
  const open = section.seats_available;
  if (open == null) return "";
  if (open <= 0) return section.wait_count > 0 ? `Full · ${section.wait_count} on waitlist` : "Full";
  const seats = open === 1 ? "seat" : "seats";
  return section.seats_total ? `${open} of ${section.seats_total} ${seats} open` : `${open} ${seats} open`;
}
