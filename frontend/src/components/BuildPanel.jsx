import { useState } from "react";
import { api } from "../api.js";

export default function BuildPanel({ term, selected, onResults }) {
  const [maxGap, setMaxGap] = useState("");
  const [maxCredits, setMaxCredits] = useState("");
  const [numCourses, setNumCourses] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function build(event) {
    event.preventDefault();
    setRunning(true);
    setError("");
    try {
      const body = await api.schedules(term, {
        selections: selected.map((s) => ({ subject: s.subject, crn: s.crn })),
        max_gap: maxGap,
        max_credits: maxCredits,
        num_courses: numCourses,
      });
      onResults({ ...body, id: Date.now(), basis: selected.map((s) => s.crn) });
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel build" aria-labelledby="build-heading">
      <h2 id="build-heading">Build schedules</h2>
      <form onSubmit={build}>
        <div className="build-fields">
          <label className="field">
            <span>Max minutes between classes</span>
            <input type="number" min="0" step="5" placeholder="No limit" value={maxGap}
                   onChange={(e) => setMaxGap(e.target.value)} />
          </label>
          <label className="field">
            <span>Max credits</span>
            <input type="number" min="1" placeholder="18" value={maxCredits}
                   onChange={(e) => setMaxCredits(e.target.value)} />
          </label>
          <label className="field">
            <span>Number of courses</span>
            <input type="number" min="1" placeholder="Any" value={numCourses}
                   onChange={(e) => setNumCourses(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="primary" disabled={!selected.length || running}>
          {running ? "Building…" : selected.length ? "Build schedules" : "Add courses to build schedules"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </section>
  );
}
