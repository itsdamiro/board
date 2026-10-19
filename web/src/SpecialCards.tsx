import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SpecialCard } from "./api";
import { fullHex, inkFor } from "./colors";
import { copyText } from "./copy";

// The bodies of the three special cards (ADR 009, decision 6). Every word on them is shown as text. The stripes' colours are set
// through the element's style property, which the server's Content-Security-Policy allows (an inline style attribute in the HTML it refuses).

const FOCUS = "focus-visible:outline-2 focus-visible:outline-ring";

function Heading({ title }: { title: string }) {
  return title !== "" ? <h2 className="text-xl">{title}</h2> : null;
}

// More than this many stripes in a row, and the words on each are turned to read upward, so a narrow stripe still shows its hex.
const UPRIGHT_STRIPES = 3;

function Stripe({ hex, name, copied, vertical, onCopy }: { hex: string; name: string; copied: boolean; vertical: boolean; onCopy: () => void }) {
  const ink = inkFor(hex);
  const label = copied ? "Copied" : hex;
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${hex}${name !== "" ? `, ${name}` : ""}`}
      className={`flex h-44 min-w-0 flex-1 cursor-copy p-1.5 text-left text-xs -outline-offset-4 ${vertical ? "items-end justify-center" : "flex-col justify-end gap-0.5"} ${FOCUS}`}
      style={{ backgroundColor: fullHex(hex) ?? "transparent", color: ink, outlineColor: ink }}
    >
      {vertical ? (
        <span className="max-h-full overflow-hidden text-ellipsis whitespace-nowrap font-mono [writing-mode:vertical-rl] rotate-180">
          {label}
          {name !== "" && !copied ? ` ${name}` : ""}
        </span>
      ) : (
        <>
          <span className="font-mono">{label}</span>
          {name !== "" && <span className="break-words">{name}</span>}
        </>
      )}
    </button>
  );
}

function Colors({ card }: { card: Extract<SpecialCard, { kind: "colors" }> }) {
  const [copied, setCopied] = useState<number | null>(null); // the stripe just copied, for a moment
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function copy(at: number, hex: string) {
    window.clearTimeout(timer.current);
    const done = await copyText(hex);
    setFailed(!done);
    setCopied(done ? at : null);
    timer.current = window.setTimeout(() => {
      setCopied(null);
      setFailed(false);
    }, 1500);
  }

  return (
    <section aria-label={card.title !== "" ? card.title : "Colours"} className="flex flex-col">
      <div className="flex">
        {card.colors.map((color, at) => (
          <Stripe
            key={at}
            hex={color.hex}
            name={color.name}
            copied={copied === at}
            vertical={card.colors.length > UPRIGHT_STRIPES}
            onCopy={() => void copy(at, color.hex)}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1 p-3 empty:hidden">
        <Heading title={card.title} />
        {failed && <output className="text-xs text-destructive">Could not copy</output>}
      </div>
    </section>
  );
}

function Text({ card }: { card: Extract<SpecialCard, { kind: "text" }> }) {
  return (
    <section aria-label={card.title} className="flex flex-col gap-2 p-4">
      <h2 className="text-xl">{card.title}</h2>
      <p className="whitespace-pre-wrap text-sm">{card.body}</p>
    </section>
  );
}

/** A CSS family name from a font name the server checked (letters, digits, spaces and hyphens); quotes are dropped anyway. */
function family(name: string): string {
  return `"${name.replaceAll('"', "")}", var(--font-sans, sans-serif)`;
}

function Type({ card }: { card: Extract<SpecialCard, { kind: "type" }> }) {
  // The address is the one the server wrote; anything else is not linked.
  const linked = card.google.startsWith("https://fonts.google.com/");
  return (
    <section aria-label={`Font: ${card.name}`} className="flex flex-col gap-2 p-4">
      <p className="text-xs text-muted-foreground">Font</p>
      <p
        aria-hidden="true"
        className="text-6xl leading-none"
        style={{ fontFamily: family(card.name) }}
        title="Shown in this font only if it is installed on this computer"
      >
        Aa
      </p>
      <h2 className="text-xl" style={{ fontFamily: family(card.name) }}>
        {card.name}
      </h2>
      {card.notes !== "" && <p className="whitespace-pre-wrap text-sm">{card.notes}</p>}
      {linked && (
        <a
          href={card.google}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1 text-xs text-muted-foreground underline pointer-coarse:min-h-11 pointer-coarse:items-center ${FOCUS}`}
        >
          View on Google Fonts
          <ExternalLink aria-hidden="true" className="size-3" />
        </a>
      )}
    </section>
  );
}

export default function SpecialBody({ card }: { card: SpecialCard }) {
  if (card.kind === "colors") return <Colors card={card} />;
  if (card.kind === "text") return <Text card={card} />;
  return <Type card={card} />;
}
