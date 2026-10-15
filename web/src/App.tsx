import { useEffect, useState } from "react";
import { getBrand, listBrands, type Brand } from "./api";
import BrandList from "./BrandList";
import Composer from "./Composer";
import Grid from "./Grid";
import { readLastBrand, writeLastBrand } from "./lastBrand";
import Notes from "./Notes";
import ThemeSwitch from "./ThemeSwitch";

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Something went wrong.";
}

export default function App() {
  const [brands, setBrands] = useState<string[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    listBrands(controller.signal).then(
      (list) => {
        setBrands(list);
        const remembered = readLastBrand();
        setSlug(remembered !== null && list.includes(remembered) ? remembered : (list[0] ?? null));
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(message(failure));
      },
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    // A file dropped anywhere on the page must not be opened by the browser, whether or not there is an input to take it.
    const hold = (event: DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    document.addEventListener("dragover", hold);
    document.addEventListener("drop", hold);
    return () => {
      document.removeEventListener("dragover", hold);
      document.removeEventListener("drop", hold);
    };
  }, []);

  useEffect(() => {
    if (slug === null) return;
    const controller = new AbortController();
    getBrand(slug, controller.signal).then(
      (view) => {
        setBrand(view);
        setError(null);
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) setError(message(failure));
      },
    );
    return () => controller.abort();
  }, [slug, reload]);

  const refresh = () => setReload((n) => n + 1);

  function choose(next: string) {
    if (next === slug) {
      if (brand === null) refresh(); // the brand did not load: asking again is how to retry
      return;
    }
    setBrand(null);
    setError(null);
    setSlug(next);
    writeLastBrand(next);
  }


  return (
    <div className="mx-auto grid max-w-7xl gap-8 p-6 md:grid-cols-[14rem_1fr]">
      <aside className="flex flex-col gap-6">
        <h1 className="text-3xl">Board</h1>
        <ThemeSwitch />
        {brands !== null && <BrandList brands={brands} current={slug} onChoose={choose} />}
      </aside>
      <main className="flex min-w-0 flex-col gap-6">
        {error !== null && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {brands !== null && brands.length === 0 && <p className="text-muted-foreground">The vault has no brands under Brands/.</p>}
        {slug !== null && brand === null && error === null && <p className="text-muted-foreground">Loading…</p>}
        {brand !== null && (
          <>
            <header className="flex flex-col gap-2">
              <h2 className="text-2xl">{brand.slug}</h2>
              {(brand.status !== null || brand.client !== null) && (
                <p className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {brand.status !== null && <span className="rounded-md border border-border px-2 py-0.5">{brand.status}</span>}
                  {brand.client !== null && <span className="rounded-md border border-border px-2 py-0.5">{brand.client}</span>}
                </p>
              )}
              {brand.summary !== "" && <p className="text-sm">{brand.summary}</p>}
            </header>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <section aria-label="Moodboard" className="flex min-w-0 flex-col gap-6">
                {brand.moodboard.exists ? (
                  <Composer slug={brand.slug} onAdded={refresh} />
                ) : (
                  <p className="text-muted-foreground">This brand has no Moodboard note. Create one in the vault and the board will add to it.</p>
                )}
                {brand.moodboard.problem !== null && (
                  <p role="alert" className="text-destructive">
                    {brand.moodboard.problem}
                  </p>
                )}
                <Grid items={brand.moodboard.items} />
              </section>
              <section aria-label="Notes">
                <Notes brand={brand} />
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
