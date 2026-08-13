export default function EmptyState({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}) {
  return (
    <div className="callout warn">
      <span className="icon">!</span>
      <span>
        <b>{title}</b>
        {hint && (
          <>
            <br />
            <span style={{ fontSize: 12, color: "var(--muted)" }}>{hint}</span>
          </>
        )}
      </span>
    </div>
  );
}
