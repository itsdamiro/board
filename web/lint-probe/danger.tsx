// Faulty on purpose (ADR 007, decision 3): `npm run lint:probe` needs the linter to report this. Never imported or built.
export function Danger({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
