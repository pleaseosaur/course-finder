import { describeTimes } from "./format.js";

// A plan entry is a saved copy of one built schedule, identified by its CRNs.
// It also keeps when its details came from Banner (fetched_at), when newer
// details could be fetched (fresh_until), sections Banner no longer lists
// (missing), whether its classes overlap (conflict) and unread changes.
export const planKey = (schedule) => [...schedule.crns].sort().join("-");

const TOP_LABELS = ["Plan A", "Plan B", "Plan C"];

export const planLabel = (index) => TOP_LABELS[index] ?? `Alternate ${index - TOP_LABELS.length + 1}`;

// every section a plan was saved with, including ones Banner has since dropped
export const planSections = (entry) => [...entry.sections, ...(entry.missing || [])];

// A saved plan updated with a refreshed copy from the API, noting what changed.
export function mergeRefreshed(entry, fresh, freshness) {
  const before = new Map(planSections(entry).map((s) => [s.crn, s]));
  const changes = [...(entry.changes || [])];
  for (const s of fresh.sections) {
    const old = before.get(s.crn);
    if (!old) continue;
    if ((old.instructor || "") !== (s.instructor || "")) {
      changes.push(`${s.course}: instructor is now ${s.instructor || "TBA"} (was ${old.instructor || "TBA"})`);
    }
    if (describeTimes(old) !== describeTimes(s)) {
      changes.push(`${s.course}: now meets ${describeTimes(s)} (was ${describeTimes(old)})`);
    }
  }
  return {
    ...entry,
    sections: fresh.sections,
    credits_min: fresh.credits_min,
    credits_max: fresh.credits_max,
    missing: fresh.missing.map((crn) => before.get(crn)).filter(Boolean),
    conflict: fresh.conflict,
    changes: [...new Set(changes)],
    ...freshness,
  };
}

// What a student should know about a plan since it was saved
export function planNotes(entry) {
  return [
    ...(entry.missing || []).map((s) => `${s.course} (CRN ${s.crn}) is no longer listed in Banner`),
    ...(entry.conflict ? ["Some of these classes now overlap"] : []),
    ...(entry.changes || []),
  ];
}
