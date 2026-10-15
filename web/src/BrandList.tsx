import { cn } from "@/lib/utils";

interface Props {
  brands: string[];
  current: string | null;
  onChoose: (slug: string) => void;
}

export default function BrandList({ brands, current, onChoose }: Props) {
  return (
    <nav aria-label="Brands">
      <ul className="flex flex-col gap-1">
        {brands.map((slug) => (
          <li key={slug}>
            <button
              type="button"
              aria-current={slug === current ? "true" : undefined}
              onClick={() => onChoose(slug)}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-ring",
                slug === current ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {slug}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
