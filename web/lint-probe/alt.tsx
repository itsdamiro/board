// Faulty on purpose (ADR 007, decision 3): an image with no alt text.
export function NoAlt() {
  return <img src="x.png" />;
}
