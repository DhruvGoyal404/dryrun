// Applies a remembered light/dark choice before first paint. External (not inline) so the
// strict CSP needs no 'unsafe-inline'. Without a stored choice, the OS setting applies.
try {
  var theme = localStorage.getItem("dryrun:theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {
  /* storage blocked: follow the OS */
}
