const DEAL_COOKER_MEASUREMENT_ID = 'G-32WWGD9XGQ';

const bootstrap = `(() => {
  const measurementId = '${DEAL_COOKER_MEASUREMENT_ID}';
  const params = new URLSearchParams(window.location.search);
  const forceAnalytics = params.get('dc_analytics') === 'force';
  const qaSuppressed = navigator.webdriver || params.get('dc_qa') === '1' || params.get('dc_analytics') === 'off';
  if (qaSuppressed && !forceAnalytics) return;
  if (window.__dealcookerGaLoaded) return;
  window.__dealcookerGaLoaded = true;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function gtag(){ window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
  document.head.appendChild(script);
})();`;

export function GoogleAnalytics() {
  return <script id="dealcooker-google-analytics" dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
