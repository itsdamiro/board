// Probe (ADR 007, amendment of 2026-10-18): a promise that nothing waits for. Never imported or built.
async function save(): Promise<void> {}

export function run(): void {
  save();
}
