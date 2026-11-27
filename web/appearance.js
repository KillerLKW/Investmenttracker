// Same palettes as TaskTracker 2; appearance stays separate from portfolio data.
(() => {
  const picker = document.querySelector('#color-theme');
  const key = 'investmenttracker-color-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  const themes = ['blue', 'green', 'purple', 'sand', 'dark', 'system'];
  const image = document.querySelector('.brand img');
  const originalLogo = image.src;
  let preference = 'blue';
  try { preference = localStorage.getItem(key) || 'blue'; } catch {}
  function apply() {
    if (!themes.includes(preference)) preference = 'blue';
    document.documentElement.dataset.colorTheme = preference === 'system' ? (system.matches ? 'dark' : 'blue') : preference;
    picker.value = preference;
    const colors = getComputedStyle(document.documentElement);
    // The packaged SVG is embedded; no network request is needed.
    if (originalLogo.startsWith('data:image/svg+xml;base64,')) {
      const svg = atob(originalLogo.split(',')[1])
        .replaceAll('#0C3436', colors.getPropertyValue('--accent').trim())
        .replaceAll('#65E3B3', colors.getPropertyValue('--on-accent').trim())
        .replaceAll('#F4FCF8', colors.getPropertyValue('--on-accent').trim());
      image.src = 'data:image/svg+xml;base64,' + btoa(svg);
      document.querySelector('link[rel="icon"]').href = image.src;
    }
  }
  picker.addEventListener('change', () => {
    preference = picker.value;
    apply();
    try { localStorage.setItem(key, preference); }
    catch { document.querySelector('#theme-status').textContent = 'Die Farbauswahl gilt für diese Sitzung; der Browser konnte sie nicht speichern.'; }
  });
  system.addEventListener('change', apply);
  apply();
})();
