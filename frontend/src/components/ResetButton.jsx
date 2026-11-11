import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog.jsx";

// Start over, behind a confirmation so a stray click never wipes anyone's plan.
export default function ResetButton({ onReset }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button type="button" className="reset-button" onClick={() => setConfirming(true)}>
        Reset
      </button>
      <ConfirmDialog
        open={confirming}
        title="Start over?"
        cancelLabel="Keep my plan"
        confirmLabel="Reset everything"
        danger
        onConfirm={() => {
          setConfirming(false);
          onReset();
        }}
        onCancel={() => setConfirming(false)}
      >
        This clears your saved courses and My Plan for every term, your build settings, search filters and any
        schedules you've built. It can't be undone.
      </ConfirmDialog>
    </>
  );
}
