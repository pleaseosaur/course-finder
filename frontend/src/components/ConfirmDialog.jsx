import { useEffect, useId, useRef } from "react";

// A modal "are you sure?" that is open while `open` is true. Cancel has
// focus, so Enter, Esc or a click outside never confirms by accident.
// Every way out calls onConfirm or onCancel directly rather than reading the
// dialog's returnValue, which outlives each close and once let a dismissal
// repeat the previous confirm.
export default function ConfirmDialog({ open, title, children, cancelLabel, confirmLabel, danger, onConfirm, onCancel }) {
  const dialog = useRef(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const id = useId();

  useEffect(() => {
    const d = dialog.current;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // Esc: let the parent close it, so `open` stays the single source of truth
  useEffect(() => {
    const d = dialog.current;
    const onEscape = (event) => {
      event.preventDefault();
      cancel.current();
    };
    d.addEventListener("cancel", onEscape);
    return () => d.removeEventListener("cancel", onEscape);
  }, []);

  return (
    <dialog
      ref={dialog}
      className="confirm"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{children}</p>
      <div className="confirm-actions">
        <button type="button" className="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </button>
        <button type="button" className={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
