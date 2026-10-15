import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { applyTheme, CHOICES, readChoice, resolve, safeStorage, writeChoice, type Choice } from "./theme";

const LABELS: Record<Choice, string> = { system: "System", light: "Light", dark: "Dark" };

export default function ThemeSwitch() {
  const [choice, setChoice] = useState<Choice>(() => readChoice(safeStorage()));

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applyTheme(document.documentElement, resolve(choice, query.matches));
    apply();
    if (choice !== "system") return;
    query.addEventListener("change", apply); // following the system means following it when it changes
    return () => query.removeEventListener("change", apply);
  }, [choice]);

  function pick(next: Choice) {
    setChoice(next);
    writeChoice(safeStorage(), next);
  }

  return (
    <fieldset className="inline-flex rounded-md border border-border bg-card p-0.5">
      <legend className="sr-only">Theme</legend>
      {CHOICES.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={choice === name}
          onClick={() => pick(name)}
          className={cn(
            "rounded-sm px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring",
            choice === name ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {LABELS[name]}
        </button>
      ))}
    </fieldset>
  );
}
