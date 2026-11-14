// A message about something that went wrong. The red bar carries the meaning
// and the text stays in the normal ink colour.
export function ErrorNotice({ children, details = [] }: { children: string; details?: readonly string[] }) {
  return (
    <div role="alert" className="min-w-0 border-l-4 border-hit pl-3 text-ink [overflow-wrap:anywhere]">
      <p>{children}</p>
      {details.length === 0 ? null : (
        <ul className="mt-1 list-disc pl-5">
          {details.map((detail, i) => (
            <li key={i}>{detail}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
