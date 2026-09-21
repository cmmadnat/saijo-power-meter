/**
 * Placeholder for a screen that later steps build. It states what the screen
 * will contain, taken from the customer specification, so the shell can be
 * reviewed without standing in fake readings that could be mistaken for real
 * ones.
 */
export function PendingScreen({
  title,
  source,
  step,
  summary,
  contents,
}: {
  title: string;
  source: string;
  step: string;
  summary: string;
  contents: { heading: string; items: string[] }[];
}) {
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-border pb-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {source}
        </p>
        <h1 className="text-2xl font-semibold tracking-wide">{title}</h1>
        <p className="max-w-[70ch] text-sm text-muted-foreground">{summary}</p>
      </header>

      <div className="flex items-center gap-3 border border-dashed border-border bg-muted/40 px-4 py-3">
        <span className="bg-primary px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-primary-foreground">
          {step}
        </span>
        <p className="text-sm text-muted-foreground">
          Not built yet. The shell, theme and navigation are what step 1
          delivers.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2">
        {contents.map((group) => (
          <div key={group.heading} className="bg-card p-4">
            <h2 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {group.heading}
            </h2>
            <ul className="flex flex-col gap-1 text-sm">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="text-primary">
                    ·
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
