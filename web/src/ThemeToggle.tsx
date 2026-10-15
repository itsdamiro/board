import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { applyTheme, flip, readChoice, resolve, safeStorage, writeChoice, type Choice } from "./theme";

// One icon, in a round button like the column pill beside it, that flips light and dark (ADR 002, amendments on the cards). With nothing remembered the page follows the system.

export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>(() => readChoice(safeStorage()));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  const shown = resolve(choice, systemDark);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const follow = () => setSystemDark(query.matches);
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);

  useEffect(() => applyTheme(document.documentElement, shown), [shown]);

  function toggle() {
    const next = flip(shown);
    setChoice(next);
    writeChoice(safeStorage(), next);
  }

  const Icon = shown === "dark" ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center justify-center rounded-full border border-border bg-card p-2 text-card-foreground shadow-md hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <Icon aria-hidden="true" className="size-5" />
    </button>
  );
}
