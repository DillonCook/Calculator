const DEAL_COOKER_MEASUREMENT_ID = 'G-30FBLB4LFQ';

const bootstrap = `(() => {
  const measurementId = '${DEAL_COOKER_MEASUREMENT_ID}';
  const params = new URLSearchParams(window.location.search);
  const forceAnalytics = params.get('dc_analytics') === 'force';
  const qaSuppressed = navigator.webdriver || params.get('dc_qa') === '1' || params.get('dc_analytics') === 'off';
  const safePaths = new Set(['/', '/legal/privacy']);
  const controlParams = new Set(['dc_analytics', 'dc_qa']);
  const marketingParams = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'strategy']);
  const campaigns = new Set(['homepage_cta', 'sitewide_cta', 'seo_strategy_page']);
  const strategies = new Set(['purchase', 'longTerm', 'airbnb', 'padSplit', 'brrrr', 'flip']);
  const safeQuery = (query) => {
    const keys = Array.from(query.keys());
    if (keys.some((key) => query.getAll(key).length !== 1)) return false;
    if (keys.every((key) => controlParams.has(key))) return true;
    // Only the existing public marketing handoff is permitted, never arbitrary UTM/deal/auth data.
    return window.location.pathname === '/' && keys.every((key) => controlParams.has(key) || marketingParams.has(key))
      && query.get('utm_source') === 'dealcooker_landing' && query.get('utm_medium') === 'organic'
      && campaigns.has(query.get('utm_campaign')) && /^[a-z0-9-]{1,80}$/.test(query.get('utm_content') || '')
      && (!query.has('strategy') || strategies.has(query.get('strategy')));
  };
  const safePath = window.location.pathname;
  const safeLocation = safePaths.has(safePath) && !window.location.hash && safeQuery(params);
  const disableKey = 'ga-disable-' + measurementId;

  window[disableKey] = !safeLocation;
  if (!safeLocation || (qaSuppressed && !forceAnalytics)) return;
  if (window.__dealcookerGaLoaded) return;
  window.__dealcookerGaLoaded = true;

  const syncAnalyticsDisable = () => {
    const currentParams = new URLSearchParams(window.location.search);
    window[disableKey] = !safePaths.has(window.location.pathname) || Boolean(window.location.hash) || !safeQuery(currentParams);
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
    page_location: window.location.origin + safePath,
    page_referrer: '',
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
