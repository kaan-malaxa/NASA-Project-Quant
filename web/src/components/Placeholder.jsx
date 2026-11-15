export default function Placeholder({ name, children }) {
  return (
    <section aria-labelledby="placeholder-title" className="space-y-2">
      <h1 id="placeholder-title" className="text-2xl font-semibold">
        {name}
      </h1>
      <p className="text-muted-foreground text-sm">Placeholder screen.</p>
      {children}
    </section>
  );
}
