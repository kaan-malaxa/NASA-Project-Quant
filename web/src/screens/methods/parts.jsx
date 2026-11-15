import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** One Methods section: heading, one plain-language paragraph, content. */
export function MethodsSection({ id, title, intro, children }) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="bg-card scroll-mt-[calc(var(--sticky-offset,0px)+1rem)] space-y-4 rounded-xl border p-5 shadow-sm sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      {intro ? <p className="text-muted-foreground max-w-3xl leading-relaxed text-pretty">{intro}</p> : null}
      {children}
    </section>
  );
}

/**
 * Small data table. columns: [{ key, label, align?: "right", render?: (row) => node }].
 */
export function DataTable({ caption, columns, rows, rowKey }) {
  return (
    <Table className="text-sm">
      {caption ? <TableCaption className="mt-2 text-left">{caption}</TableCaption> : null}
      <TableHeader>
        <TableRow>
          {columns.map((c) => (
            <TableHead key={c.key} className={c.align === "right" ? "text-right" : undefined}>
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r, i) => (
          <TableRow key={rowKey ? rowKey(r, i) : i}>
            {columns.map((c) => (
              <TableCell
                key={c.key}
                className={`${c.align === "right" ? "text-right tabular-nums" : ""} align-top whitespace-normal`}
              >
                {c.render ? c.render(r) : (r[c.key] ?? "—")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function RegionHeading({ name }) {
  return <h3 className="text-lg font-semibold">{name}</h3>;
}
