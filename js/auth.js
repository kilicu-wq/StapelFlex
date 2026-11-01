// Lightweight client-side password gate. Not real security (this is a
// static site with the source publicly visible) — just a deterrent
// against casual visitors and search-engine crawlers.
(function () {
  const PASSWORD_HASH = '1be2e452b46d7a0d9656bbb1f768e8248eba1b75baed65f5d99eafa948899a6a';
  const STORAGE_KEY = 'stapelflex-unlocked';

  async function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  function unlockUI() {
    document.getElementById('lock-overlay').classList.add('hidden');
  }

  function init() {
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      unlockUI();
      return;
    }

    const form = document.getElementById('lock-form');
    const input = document.getElementById('lock-input');
    const error = document.getElementById('lock-error');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const hash = await sha256Hex(input.value);
      if (hash === PASSWORD_HASH) {
        localStorage.setItem(STORAGE_KEY, '1');
        unlockUI();
      } else {
        error.textContent = 'Falsches Passwort';
        input.value = '';
        input.focus();
      }
    });
  }

  init();
})();
