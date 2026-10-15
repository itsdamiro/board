import type { Brand } from "./api";

// The brand's notes, as the API returns them: plain text, shown as text (ADR 001, amendment on plain text). The Moodboard
// panel is left out because the grid shows what it holds (ADR 002, amendment on the screens).

export default function Notes({ brand }: { brand: Brand }) {
  const panels = brand.panels.filter((panel) => panel.title.toLowerCase() !== "moodboard");
  return (
    <div className="flex flex-col gap-6">
      {brand.hub_problem !== null && (
        <p role="alert" className="text-sm text-destructive">
          {brand.hub_problem}
        </p>
      )}
      {panels.length === 0 && brand.hub_problem === null && <p className="text-sm text-muted-foreground">This brand has no other notes.</p>}
      {panels.map((panel) => (
        <section key={panel.title} className="flex flex-col gap-2">
          <h3 className="text-xl">{panel.title}</h3>
          {panel.problem !== null ? (
            <p className="text-sm text-destructive">{panel.problem}</p>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{panel.text}</p>
          )}
        </section>
      ))}
    </div>
  );
}
