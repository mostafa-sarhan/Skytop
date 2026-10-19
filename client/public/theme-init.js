// Apply the saved theme (or the dark default) before the first paint to
// avoid a light/dark flash. Loaded as a blocking classic script from
// index.html (external, so the Content-Security-Policy needs no inline
// scripts). Mirrors resolveInitialTheme() in src/theme/theme.ts — keep the
// storage key in sync.
(function () {
  var theme;
  try {
    theme = localStorage.getItem('skytop-theme');
  } catch {
    // storage blocked (private mode): fall back to the default
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark'; // product default; the OS preference is not used
  }
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#1b1826');
  }
})();
