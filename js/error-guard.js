/*
 * Surfaces any uncaught error as a visible banner instead of leaving every
 * button on the page silently inert. Loaded first, before any other script,
 * so it also catches errors thrown while the rest of the page is loading.
 */
(function () {
  function showFatalErrorBanner(message) {
    let banner = document.getElementById('fatal-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'fatal-error-banner';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:9999;background:#b91c1c;color:#fff;' +
        'padding:0.75rem 1rem;font:14px -apple-system,BlinkMacSystemFont,sans-serif;';
      document.body.prepend(banner);
    }
    banner.textContent =
      'Something went wrong and this page may not respond to clicks: ' +
      message +
      '. Try a hard refresh (Ctrl/Cmd+Shift+R). If it persists, open the browser console (F12) and share the error shown there.';
  }

  window.addEventListener('error', (event) => {
    console.error('Unhandled error:', event.error || event.message);
    showFatalErrorBanner((event.error && event.error.message) || event.message || 'unknown error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    showFatalErrorBanner((event.reason && event.reason.message) || String(event.reason));
  });
})();
