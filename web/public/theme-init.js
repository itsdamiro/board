// Sets the theme class before the first paint so the page does not flash. A file, not an inline script, because the
// server's Content-Security-Policy allows scripts from its own origin only (ADR 002, decision 6). Same rule as
// src/theme.ts; src/theme-init.test.ts runs this file against it.
(function () {
  var choice = "system";
  try {
    var stored = window.localStorage.getItem("board-theme");
    if (stored === "light" || stored === "dark" || stored === "system") choice = stored;
  } catch {
    // storage unavailable: follow the system
  }
  var dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  var root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
})();
