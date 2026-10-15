import ThemeSwitch from "./ThemeSwitch";

// A placeholder until slice 3b's screens exist: it proves the toolchain, the tokens, the fonts and the theme switch.
export default function App() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-3xl">Board</h1>
        <ThemeSwitch />
      </header>
      <p className="text-muted-foreground">Pick a brand to see its notes and images. The page is not built yet.</p>
      <p className="font-mono text-sm text-muted-foreground">127.0.0.1</p>
    </main>
  );
}
