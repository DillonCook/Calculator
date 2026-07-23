const DEAL_COOKER_MEASUREMENT_ID = 'G-30FBLB4LFQ';

const bootstrap = `(() => {
  const measurementId = '${DEAL_COOKER_MEASUREMENT_ID}';
  const params = new URLSearchParams(window.location.search);
  const forceAnalytics = params.get('dc_analytics') === 'force';
  const qaSuppressed = navigator.webdriver || params.get('dc_qa') === '1' || params.get('dc_analytics') === 'off';
  const safePaths = new Set(['/', '/legal/privacy']);
  const controlParams = new Set(['dc_analytics', 'dc_qa']);
  const hasOnlyControlParams = Array.from(params.keys()).every((key) => controlParams.has(key));
  const safePath = window.location.pathname;
  const safeLocation = safePaths.has(safePath) && !window.location.hash && (!window.location.search || hasOnlyControlParams);
  const disableKey = 'ga-disable-' + measurementId;

  window[disableKey] = !safeLocation;
  if (!safeLocation || (qaSuppressed && !forceAnalytics)) return;
  if (window.__dealcookerGaLoaded) return;
  window.__dealcookerGaLoaded = true;

  const syncAnalyticsDisable = () => {
    const currentParams = new URLSearchParams(window.location.search);
    const currentHasOnlyControlParams = Array.from(currentParams.keys()).every((key) => controlParams.has(key));
    window[disableKey] = !safePaths.has(window.location.pathname) || Boolean(window.location.hash) || Boolean(window.location.search && !currentHasOnlyControlParams);
  };
  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  window.history.pushState = function pushState() {
    const result = originalPushState.apply(this, arguments);
    syncAnalyticsDisable();
    return result;
  };
  window.history.replaceState = function replaceState() {
    const result = originalReplaceState.apply(this, arguments);
    syncAnalyticsDisable();
    return result;
  };
  window.addEventListener('popstate', syncAnalyticsDisable, true);

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });
  window.gtag('event', 'page_view', {
    page_location: window.location.origin + safePath,
    page_path: safePath,
    page_referrer: '',
    page_title: document.title
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(script);
})();`;

export function GoogleAnalytics() {
  return <script id="dealcooker-google-analytics" dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
