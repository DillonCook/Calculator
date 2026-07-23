(() => {
  const measurementId = 'G-30FBLB4LFQ'
  const params = new URLSearchParams(window.location.search)
  const forceAnalytics = params.get('dc_analytics') === 'force'
  const qaSuppressed = navigator.webdriver || params.get('dc_qa') === '1' || params.get('dc_analytics') === 'off'

  if (qaSuppressed && !forceAnalytics) return
  if (window.__dealcookerGaLoaded) return
  window.__dealcookerGaLoaded = true

  const safePath = window.location.pathname
  window.dataLayer = window.dataLayer || []
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  window.gtag('config', measurementId, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_flags: 'SameSite=Lax;Secure',
  })
  window.gtag('event', 'page_view', {
    page_location: window.location.origin + safePath,
    page_path: safePath,
    page_referrer: '',
    page_title: document.title,
  })

  const script = document.createElement('script')
  script.async = true
  script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId)
  document.head.appendChild(script)
})()
