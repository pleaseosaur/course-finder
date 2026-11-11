import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "../api.js";
import { mergeRefreshed, planKey, planLabel, planNotes, planSections } from "../plan.js";
import ScheduleCard, { useCollapsed } from "./ScheduleCard.jsx";

export default function MyPlan({ term, plans, termName, onChange, onRemove, onRestore }) {
  const { collapsed, toggle, expandAll, collapseAll } = useCollapsed();
  const [removed, setRemoved] = useState(null); // { schedule, index, label }, for Undo
  const keys = plans.map(planKey);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    onChange(arrayMove(plans, keys.indexOf(active.id), keys.indexOf(over.id)));
  }

  function remove(schedule, index) {
    setRemoved({ schedule, index, label: planLabel(index) });
    onRemove(schedule);
  }

  function undo() {
    onRestore(removed.schedule, removed.index);
    setRemoved(null);
  }

  const labelOf = (id) => planLabel(keys.indexOf(id));
  const announcements = {
    onDragStart: ({ active }) => `Picked up ${labelOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over && over.id !== active.id ? `${labelOf(active.id)} is over ${labelOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) => (over ? `${labelOf(active.id)} moved to the position of ${labelOf(over.id)}.` : undefined),
    onDragCancel: ({ active }) => `Stopped moving ${labelOf(active.id)}.`,
  };

  return (
    <section className="my-plan" aria-labelledby="plan-heading">
      <div className="results-heading">
        <div className="plan-title">
          <h2 id="plan-heading">
            My Plan{termName && <span className="muted"> · {termName}</span>}
          </h2>
          {plans.length > 0 && <RefreshButton term={term} plans={plans} onChange={onChange} />}
        </div>
        {plans.length > 0 && (
          <div className="results-actions no-print">
            {plans.length > 1 && (
              <>
                <button type="button" className="link-button" onClick={expandAll}>
                  Expand all
                </button>
                <button type="button" className="link-button" onClick={() => collapseAll(keys)}>
                  Collapse all
                </button>
              </>
            )}
            <button type="button" className="link-button" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </div>
        )}
      </div>

      {removed && (
        <p className="notice undo-notice no-print" role="status">
          Removed {removed.label}.{" "}
          <button type="button" className="link-button" onClick={undo}>
            Undo
          </button>
        </p>
      )}

      {plans.length === 0 ? (
        <p className="muted plan-empty">
          Nothing here yet. Build schedules, then press + on the ones you'd like to keep.
        </p>
      ) : (
        <>
          <p className="muted small no-print">
            Drag to reorder. Course details and availability can change; please confirm prior to registration.
          </p>
          <p className="muted small print-only">
            Printed {new Date().toLocaleDateString()}. Course details and availability can change; please confirm
            prior to registration.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            accessibility={{ announcements }}
          >
            <SortableContext items={keys} strategy={verticalListSortingStrategy}>
              <ol className="schedule-list">
                {plans.map((schedule, index) => (
                  <PlanCard
                    key={keys[index]}
                    id={keys[index]}
                    schedule={schedule}
                    label={planLabel(index)}
                    open={!collapsed.has(keys[index])}
                    onToggle={() => toggle(keys[index])}
                    onRemove={() => remove(schedule, index)}
                    onDismissChanges={() =>
                      onChange(plans.map((p, i) => (i === index ? { ...p, changes: [] } : p)))
                    }
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}
    </section>
  );
}

function PlanCard({ id, schedule, label, open, onToggle, onRemove, onDismissChanges }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <ScheduleCard
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      dragging={isDragging}
      schedule={schedule}
      id={`plan-${id}`}
      title={label}
      notes={planNotes(schedule)}
      onDismissNotes={schedule.changes?.length ? onDismissChanges : undefined}
      open={open}
      onToggle={onToggle}
      lead={
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="drag-handle no-print"
          aria-label={`Reorder ${label}`}
          title="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      }
      actions={
        <>
          {/* only CRNs Banner still lists */}
          <CopyCrns crns={schedule.sections.map((s) => s.crn)} label={label} />
          <button
            type="button"
            className="icon-button remove"
            onClick={onRemove}
            aria-label={`Remove ${label} from My Plan`}
            title="Remove from My Plan"
          >
            −
          </button>
        </>
      }
    />
  );
}

// CRNs are what a student types into registration
function CopyCrns({ crns, label }) {
  const [status, setStatus] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    let next = "Copied";
    try {
      await navigator.clipboard.writeText(crns.join(", "));
    } catch {
      next = "Couldn't copy";
    }
    setStatus(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus(""), 2000);
  }

  return (
    <button type="button" className="copy-button" onClick={copy} aria-label={`Copy CRNs for ${label}`}>
      <span aria-live="polite">{status || "Copy CRNs"}</span>
    </button>
  );
}

// Fetches the plans' details again. Banner's seat counts are live and it
// reports no update time, so the server's 15-minute cache sets the pace:
// Refresh unlocks once that copy has expired.
function RefreshButton({ term, plans, onChange }) {
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const times = (field) => plans.map((p) => p[field] && Date.parse(p[field])).filter(Boolean);
  const freshUntil = times("fresh_until");
  // plans saved before this was tracked can always refresh
  const availableAt = freshUntil.length === plans.length ? Math.min(...freshUntil) : 0;
  const waitMinutes = Math.ceil((availableAt - now) / 60_000);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try {
      const request = plans.map((p) => planSections(p).map((s) => ({ subject: s.subject, crn: s.crn })));
      const body = await api.plans(term, request);
      const freshness = { fetched_at: body.fetched_at, fresh_until: body.fresh_until };
      onChange(plans.map((p, i) => mergeRefreshed(p, body.plans[i], freshness)));
      setNow(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="copy-button no-print"
        onClick={refresh}
        disabled={refreshing || waitMinutes > 0}
        title={waitMinutes > 0 ? "Banner details are checked at most every 15 minutes" : "Get current details from Banner"}
      >
        {refreshing ? "Refreshing…" : waitMinutes > 0 ? `Refresh in ${waitMinutes} min` : "Refresh details"}
      </button>
      {error && <span className="small error no-print">Couldn't refresh: {error}</span>}
    </>
  );
}
