import { useEffect, useState } from "react";
import { api } from "./api.js";
import CourseBrowser from "./components/CourseBrowser.jsx";
import BuildPanel from "./components/BuildPanel.jsx";
import SelectedList from "./components/SelectedList.jsx";
import ScheduleResults from "./components/ScheduleResults.jsx";
import ResetButton from "./components/ResetButton.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import MyPlan from "./components/MyPlan.jsx";
import { planKey, planLabel } from "./plan.js";

const SELECTED_PREFIX = "course-finder:selected:";
const PLAN_PREFIX = "course-finder:plan:";

function loadList(prefix, term) {
  try {
    return JSON.parse(localStorage.getItem(prefix + term)) || [];
  } catch {
    return [];
  }
}

function saveList(prefix, term, list) {
  try {
    localStorage.setItem(prefix + term, JSON.stringify(list));
  } catch {
    // storage unavailable (private window etc.): the list just won't persist
  }
}

function clearAllSaved() {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(SELECTED_PREFIX) || key.startsWith(PLAN_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // storage unavailable: nothing was saved
  }
}

// Banner lists every past term as view only; upcoming terms are view only too
// until registration opens, so only view-only terms older than every open
// term count as "older".
function olderTermCheck(list) {
  const oldestOpen = list.filter((t) => !t.view_only).map((t) => t.code).sort()[0];
  return (t) => Boolean(oldestOpen) && t.view_only && t.code < oldestOpen;
}

const viewFromHash = () => (window.location.hash === "#plan" ? "plan" : "build");

const defaultTerm = (list) => (list.find((t) => !t.view_only) || list[0])?.code || "";

export default function App() {
  const [terms, setTerms] = useState([]);
  const [term, setTerm] = useState("");
  const [termError, setTermError] = useState("");
  const [selected, setSelected] = useState([]);
  const [results, setResults] = useState(null);
  const [plans, setPlans] = useState([]);
  const [view, setView] = useState(viewFromHash);
  const [plannerOpen, setPlannerOpen] = useState(true);
  const [showOlderTerms, setShowOlderTerms] = useState(false);
  const [pendingTerm, setPendingTerm] = useState(null); // { code, showOlder } awaiting confirmation
  // bumping this remounts the planner, which resets its subject, filters and build settings
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    api
      .terms()
      .then((list) => {
        setTerms(list);
        setTerm(defaultTerm(list));
      })
      .catch((e) => setTermError(e.message));
  }, []);

  // the page in the address bar, so Back and refresh keep the student's place
  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // each term keeps its own list of selected sections and its own plan
  useEffect(() => {
    if (!term) return;
    setSelected(loadList(SELECTED_PREFIX, term));
    setPlans(loadList(PLAN_PREFIX, term));
    setResults(null);
  }, [term]);

  // functional updates so quick successive clicks never work from a stale list
  function updateSelected(change) {
    setSelected((current) => {
      const next = change(current);
      saveList(SELECTED_PREFIX, term, next);
      return next;
    });
  }

  function updatePlans(change) {
    setPlans((current) => {
      const next = change(current);
      saveList(PLAN_PREFIX, term, next);
      return next;
    });
  }

  const add = (section) =>
    updateSelected((current) => (current.some((s) => s.crn === section.crn) ? current : [...current, section]));
  const remove = (crn) => updateSelected((current) => current.filter((s) => s.crn !== crn));

  const removePlan = (schedule) =>
    updatePlans((current) => current.filter((p) => planKey(p) !== planKey(schedule)));
  // a plan remembers how old its Banner details are, so My Plan can refresh them
  const togglePlan = (schedule) =>
    updatePlans((current) =>
      current.some((p) => planKey(p) === planKey(schedule))
        ? current.filter((p) => planKey(p) !== planKey(schedule))
        : [...current, { ...schedule, fetched_at: results.fetched_at, fresh_until: results.fresh_until }],
    );
  const restorePlan = (schedule, index) =>
    updatePlans((current) =>
      current.some((p) => planKey(p) === planKey(schedule))
        ? current
        : [...current.slice(0, index), schedule, ...current.slice(index)],
    );

  function reset() {
    clearAllSaved();
    setTerm(defaultTerm(terms));
    setSelected([]);
    setPlans([]);
    setResults(null);
    window.location.hash = "";
    setPlannerOpen(true);
    setShowOlderTerms(false);
    setResetCount((n) => n + 1);
  }

  const isOlder = olderTermCheck(terms);
  const visibleTerms = showOlderTerms ? terms : terms.filter((t) => !isOlder(t));
  const hasOlderTerms = terms.some(isOlder);

  // Courses and plans are saved per term, but switching clears built schedules
  // and the subject and filters, so ask first once a student has started.
  const hasWork = selected.length > 0 || plans.length > 0 || results !== null;
  const termName = (code) => terms.find((t) => t.code === code)?.description || code;

  function changeTerm(code, showOlder = showOlderTerms) {
    if (code === term) {
      setShowOlderTerms(showOlder);
    } else if (hasWork) {
      setPendingTerm({ code, showOlder });
    } else {
      setTerm(code);
      setShowOlderTerms(showOlder);
    }
  }

  function toggleOlderTerms(show) {
    // hiding the term being viewed moves back to the default one
    if (!show && isOlder(terms.find((t) => t.code === term) || {})) changeTerm(defaultTerm(terms), false);
    else setShowOlderTerms(show);
  }

  const selectedCrns = new Set(selected.map((s) => s.crn));
  const courseCount = new Set(selected.map((s) => s.course)).size;
  const planLabels = new Map(plans.map((p, i) => [planKey(p), planLabel(i)]));

  return (
    <div className="app">
      <header className="app-header">
        <div className="title">
          <h1>Course Finder</h1>
          <p className="school">Western Washington University</p>
          <p className="tagline">
            A student-built tool to help plan for class registration. Choose the classes you're interested in taking
            and see how they stack up.
          </p>
        </div>
        <div className="term-controls">
          <label className="field term-picker">
            <span>Term</span>
            <select value={term} onChange={(e) => changeTerm(e.target.value)} disabled={!terms.length}>
              {!terms.length && <option>{termError ? "Unavailable" : "Loading…"}</option>}
              {visibleTerms.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.description}
                  {t.view_only ? " (view only)" : ""}
                </option>
              ))}
            </select>
          </label>
          {hasOlderTerms && (
            <label className="checkbox">
              <input type="checkbox" checked={showOlderTerms} onChange={(e) => toggleOlderTerms(e.target.checked)} />
              Show older terms
            </label>
          )}
        </div>
        <ResetButton onReset={reset} />
        <ConfirmDialog
          open={pendingTerm !== null}
          title={pendingTerm && `Switch to ${termName(pendingTerm.code)}?`}
          cancelLabel={`Stay on ${termName(term)}`}
          confirmLabel="Switch term"
          danger={results !== null}
          onConfirm={() => {
            setTerm(pendingTerm.code);
            setShowOlderTerms(pendingTerm.showOlder);
            setPendingTerm(null);
          }}
          onCancel={() => setPendingTerm(null)}
        >
          {results !== null && "The schedules you've built will be cleared, along with your subject and filters. "}
          Your courses and My Plan for {termName(term)} stay saved in this browser and will be here when you switch
          back.
        </ConfirmDialog>
      </header>
      {termError && <p className="error">Couldn't load terms: {termError}</p>}

      <nav className="page-tabs" aria-label="Pages">
        <a href="#build" aria-current={view === "build" ? "page" : undefined}>
          Build
        </a>
        <a href="#plan" aria-current={view === "plan" ? "page" : undefined}>
          My Plan{plans.length > 0 && <span className="tab-count">{plans.length}</span>}
        </a>
      </nav>

      {/* the Build page stays mounted so its search, settings and results are kept */}
      <div hidden={view !== "build"}>
        {term && (
          <section key={resetCount} className="planner" aria-label="Search, settings and course list">
            <button
              type="button"
              className="collapse-bar"
              aria-expanded={plannerOpen}
              aria-controls="planner-body"
              onClick={() => setPlannerOpen((open) => !open)}
            >
              <span className="chevron" aria-hidden="true" />
              <span className="collapse-title">{plannerOpen ? "Hide" : "Show"} search, settings and courses</span>
              {!plannerOpen && (
                <span className="muted small">
                  {selected.length} {selected.length === 1 ? "section" : "sections"}, {courseCount}{" "}
                  {courseCount === 1 ? "course" : "courses"} selected
                </span>
              )}
            </button>
            {/* stays mounted while hidden so the subject, filters and open courses are kept */}
            <main id="planner-body" className="layout" hidden={!plannerOpen}>
              <CourseBrowser term={term} selectedCrns={selectedCrns} onAdd={add} onRemove={remove} />
              <aside className="sidebar">
                <BuildPanel term={term} selected={selected} onResults={setResults} />
                <SelectedList selected={selected} onRemove={remove} />
              </aside>
            </main>
          </section>
        )}

        {results && (
          <ScheduleResults
            key={results.id}
            results={results}
            selectedCrns={selectedCrns}
            planLabels={planLabels}
            onTogglePlan={togglePlan}
          />
        )}
      </div>

      {view === "plan" && term && (
        <MyPlan
          key={`${term}-${resetCount}`}
          term={term}
          plans={plans}
          termName={terms.find((t) => t.code === term)?.description}
          onChange={(next) => updatePlans(() => next)}
          onRemove={removePlan}
          onRestore={restorePlan}
        />
      )}
    </div>
  );
}
