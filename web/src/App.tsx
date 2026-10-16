import { useEffect, useRef, useState } from "react";
import { getBrand, listBrands, lookUpItem, type Brand, type Item } from "./api";
import BrandSelect from "./BrandSelect";
import Cards from "./Cards";
import ColumnButtons from "./ColumnButtons";
import Composer from "./Composer";
import { readLastBrand, writeLastBrand } from "./lastBrand";
import { orderCards } from "./cardOrder";
import ThemeToggle from "./ThemeToggle";
import { useColumns } from "./useColumns";

function message(failure: unknown): string {
  return failure instanceof Error ? failure.message : "Something went wrong.";
}

export default function App() {
  const [brands, setBrands] = useState<string[] | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set()); // keys of the items whose address is being looked up
  const columns = useColumns();

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

  // A read that a newer one has overtaken (the add's refresh, then the lookup's, or a change of brand) is let finish and ignored,
  // not cancelled, so two refreshes close together never show as a failed request.
  const latest = useRef(0);
  useEffect(() => {
    if (slug === null) return;
    const mine = ++latest.current;
    getBrand(slug).then(
      (view) => {
        if (latest.current !== mine) return;
        setBrand(view);
        setError(null);
      },
      (failure: unknown) => {
        if (latest.current === mine) setError(message(failure));
      },
    );
  }, [slug, reload]);

  const cards = brand === null ? [] : orderCards(brand);
  const refresh = () => setReload((n) => n + 1);

  // The add is already done and shown; the lookup (up to eight seconds) goes on beside it, the box stays free, and a failure leaves the item as it is (ADR 008, amendment of 2026-10-17).
  // An address the server already keeps shows its title and icon in the add's own answer, so nothing is asked for.
  function added(item: Item, lookUp: boolean) {
    refresh();
    if (!lookUp || slug === null || item.title !== null || item.preview !== null) return;
    setPending((now) => new Set(now).add(item.key));
    lookUpItem(slug, item.key)
      .catch(() => undefined)
      .finally(() => {
        setPending((now) => {
          const next = new Set(now);
          next.delete(item.key);
          return next;
        });
        refresh();
      });
  }

  function choose(next: string) {
    if (next === slug) return;
    setBrand(null);
    setError(null);
    setSlug(next);
    writeLastBrand(next);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1>
          {brands !== null && brands.length > 0 ? <BrandSelect brands={brands} current={slug} onChoose={choose} /> : <span className="px-2 text-3xl">Board</span>}
        </h1>
        <div className="flex items-center gap-2">
          {columns.choosable && cards.length > 0 && <ColumnButtons columns={columns} />}
          <ThemeToggle />
        </div>
      </header>
      <main className="flex min-w-0 flex-col gap-6">
        {error !== null && (
          <p role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
            {error}
            {slug !== null && brand === null && (
              <button type="button" onClick={refresh} className="text-foreground underline focus-visible:outline-2 focus-visible:outline-ring">
                Try again
              </button>
            )}
          </p>
        )}
        {brands !== null && brands.length === 0 && <p className="text-muted-foreground">The vault has no brands under Brands/.</p>}
        {slug !== null && brand === null && error === null && <p className="text-muted-foreground">Loading…</p>}
        {brand !== null && (
          <>
            {!brand.moodboard.exists && (
              <p className="text-muted-foreground">This brand has no Moodboard note. Create one in the vault and the board will add to it.</p>
            )}
            {brand.moodboard.problem !== null && (
              <p role="alert" className="text-destructive">
                {brand.moodboard.problem}
              </p>
            )}
            <Cards columns={columns} slug={brand.slug} cards={cards} pending={pending} onChanged={refresh} adder={brand.moodboard.exists ? <Composer slug={brand.slug} onAdded={added} /> : undefined} />
          </>
        )}
      </main>
    </div>
  );
}
