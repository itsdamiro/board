import type { Page } from "@playwright/test";

/** Everything that must never happen on the page: a console error (a Content-Security-Policy violation is one), a script
 * error, a request that failed, or an answer of 400 or more. The test reads the list at the end and expects it empty. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
  page.on("requestfailed", (request) => problems.push(`request failed: ${request.url()}`));
  page.on("response", (response) => {
    if (response.status() >= 400) problems.push(`${response.status()}: ${response.url()}`);
  });
  return problems;
}
