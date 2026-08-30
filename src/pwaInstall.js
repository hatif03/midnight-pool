// Suggests installing the PWA on phones (the Mobile Track's "real installable app" story only
// matters if people actually get asked to install it). Android/Chrome gets a real install button
// via `beforeinstallprompt`; iOS Safari has no such API at all, so it gets a "tap Share -> Add to
// Home Screen" instruction instead. Skipped entirely on desktop and once already installed.
import { t } from './i18n.js';

const DISMISSED_KEY = 'pwa-install-dismissed';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const isIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

let deferredPrompt = null;

function showBanner(kind) {
  if (localStorage.getItem(DISMISSED_KEY) || isStandalone()) return;
  const banner = document.getElementById('install-banner');
  if (!banner) return;
  banner.querySelector('.install-text').textContent = kind === 'ios' ? t('installHintIOS') : t('installHint');
  banner.querySelector('#btn-install').hidden = kind === 'ios';
  banner.hidden = false;
}

function hideBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.hidden = true;
}

// Registered at module load (before main()'s async PIXI setup finishes) since Chrome can fire
// beforeinstallprompt as soon as its own install-eligibility heuristics are satisfied, not
// necessarily after the rest of the page has finished booting.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (isMobile()) showBanner('android');
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hideBanner();
  localStorage.setItem(DISMISSED_KEY, '1');
});

document.getElementById('btn-install-dismiss')?.addEventListener('click', () => {
  localStorage.setItem(DISMISSED_KEY, '1');
  hideBanner();
});

document.getElementById('btn-install')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  hideBanner();
});

/** Call once during boot: shows the iOS instructional variant immediately (iOS never fires
 *  beforeinstallprompt), leaves Android/Chrome to the event listener above. */
export function wireInstallPrompt() {
  if (!isMobile() || isStandalone() || localStorage.getItem(DISMISSED_KEY)) return;
  if (isIOS()) showBanner('ios');
}
