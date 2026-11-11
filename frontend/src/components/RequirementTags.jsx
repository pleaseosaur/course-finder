// Small GUR / Writing Proficiency tags by code; the full name shows on hover.
export default function RequirementTags({ requirements }) {
  // lists saved before requirements were added have none
  if (!requirements?.length) return null;
  return (
    <span className="req-tags">
      {requirements.map((r) => (
        <span key={r.code} className={r.gur ? "req-tag" : "req-tag wp"} title={r.name}>
          {r.code}
        </span>
      ))}
    </span>
  );
}
