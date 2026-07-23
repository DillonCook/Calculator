import fs from 'node:fs';
import path from 'node:path';
import { calculateDeal } from '../lib/engine/deal-engine';
import { defaultDealInput, type DealInputModel, type StrategyKey } from '../lib/models/deal';

const ROOT = path.resolve(process.cwd());
const OUT = path.join(ROOT, 'landing-dist');
const APP_ORIGIN = 'https://www.dealcooker.app';
const SITE_ORIGIN = 'https://dealcooker.app';
const BUILD_DATE = new Date().toISOString().slice(0, 10);

type Page = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  h1: string;
  intro: string;
  strategy: StrategyKey | 'compare';
  source: string;
  inputs: Array<[string, string]>;
  metrics: Array<[string, string]>;
  levers: string[];
  related: string[];
};

const money0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 });
const number2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const cloneModel = (): DealInputModel => JSON.parse(JSON.stringify(defaultDealInput)) as DealInputModel;
const sample = cloneModel();
sample.purchase = {
  ...sample.purchase,
  dealName: 'Tampa Duplex — worked example',
  purchasePrice: 285000,
  rehabBudget: 25000,
  arv: 340000,
  downPaymentPercent: 0.25,
  interestRate: 0.0675,
  loanTermYears: 30,
  closingCostPercent: 0.03,
  propertyTaxAnnualOverride: 5400,
  insuranceAnnualOverride: 2400,
  hoaMonthly: 0
};
sample.longTerm = {
  ...sample.longTerm,
  grossRentMonthly: 3200,
  otherIncomeMonthly: 0,
  vacancyPercent: 0.05,
  maintenancePercent: 0.05,
  capexPercent: 0.05,
  managementFeePercent: 0.08,
  tenantPlacementFeePercent: 0
};
sample.airbnb = {
  ...sample.airbnb,
  nightsPerMonth: 30.4,
  occupancyPercent: 0.67,
  adr: 185,
  cleaningFeeCharged: 125,
  cleanerCostPerTurn: 110,
  averageNightsPerBooking: 3.5,
  platformFeePercent: 0.03,
  managementFeePercent: 0.18,
  maintenancePercent: 0.05,
  capexPercent: 0.05,
  furnishingOneTime: 12000
};
sample.padSplit = {
  ...sample.padSplit,
  rentableRooms: 6,
  avgWeeklyRatePerRoom: 225,
  weeksPerMonth: 4.33,
  occupancyPercent: 0.92,
  otherIncomeMonthly: 0,
  platformFeePercent: 0.08,
  managementFeePercent: 0.06,
  maintenancePercent: 0.05,
  capexPercent: 0.05,
  furnishingOneTime: 9000
};
sample.brrrr = {
  ...sample.brrrr,
  rehabOverride: 55000,
  arvOverride: 390000,
  refinanceLtvPercent: 0.75,
  refinanceRate: 0.07,
  refinanceTermYears: 30,
  refinanceClosingCostPercent: 0.02,
  holdingMonths: 9,
  operatingStrategy: 'longTerm'
};
sample.flip = {
  ...sample.flip,
  holdingMonths: 8,
  arvOverride: 390000,
  rehabOverride: 55000,
  targetProfit: 40000,
  targetRoiPercent: 0.2,
  rehabContingencyPercent: 0.1,
  hardMoneyEnabled: true,
  hardMoneyLoanToCostPercent: 0.85,
  hardMoneyInterestRate: 0.12,
  hardMoneyPointsPercent: 0.02
};
sample.assumptions = { ...sample.assumptions, holdYears: 10, annualAppreciationPercent: 0.04, noiGrowthPercent: 0.025, sellingCostPercent: 0.08 };
const result = calculateDeal(sample);

const commercialSample = cloneModel();
commercialSample.purchase = {
  ...commercialSample.purchase,
  dealName: 'Tampa Retail Center — worked example',
  purchasePrice: 2400000,
  rehabBudget: 100000,
  arv: 2592000,
  downPaymentPercent: 0.3,
  interestRate: 0.0675,
  loanTermYears: 25,
  closingCostPercent: 0.03,
  propertyTaxAnnualOverride: 42000,
  insuranceAnnualOverride: 16000
};
commercialSample.assumptions = {
  ...commercialSample.assumptions,
  holdYears: 10,
  annualAppreciationPercent: 0.03,
  noiGrowthPercent: 0.025,
  sellingCostPercent: 0.07
};
const commercialResult = calculateDeal(commercialSample);
if (commercialResult.purchase.capRate > 0.2 || commercialResult.purchase.dscr > 4 || commercialResult.purchase.irr > 0.5) {
  throw new Error('Commercial worked example is outside the marketing plausibility guardrails.');
}

const strategyLabel: Record<StrategyKey, string> = {
  purchase: 'Commercial',
  longTerm: 'Long-Term Rental',
  airbnb: 'Airbnb / STR',
  padSplit: 'Room-by-Room / PadSplit',
  brrrr: 'BRRRR',
  flip: 'Fix & Flip'
};


const formatMetrics = (strategy: StrategyKey): Array<[string, string]> => {
  const output = strategy === 'purchase' ? commercialResult.purchase : result[strategy];
  const flipMeta = output.calculationBreakdown?.flipMeta;
  if (strategy === 'flip' && flipMeta) {
    return [
      ['Max allowable offer', money0.format(flipMeta.maxAllowableOffer ?? 0)],
      ['Net profit', money0.format(flipMeta.netProfit)],
      ['ROI', percent.format(output.roi)],
      ['Annualized IRR', percent.format(output.irr)]
    ];
  }
  return [
    ['Monthly cash flow', money2.format(output.monthlyCashFlow)],
    ['Cap rate', percent.format(output.capRate)],
    ['DSCR', number2.format(output.dscr)],
    ['IRR', percent.format(output.irr)]
  ];
};

const pages: Page[] = [
  {
    slug: 'rental-property-calculator',
    title: 'Free Rental Property Calculator | DealCooker',
    description: 'Analyze a long-term rental for free. Model cash flow, cap rate, cash-on-cash return, DSCR, ROI, IRR, reserves, financing, and a future sale.',
    eyebrow: 'Free long-term rental calculator',
    h1: 'See the whole rental deal—not just the rent minus the mortgage.',
    intro: 'Underwrite acquisition costs, financing, vacancy, management, maintenance, reserves, appreciation, and sale proceeds in one connected model.',
    strategy: 'longTerm',
    source: 'rental',
    inputs: [['Purchase price', money0.format(sample.purchase.purchasePrice)], ['Monthly rent', money0.format(sample.longTerm.grossRentMonthly)], ['Down payment', percent.format(sample.purchase.downPaymentPercent)], ['Hold period', `${sample.assumptions.holdYears} years`]],
    metrics: formatMetrics('longTerm'),
    levers: ['Purchase price and down payment', 'Rent, vacancy, and operating expenses', 'Reserves, financing, appreciation, and exit assumptions'],
    related: ['brrrr-calculator', 'room-by-room-rental-calculator', 'compare-rental-strategies']
  },
  {
    slug: 'brrrr-calculator',
    title: 'Free BRRRR Calculator | DealCooker',
    description: 'Model a BRRRR deal for free from purchase and rehab through refinance, cash returned, post-refi cash flow, equity, ROI, and long-term IRR.',
    eyebrow: 'Free BRRRR calculator',
    h1: 'Know how much capital comes back—and what stays in the deal.',
    intro: 'Connect the buy, rehab, rent, refinance, and hold phases so the refinance never hides the capital you actually invested.',
    strategy: 'brrrr',
    source: 'brrrr',
    inputs: [['Purchase price', money0.format(sample.purchase.purchasePrice)], ['Rehab budget', money0.format(sample.brrrr.rehabOverride ?? 0)], ['After-repair value', money0.format(sample.brrrr.arvOverride ?? 0)], ['Refinance LTV', percent.format(sample.brrrr.refinanceLtvPercent)]],
    metrics: formatMetrics('brrrr'),
    levers: ['Purchase, rehab, and holding costs', 'Refinance timing, LTV, rate, and closing costs', 'Post-refi rent strategy and long-term exit'],
    related: ['rental-property-calculator', 'fix-and-flip-calculator', 'compare-rental-strategies']
  },
  {
    slug: 'room-by-room-rental-calculator',
    title: 'Free Room-by-Room Rental Calculator | DealCooker',
    description: 'Analyze room-by-room and PadSplit-style rentals for free with weekly room rates, occupancy, fees, turnover, furnishing, cash flow, DSCR, and IRR.',
    eyebrow: 'Free room-by-room rental calculator',
    h1: 'Underwrite every room, fee, turn, and reserve.',
    intro: 'Model weekly room revenue without pretending a room-by-room property operates like a traditional lease.',
    strategy: 'padSplit',
    source: 'room-by-room',
    inputs: [['Rentable rooms', String(sample.padSplit.rentableRooms)], ['Weekly rate per room', money0.format(sample.padSplit.avgWeeklyRatePerRoom)], ['Occupancy', percent.format(sample.padSplit.occupancyPercent)], ['Furnishing', money0.format(sample.padSplit.furnishingOneTime)]],
    metrics: formatMetrics('padSplit'),
    levers: ['Room count, weekly rate, and occupancy', 'Placement, turnover, management, and platform fees', 'Utilities, furnishing, maintenance, and reserves'],
    related: ['rental-property-calculator', 'airbnb-investment-calculator', 'compare-rental-strategies']
  },
  {
    slug: 'airbnb-investment-calculator',
    title: 'Free Airbnb Investment Calculator | DealCooker',
    description: 'Analyze an Airbnb or short-term rental for free using nightly rate, occupancy, stay length, cleaning, platform fees, management, reserves, ROI, and IRR.',
    eyebrow: 'Free Airbnb / STR calculator',
    h1: 'Turn nights, rates, and operating drag into an investable decision.',
    intro: 'Model the revenue upside and the real costs of short-term rental operations—including cleaning, platform fees, management, furnishing, and reserves.',
    strategy: 'airbnb',
    source: 'airbnb',
    inputs: [['Average nightly rate', money0.format(sample.airbnb.adr)], ['Occupancy', percent.format(sample.airbnb.occupancyPercent)], ['Average stay', `${sample.airbnb.averageNightsPerBooking} nights`], ['Furnishing', money0.format(sample.airbnb.furnishingOneTime)]],
    metrics: formatMetrics('airbnb'),
    levers: ['Average daily rate and occupancy', 'Average stay, cleaning, and platform fees', 'Management, furnishing, maintenance, and reserves'],
    related: ['room-by-room-rental-calculator', 'rental-property-calculator', 'compare-rental-strategies']
  },
  {
    slug: 'fix-and-flip-calculator',
    title: 'Free Fix and Flip Calculator | DealCooker',
    description: 'Analyze a fix-and-flip for free with rehab contingency, hard-money interest and points, holding costs, selling costs, profit, ROI, and max allowable offer.',
    eyebrow: 'Free fix-and-flip calculator',
    h1: 'Price the risk before the renovation starts.',
    intro: 'See the acquisition, financing, rehab, holding, and sale waterfall—and solve for the offer price that protects your target profit and ROI.',
    strategy: 'flip',
    source: 'flip',
    inputs: [['Purchase price', money0.format(sample.purchase.purchasePrice)], ['Rehab budget', money0.format(sample.flip.rehabOverride ?? 0)], ['After-repair value', money0.format(sample.flip.arvOverride ?? 0)], ['Holding period', `${sample.flip.holdingMonths} months`]],
    metrics: formatMetrics('flip'),
    levers: ['Purchase price, rehab, and contingency', 'Hard-money leverage, rate, points, and minimum interest', 'Holding period, sale price, and selling costs'],
    related: ['brrrr-calculator', 'rental-property-calculator', 'commercial-real-estate-calculator']
  },
  {
    slug: 'commercial-real-estate-calculator',
    title: 'Free Commercial Real Estate Calculator | DealCooker',
    description: 'Underwrite a small commercial property for free with leased square footage, rent per square foot, vacancy, credit loss, reserves, NOI, DSCR, ROI, and IRR.',
    eyebrow: 'Free small commercial calculator',
    h1: 'Underwrite the rent roll, debt, reserves, and exit in one view.',
    intro: 'Built for retail and strip-plaza analysis using leased square footage and annual rent per square foot—not a residential model wearing a new label.',
    strategy: 'purchase',
    source: 'commercial',
    inputs: [['Purchase price', money0.format(commercialSample.purchase.purchasePrice)], ['Leasable area', `${money0.format(commercialSample.commercial.grossLeasableAreaSqft).replace('$', '')} sq ft`], ['Occupied area', `${money0.format(commercialSample.commercial.occupiedSqft).replace('$', '')} sq ft`], ['Base rent', `${money2.format(commercialSample.commercial.averageBaseRentPerSqftYear)}/sq ft/year`]],
    metrics: formatMetrics('purchase'),
    levers: ['Leased area, rent per square foot, and reimbursements', 'Vacancy, credit loss, management, and tenant reserves', 'Debt service, hold period, rent growth, and exit cap'],
    related: ['rental-property-calculator', 'fix-and-flip-calculator', 'compare-rental-strategies']
  },
  {
    slug: 'compare-rental-strategies',
    title: 'Compare Real Estate Investment Strategies | DealCooker',
    description: 'Compare long-term rental, Airbnb, room-by-room, BRRRR, flip, and commercial outcomes for free using one property and one connected set of assumptions.',
    eyebrow: 'Free strategy comparison',
    h1: 'One property. Six strategies. One decision.',
    intro: 'Change the operating strategy without rebuilding the acquisition, financing, tax, insurance, or exit assumptions from scratch.',
    strategy: 'compare',
    source: 'compare',
    inputs: [['Property', 'Tampa Duplex'], ['Purchase price', money0.format(sample.purchase.purchasePrice)], ['Strategies', '6 modeled paths'], ['Hold period', `${sample.assumptions.holdYears} years`]],
    metrics: [['Long-term cash flow', money2.format(result.longTerm.monthlyCashFlow)], ['Airbnb cash flow', money2.format(result.airbnb.monthlyCashFlow)], ['Room-by-room cash flow', money2.format(result.padSplit.monthlyCashFlow)], ['Flip net profit', money0.format(result.flip.calculationBreakdown?.flipMeta?.netProfit ?? 0)]],
    levers: ['Shared acquisition and financing assumptions', 'Strategy-specific revenue and operating expenses', 'Cash flow, DSCR, ROI, IRR, equity, and exit cash'],
    related: ['rental-property-calculator', 'airbnb-investment-calculator', 'room-by-room-rental-calculator']
  }
];

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const appHref = (source: string, campaign = 'seo_strategy_page', strategy?: StrategyKey) => `${APP_ORIGIN}/?utm_source=dealcooker_landing&amp;utm_medium=organic&amp;utm_campaign=${campaign}&amp;utm_content=${source}${strategy ? `&amp;strategy=${strategy}` : ''}`;


const nav = () => `
<header class="site-header" data-site-header>
  <div class="nav-shell">
    <a class="brand" href="/" aria-label="DealCooker home"><img src="/assets/dealcooker-mark.png" alt="" width="40" height="46"><span>DealCooker</span></a>
    <nav aria-label="Primary navigation">
      <a href="/#how-it-works">How it works</a>
      <a href="/#strategies">Strategies</a>
      <a href="/compare-rental-strategies/">Compare</a>
    </nav>
    <a class="nav-cta" href="${appHref('nav', 'sitewide_cta')}">Analyze a deal <span>— free</span></a>
    <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-button><span class="sr-only">Open navigation</span><span></span><span></span></button>
  </div>
  <div id="mobile-menu" class="mobile-menu" hidden data-mobile-menu>
    <a href="/#how-it-works">How it works</a><a href="/#strategies">Strategies</a><a href="/compare-rental-strategies/">Compare strategies</a><a class="nav-cta" href="${appHref('mobile-nav', 'sitewide_cta')}">Analyze a deal — free</a>
  </div>
</header>`;

const footer = () => `
<footer class="site-footer">
  <div class="footer-shell">
    <div><a class="brand footer-brand" href="/"><img src="/assets/dealcooker-mark.png" alt="" width="34" height="39"><span>DealCooker</span></a><p>Real estate underwriting built to help you decide.</p></div>
    <div><strong>Free calculators</strong><a href="/rental-property-calculator/">Rental</a><a href="/brrrr-calculator/">BRRRR</a><a href="/airbnb-investment-calculator/">Airbnb / STR</a><a href="/room-by-room-rental-calculator/">Room-by-room</a></div>
    <div><strong>More strategies</strong><a href="/fix-and-flip-calculator/">Fix & flip</a><a href="/commercial-real-estate-calculator/">Commercial</a><a href="/compare-rental-strategies/">Compare strategies</a></div>
    <div><strong>DealCooker</strong><a href="${APP_ORIGIN}/help">Help</a><a href="${APP_ORIGIN}/legal/privacy">Privacy</a><a href="${APP_ORIGIN}/legal/terms">Terms</a></div>
  </div>
  <div class="footer-bottom"><span>© ${new Date().getFullYear()} DealCooker</span><span>Educational analysis only. Verify assumptions independently.</span></div>
</footer>`;

const structuredData = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;

const shell = (page: { title: string; description: string; slug?: string; body: string; schema: unknown[] }) => {
  const route = page.slug ? `/${page.slug}/` : '/';
  const canonical = `${SITE_ORIGIN}${route}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escape(page.title)}</title>
  <meta name="description" content="${escape(page.description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website"><meta property="og:site_name" content="DealCooker"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${SITE_ORIGIN}/assets/dealcooker-social.jpg">
  <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${SITE_ORIGIN}/assets/dealcooker-social.jpg">
  <meta name="theme-color" content="#07111f"><link rel="icon" href="/assets/favicon.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png"><link rel="stylesheet" href="/assets/site.css">
  ${page.schema.map(structuredData).join('\n  ')}
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  ${nav()}
  <main id="main-content" tabindex="-1">${page.body}</main>
  ${footer()}
  <script src="/assets/site.js" defer></script>
</body>
</html>`;
};

const homepageBody = () => {
  const topResults = formatMetrics('longTerm');
  return `
<section class="hero">
  <div class="hero-glow hero-glow-one"></div><div class="hero-glow hero-glow-two"></div>
  <div class="hero-copy">
    <p class="eyebrow"><span>Free during open testing</span><span class="eyebrow-dot"></span>No signup required</p>
    <h1>Run the numbers.<br><em>Know the move.</em></h1>
    <p class="hero-lede">Analyze rental, Airbnb, room-by-room, BRRRR, flip, and small commercial deals—then see what has to change when the numbers don’t work.</p>
    <div class="hero-actions"><a class="button button-primary" href="${appHref('hero', 'homepage_cta')}">Analyze a deal — free <span aria-hidden="true">↗</span></a><a class="button button-quiet" href="#how-it-works">See how it works</a></div>
    <p class="free-note"><span>✓</span> Free during open testing <span>✓</span> Start without an account <span>✓</span> Save up to 5 deals locally</p>
  </div>
  <div class="hero-product" aria-label="DealCooker product preview">
    <div class="product-window">
      <div class="window-bar"><span class="mini-brand"><img src="/assets/dealcooker-mark.png" alt="" width="26" height="30"><b>DealCooker</b></span><span class="deal-name">Tampa Duplex — Sample Deal</span><span class="free-chip">FREE</span></div>
      <div class="window-grid">
        <div class="cash-card"><p>Monthly cash flow</p><strong>${topResults[0][1]}</strong><span>Long-Term Rental</span><div class="cash-bars">${[52,60,67,72,78,84,88,94].map((height) => `<i style="height:${height}%"></i>`).join('')}</div></div>
        <div class="work-card"><span>Make the deal work</span><h2>Find the terms that turn “no” into “yes.”</h2><div><b>Target purchase price</b><strong>${money0.format(sample.purchase.purchasePrice - 18000)}</strong></div><button type="button" tabindex="-1">Apply recommended price</button></div>
      </div>
      <div class="metric-strip">${topResults.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')}<div><span>Cash to close</span><strong>${money0.format(result.masterSummary.cashToClose)}</strong></div></div>
      <div class="strategy-strip"><span>Compare</span>${Object.values(strategyLabel).map((label, index) => `<i class="${index === 1 ? 'active' : ''}">${label.replace('Room-by-Room / ', '')}</i>`).join('')}</div>
    </div>
  </div>
</section>

<section class="decision-strip" aria-label="DealCooker workflow"><div><span>01</span><b>Build</b><p>Enter the property, financing, income, expenses, and exit assumptions.</p></div><div><span>02</span><b>Compare</b><p>Run the same property through six investment strategies.</p></div><div><span>03</span><b>Fix</b><p>See the price or terms that can make a weak deal work.</p></div><div><span>04</span><b>Share</b><p>Save, print, or send the analysis without rebuilding it.</p></div></section>

<section class="make-it-work section-shell" id="how-it-works">
  <div class="section-heading"><p class="eyebrow">The difference</p><h2>Most calculators stop at the answer.<br><em>DealCooker helps you change it.</em></h2></div>
  <div class="work-layout">
    <div class="work-story"><p>A deal that misses your targets is not automatically dead. DealCooker tests practical levers—purchase price, down payment, and financing—and shows the adjustments that can bring the strategy back into range.</p><ul><li><span>01</span>Choose the strategy and set your return targets.</li><li><span>02</span>See whether the current terms work.</li><li><span>03</span>Apply a recommended scenario and compare the result.</li></ul><a class="text-link" href="${appHref('make-it-work', 'homepage_cta')}">Make a deal work <span>↗</span></a></div>
    <div class="work-visual"><div class="before-after"><div><small>CURRENT TERMS</small><strong>${money2.format(-184.62)}</strong><span>monthly cash flow</span><i class="negative">Needs work</i></div><div class="arrow">→</div><div><small>RECOMMENDED TERMS</small><strong>${money2.format(213.41)}</strong><span>monthly cash flow</span><i class="positive">Meets target</i></div></div><div class="recommendation"><span>Recommended adjustment</span><strong>Lower purchase price by ${money0.format(18000)}</strong><button type="button" tabindex="-1">Apply recommended price</button></div></div>
  </div>
</section>

<section class="strategies-section" id="strategies">
  <div class="section-shell"><div class="section-heading split"><div><p class="eyebrow">One property. More than one path.</p><h2>Underwrite the strategy you’re actually considering.</h2></div><p>Every strategy has its own revenue, expense, debt, and exit logic—connected to one acquisition model.</p></div>
  <div class="strategy-ledger">${pages.filter((page) => page.strategy !== 'compare').map((page, index) => `<a href="/${page.slug}/"><span class="strategy-number">0${index + 1}</span><span><b>${strategyLabel[page.strategy as StrategyKey]}</b><small>${page.intro}</small></span><i>Explore <b>↗</b></i></a>`).join('')}</div></div>
</section>

<section class="compare-section section-shell">
  <div class="compare-copy"><p class="eyebrow">Compare without rebuilding</p><h2>Keep the property.<br>Change the strategy.</h2><p>Purchase price, financing, taxes, insurance, and exit assumptions stay connected while revenue and operations change by strategy.</p><a class="button button-primary" href="/compare-rental-strategies/">Compare strategies</a></div>
  <table class="comparison-table"><caption class="sr-only">Sample strategy comparison</caption><thead><tr><th scope="col">Strategy</th><th scope="col">Cash flow</th><th scope="col">DSCR</th><th scope="col">IRR</th></tr></thead><tbody>${(['longTerm','airbnb','padSplit','brrrr'] as StrategyKey[]).map((key, index) => `<tr class="${index === 0 ? 'selected' : ''}"><th scope="row">${strategyLabel[key]}</th><td><strong>${money0.format(result[key].monthlyCashFlow)}/mo</strong></td><td>${number2.format(result[key].dscr)}</td><td>${percent.format(result[key].irr)}</td></tr>`).join('')}</tbody></table>
</section>

<section class="proof-section"><div class="section-shell"><div class="section-heading centered"><p class="eyebrow">Transparent underwriting</p><h2>Serious numbers. Clear assumptions.</h2><p>DealCooker keeps the calculation work visible so you can challenge the inputs instead of trusting a black box.</p></div><div class="proof-grid"><div><strong>Cash flow</strong><p>Income minus vacancy, operating costs, reserves, and debt service.</p></div><div><strong>DSCR</strong><p>Net operating income measured against modeled debt service.</p></div><div><strong>ROI + IRR</strong><p>Returns built from dated cash flows, contributions, refinance events, and exit proceeds.</p></div><div><strong>Cash to close</strong><p>Down payment, acquisition costs, financing costs, and project cash shown separately.</p></div></div><div class="proof-actions"><span>Save deals locally. Sign in only when you want cloud sync.</span><a href="${appHref('proof', 'homepage_cta')}">Open DealCooker — free ↗</a></div></div></section>

<section class="final-cta"><div><img src="/assets/dealcooker-mark.png" alt="" width="96" height="111"><p class="eyebrow">Your next deal deserves more than a guess.</p><h2>Cook the deal.<br><em>Keep your capital.</em></h2><a class="button button-primary" href="${appHref('final-cta', 'homepage_cta')}">Analyze a deal — free <span>↗</span></a><p>No credit card. No signup required to start.</p></div></section>`;
};

const strategyBody = (page: Page) => {
  const currentLabel = page.strategy === 'compare' ? 'Compare strategies' : strategyLabel[page.strategy];
  const appStrategy = page.strategy === 'compare' ? undefined : page.strategy;
  const relatedHeaderLink = page.slug === 'compare-rental-strategies'
    ? `<a class="text-link" href="${appHref('comparison-related')}">Open the free analyzer ↗</a>`
    : '<a class="text-link" href="/compare-rental-strategies/">Compare all strategies ↗</a>';

  return `
<section class="strategy-hero"><div class="strategy-hero-copy"><p class="breadcrumb"><a href="/">DealCooker</a><span>/</span>${escape(currentLabel)}</p><p class="eyebrow">${escape(page.eyebrow)}</p><h1>${escape(page.h1)}</h1><p>${escape(page.intro)}</p><div class="hero-actions"><a class="button button-primary" href="${appHref(page.source, 'seo_strategy_page', appStrategy)}">Run this analysis — free <span>↗</span></a><a class="button button-quiet" href="#worked-example">See a worked example</a></div><p class="free-note"><span>✓</span> Free during open testing <span>✓</span> No signup required</p></div><div class="strategy-mark"><img src="/assets/dealcooker-mark.png" alt="" width="160" height="185"><span>${escape(currentLabel)}</span></div></section>
<section class="worked-example section-shell" id="worked-example"><div class="section-heading split"><div><p class="eyebrow">Worked example</p><h2>Follow the assumptions into the result.</h2></div><p>Illustrative inputs only—not a property recommendation. Replace every assumption with verified numbers before making a decision.</p></div><div class="example-grid"><div class="example-inputs"><span>INPUTS</span>${page.inputs.map(([label,value]) => `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`).join('')}</div><div class="example-arrow">→</div><div class="example-results"><span>MODELED OUTPUT</span>${page.metrics.map(([label,value]) => `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`).join('')}</div></div><p class="example-note">This example is generated from DealCooker’s calculation engine during the site build, so the displayed outputs stay tied to the product’s math.</p></section>
<section class="levers-section"><div class="section-shell"><div class="section-heading"><p class="eyebrow">What DealCooker models</p><h2>Change an assumption. See the whole deal move.</h2></div><div class="levers-layout"><ol>${page.levers.map((lever,index) => `<li><span>0${index+1}</span><strong>${escape(lever)}</strong></li>`).join('')}</ol><div class="metric-list"><span>DECISION OUTPUTS</span>${page.metrics.map(([label]) => `<i>${escape(label)}<b>Included</b></i>`).join('')}<i>Calculation breakdown<b>Visible</b></i><i>Share + print report<b>Included</b></i></div></div></div></section>
<section class="strategy-work section-shell"><div><p class="eyebrow">When the deal misses</p><h2>Don’t stop at “no.”<br><em>Find the terms that work.</em></h2><p>DealCooker’s recommendation engine can test practical price, equity, and financing changes against the active strategy instead of leaving you with a red number and no next move.</p></div><div class="recommendation large"><span>MAKE THE DEAL WORK</span><strong>Test price and financing changes against your targets.</strong><a class="button button-primary" href="${appHref(`${page.source}-workout`, 'seo_strategy_page', appStrategy)}">Try it free ↗</a></div></section>
<section class="related-section"><div class="section-shell"><div class="section-heading split"><div><p class="eyebrow">Keep comparing</p><h2>The same property may have a better path.</h2></div>${relatedHeaderLink}</div><div class="related-grid">${page.related.filter((slug) => slug !== page.slug).map((slug) => { const related = pages.find((item) => item.slug === slug)!; return `<a href="/${slug}/"><span>${escape(related.eyebrow)}</span><strong>${escape(related.h1)}</strong><i>Explore ↗</i></a>`; }).join('')}</div></div></section>
<section class="page-cta"><div><p class="eyebrow">Free real estate underwriting</p><h2>Bring the property.<br>DealCooker brings the model.</h2><a class="button button-primary" href="${appHref(`${page.source}-final`, 'seo_strategy_page', appStrategy)}">Analyze a deal — free ↗</a><p>No credit card. No signup required to start.</p></div></section>`;
};

const websiteSchema = {
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'DealCooker', url: `${SITE_ORIGIN}/`, description: 'Free real estate investment calculator and deal analyzer.'
};
const organizationSchema = {
  '@context': 'https://schema.org', '@type': 'Organization', name: 'DealCooker', url: `${SITE_ORIGIN}/`, logo: `${SITE_ORIGIN}/assets/dealcooker-mark.png`
};
const softwareSchema = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'DealCooker', applicationCategory: 'FinanceApplication', operatingSystem: 'Web', url: APP_ORIGIN, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description: 'Free real estate investment calculator for commercial, long-term rental, Airbnb, PadSplit, BRRRR, and flip deals.'
};

const resetOut = () => { fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true }); };
const write = (relative: string, content: string | NodeJS.ArrayBufferView) => { const file = path.join(OUT, relative); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
const copy = (source: string, destination: string) => { const file = path.join(OUT, destination); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.copyFileSync(path.join(ROOT, source), file); };

resetOut();
write('index.html', shell({
  title: 'DealCooker: Free Real Estate Deal Analyzer',
  description: 'Analyze rental, Airbnb, room-by-room, BRRRR, flip, and commercial deals for free. Compare strategies, see cash flow, DSCR, ROI, IRR, and make the deal work.',
  body: homepageBody(),
  schema: [websiteSchema, organizationSchema, softwareSchema]
}));
for (const page of pages) {
  write(`${page.slug}/index.html`, shell({
    title: page.title,
    description: page.description,
    slug: page.slug,
    body: strategyBody(page),
    schema: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'DealCooker', item: `${SITE_ORIGIN}/` }, { '@type': 'ListItem', position: 2, name: page.eyebrow.replace(/^Free /, ''), item: `${SITE_ORIGIN}/${page.slug}/` }] },
      { ...softwareSchema, name: page.strategy === 'compare' ? 'DealCooker Strategy Comparison' : `${strategyLabel[page.strategy]} Calculator`, url: `${SITE_ORIGIN}/${page.slug}/` }
    ]
  }));
}

copy('landing/assets/site.css', 'assets/site.css');
copy('landing/assets/site.js', 'assets/site.js');
copy('public/brand/dealcooker-logo.png', 'assets/dealcooker-mark.png');
copy('public/apple-touch-icon.png', 'assets/apple-touch-icon.png');
copy('public/pwa-192.png', 'assets/favicon.png');
copy('public/email/dealcooker-desktop.jpg', 'assets/dealcooker-product.jpg');
copy('public/email/dealcooker-desktop.jpg', 'assets/dealcooker-social.jpg');
copy('landing/_headers', '_headers');
copy('landing/_redirects', '_redirects');
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', ...pages.map((page) => `/${page.slug}/`)].map((route) => `  <url><loc>${SITE_ORIGIN}${route}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>monthly</changefreq><priority>${route === '/' ? '1.0' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);

console.log(`Built DealCooker landing site with ${pages.length + 1} pages in ${OUT}.`);
