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
  answer: string;
  methodology: string;
  questions: Array<[string, string]>;
  citations: Array<{ label: string; href: string; note: string }>;
};

const AUTHOR = {
  name: 'Dillon Cook',
  role: 'Real estate agent and DealCooker creator',
  url: 'https://dilloncook.com/'
};

const citations = {
  piti: { label: 'Consumer Financial Protection Bureau — What is PITI?', href: 'https://www.consumerfinance.gov/ask-cfpb/what-is-piti-en-152/', note: 'Principal, interest, taxes, and insurance are basic components of a monthly mortgage payment.' },
  rentalIncome: { label: 'Fannie Mae Selling Guide — Rental Income', href: 'https://selling-guide.fanniemae.com/sel/b3-3.8-01/rental-income', note: 'Gross rent alone is not the same as usable net rental income; vacancy and ongoing expenses matter.' },
  dscr: { label: 'Fannie Mae Multifamily Guide — Debt Service Coverage Ratio', href: 'https://mfguide.fanniemae.com/node/1766', note: 'DSCR compares property net cash flow with required debt payments.' },
  rentalTax: { label: 'IRS Publication 527 — Residential Rental Property', href: 'https://www.irs.gov/publications/p527', note: 'Official federal guidance on residential rental income, expenses, depreciation, and recordkeeping.' },
  mortgageCosts: { label: 'Consumer Financial Protection Bureau — Mortgage costs', href: 'https://www.consumerfinance.gov/ask-cfpb/what-costs-come-with-taking-out-a-mortgage-en-153/', note: 'Financing can include more than principal and interest, including taxes, insurance, mortgage insurance, and closing costs.' },
  airbnbTax: { label: 'Airbnb Help Center — Florida occupancy tax collection', href: 'https://www.airbnb.com/help/article/2301', note: 'Short-term-rental tax collection and remittance vary by jurisdiction and platform handling.' },
  padSplitFees: { label: 'PadSplit Help — Host fee model', href: 'https://www.padsplit.com/help/article/what-is-padsplits-fee-model-for-hosts-24614775906324', note: 'Platform and booking fees affect room-by-room revenue.' },
  padSplitUtilities: { label: 'PadSplit Help — Managing room-for-rent properties', href: 'https://www.padsplit.com/help/topic/property-management-360009344272', note: 'Utilities may be included in weekly room pricing and should be estimated as an operating cost.' },
  saleTax: { label: 'IRS Publication 544 — Sales and Other Dispositions of Assets', href: 'https://www.irs.gov/publications/p544', note: 'Official federal guidance on tax treatment when property is sold; DealCooker does not calculate tax liability.' }
} as const;

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
    related: ['brrrr-calculator', 'room-by-room-rental-calculator', 'compare-rental-strategies'],
    answer: 'A rental property calculator estimates cash flow and returns after financing, vacancy, operating expenses, reserves, and exit assumptions—not just rent minus the mortgage.',
    methodology: 'DealCooker calculates effective income after vacancy, subtracts modeled operating costs and reserves to estimate NOI, subtracts debt service for cash flow, and builds an annual hold-period timeline for ROI and IRR.',
    questions: [
      ['What should a rental property calculator include?', 'Purchase and closing costs, loan terms, rent, vacancy, management, maintenance, capital reserves, taxes, insurance, cash flow, sale assumptions, and return metrics should be connected in one model.'],
      ['How is rental cash flow calculated?', 'DealCooker starts with rent and other income, subtracts vacancy and modeled expenses, then subtracts debt service. The result is a pre-tax estimate, not a guarantee.'],
      ['Is cap rate the same as cash-on-cash return?', 'No. DealCooker models cap rate from annual NOI relative to acquisition basis, while cash-on-cash return compares annual pre-tax cash flow with cash invested.'],
      ['Does DealCooker calculate taxes or give investment advice?', 'No. It is an educational screening tool. Verify rents, expenses, financing, zoning, insurance, taxes, and legal requirements with qualified professionals.']
    ],
    citations: [citations.rentalIncome, citations.piti, citations.rentalTax]
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
    related: ['rental-property-calculator', 'fix-and-flip-calculator', 'compare-rental-strategies'],
    answer: 'A BRRRR calculator connects the buy, rehab, rent, refinance, and repeat phases to estimate cash returned at refinance, capital left in the property, post-refinance cash flow, equity, and long-term returns.',
    methodology: 'DealCooker combines acquisition and rehab cash with holding operations, models refinance proceeds after the selected LTV and closing costs, retires the acquisition debt, and carries the remaining property into the chosen rental strategy and exit timeline.',
    questions: [
      ['What does a BRRRR calculator show?', 'It should show total project cash, refinance proceeds, debt payoff, refinance costs, cash returned, cash left invested, post-refinance debt service, rental cash flow, equity, and hold-period returns.'],
      ['Why can a high ARV still leave cash in the deal?', 'Refinance proceeds are constrained by modeled value and LTV, then reduced by debt payoff and refinance costs. Rehab overruns and holding costs also increase cash invested.'],
      ['Does a BRRRR refinance remove risk?', 'No. Appraisal, lender terms, seasoning, interest rates, rent performance, repairs, and timing can differ from assumptions. Confirm the refinance plan before buying.'],
      ['How does DealCooker compare BRRRR with a flip?', 'BRRRR carries the property into a rental hold after refinance; a flip models a sale after rehab. Both use the same acquisition and rehab assumptions so the paths can be compared.']
    ],
    citations: [citations.mortgageCosts, citations.rentalIncome, citations.dscr]
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
    related: ['rental-property-calculator', 'airbnb-investment-calculator', 'compare-rental-strategies'],
    answer: 'A room-by-room rental calculator estimates revenue by rentable room and weekly rate, then accounts for occupancy, platform and management fees, furnishing, utilities, maintenance, reserves, and debt service.',
    methodology: 'DealCooker multiplies rentable rooms by weekly rate and weeks per month, applies occupancy, then subtracts modeled platform, management, turnover, utility, maintenance, reserve, fixed, and financing costs.',
    questions: [
      ['How do you calculate room-by-room rental income?', 'Start with rentable rooms multiplied by the weekly room rate and weeks per month, then apply realistic occupancy before subtracting fees and owner-paid costs.'],
      ['Why include utilities in a room rental analysis?', 'Room-by-room pricing may include utilities, so power, water, internet, gas, lawn care, and other shared costs can materially reduce net income.'],
      ['Is PadSplit income the same as collected room rent?', 'No. Platform fees, booking fees, vacancies, missed collections, turns, maintenance, and utilities can reduce what the owner receives.'],
      ['What must be verified before operating room-by-room housing?', 'Confirm zoning, occupancy limits, licensing, building and fire codes, insurance, lender restrictions, leases, platform rules, and local law.']
    ],
    citations: [citations.padSplitFees, citations.padSplitUtilities, citations.dscr]
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
    related: ['room-by-room-rental-calculator', 'rental-property-calculator', 'compare-rental-strategies'],
    answer: 'An Airbnb investment calculator converts nightly rate, occupancy, and stay length into revenue, then subtracts cleaning, platform, management, furnishing, maintenance, reserve, fixed, and financing costs.',
    methodology: 'DealCooker estimates occupied nights from available nights and occupancy, uses average stay to estimate booking turns, separates cleaning charged from cleaner cost, applies platform and management fees, and carries furnishing and property costs into cash invested and returns.',
    questions: [
      ['How is Airbnb revenue calculated?', 'A basic estimate is available nights multiplied by occupancy and average daily rate, plus modeled cleaning or other income. Net performance requires operating costs and financing.'],
      ['Why does average stay matter?', 'Average stay affects the number of turns. More turns can increase cleaning expense even when occupied nights stay the same.'],
      ['Does Airbnb collect every tax for a host?', 'Not necessarily. Collection and remittance vary by jurisdiction. Verify registration, lodging taxes, licenses, HOA rules, leases, insurance, and local short-term-rental law.'],
      ['Should furnishing be treated as a monthly expense?', 'DealCooker treats furnishing as upfront project cash while ongoing replacement reserves and operating costs are modeled separately.']
    ],
    citations: [citations.airbnbTax, citations.mortgageCosts, citations.dscr]
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
    related: ['brrrr-calculator', 'rental-property-calculator', 'commercial-real-estate-calculator'],
    answer: 'A fix-and-flip calculator estimates profit after purchase, financing, rehab, contingency, holding, and selling costs, then solves for the offer price that can support a target profit or ROI.',
    methodology: 'DealCooker builds an acquisition and rehab budget, applies hard-money leverage, interest, points, holding costs, contingency, sale price, and selling costs, then calculates net sale cash, total ROI, annualized IRR, and a maximum allowable offer from the selected targets.',
    questions: [
      ['What costs belong in a flip analysis?', 'Purchase and closing costs, rehab, contingency, permits, utilities, taxes, insurance, financing interest and points, holding costs, commissions, and other selling costs should be included.'],
      ['What is maximum allowable offer?', 'It is a modeled purchase-price ceiling that works backward from sale value, project costs, and the selected profit or ROI target. It is not an appraisal or market-value opinion.'],
      ['Why model both ROI and annualized IRR?', 'ROI summarizes total project gain relative to cash invested. Annualized IRR also reflects when cash enters and leaves the project, so timing affects the result.'],
      ['Does DealCooker estimate flip taxes?', 'No. Tax treatment depends on facts and taxpayer circumstances. DealCooker models project economics before tax; consult a qualified tax professional.']
    ],
    citations: [citations.mortgageCosts, citations.saleTax]
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
    related: ['rental-property-calculator', 'fix-and-flip-calculator', 'compare-rental-strategies'],
    answer: 'A commercial real estate calculator estimates effective income, NOI, debt coverage, cash flow, and returns from leased square footage, rent and recoveries, vacancy, credit loss, expenses, reserves, financing, and exit assumptions.',
    methodology: 'DealCooker calculates occupied rent and recoveries, subtracts economic vacancy, credit loss, management, nonrecoverable expenses, tenant-improvement and leasing reserves, and fixed property costs for NOI, then subtracts debt service and models the hold and exit.',
    questions: [
      ['How is commercial NOI calculated?', 'DealCooker starts with occupied rent and recoveries, then subtracts vacancy, credit loss, management, nonrecoverable operating expenses, tenant and leasing reserves, taxes, insurance, and other modeled operating costs.'],
      ['What is DSCR in commercial real estate?', 'Debt service coverage ratio compares modeled NOI with required debt service. A ratio above 1 means NOI exceeds debt service, but lender standards and definitions vary.'],
      ['Why model tenant-improvement and leasing reserves?', 'Tenant improvements and leasing commissions can require significant future cash. Reserving for them keeps the operating view from overstating distributable cash.'],
      ['Is DealCooker a commercial appraisal?', 'No. It is an underwriting model. Verify leases, rent roll, reimbursements, expenses, title, environmental condition, zoning, financing, and valuation independently.']
    ],
    citations: [citations.dscr, citations.mortgageCosts]
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
    related: ['rental-property-calculator', 'airbnb-investment-calculator', 'room-by-room-rental-calculator'],
    answer: 'The most useful way to compare real estate strategies is to keep property, acquisition, financing, and exit assumptions consistent while changing only the revenue and operating logic that belongs to each strategy.',
    methodology: 'DealCooker uses one acquisition model, then runs strategy-specific income, vacancy, fee, reserve, rehab, refinance, financing, and sale logic. This makes differences in outputs traceable to the strategy assumptions instead of separate spreadsheets.',
    questions: [
      ['Which real estate strategy has the best return?', 'There is no universal winner. A strategy with higher modeled return may also require more operating work, regulation, capital, volatility, or execution risk. Compare outputs and assumptions together.'],
      ['Why use the same property assumptions across strategies?', 'Holding purchase price, financing, taxes, insurance, and exit assumptions constant makes it easier to see whether the operating strategy—not a hidden input change—drives the result.'],
      ['Can DSCR be compared across every strategy?', 'DealCooker calculates modeled debt coverage for income-producing strategies, but lender definitions and acceptable thresholds vary by property and loan program.'],
      ['Should the highest IRR determine the decision?', 'No. IRR is one modeled return measure. Liquidity, downside risk, workload, legal constraints, financing certainty, and confidence in each assumption also matter.']
    ],
    citations: [citations.dscr, citations.rentalIncome, citations.saleTax]
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
      <a href="/methodology/">Methodology</a>
      <a href="/compare-rental-strategies/">Compare</a>
    </nav>
    <a class="nav-cta" href="${appHref('nav', 'sitewide_cta')}">Analyze a deal <span>— free</span></a>
    <button class="menu-button" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-button><span class="sr-only">Open navigation</span><span></span><span></span></button>
  </div>
  <div id="mobile-menu" class="mobile-menu" hidden data-mobile-menu>
    <a href="/#how-it-works">How it works</a><a href="/#strategies">Strategies</a><a href="/methodology/">Methodology</a><a href="/compare-rental-strategies/">Compare strategies</a><a class="nav-cta" href="${appHref('mobile-nav', 'sitewide_cta')}">Analyze a deal — free</a>
  </div>
</header>`;

const footer = () => `
<footer class="site-footer">
  <div class="footer-shell">
    <div><a class="brand footer-brand" href="/"><img src="/assets/dealcooker-mark.png" alt="" width="34" height="39"><span>DealCooker</span></a><p>Real estate underwriting built to help you decide.</p></div>
    <div><strong>Free calculators</strong><a href="/rental-property-calculator/">Rental</a><a href="/brrrr-calculator/">BRRRR</a><a href="/airbnb-investment-calculator/">Airbnb / STR</a><a href="/room-by-room-rental-calculator/">Room-by-room</a></div>
    <div><strong>More strategies</strong><a href="/fix-and-flip-calculator/">Fix & flip</a><a href="/commercial-real-estate-calculator/">Commercial</a><a href="/compare-rental-strategies/">Compare strategies</a></div>
    <div><strong>DealCooker</strong><a href="/methodology/">Methodology</a><a href="${AUTHOR.url}">About Dillon</a><a href="${APP_ORIGIN}/help">App help</a><a href="${APP_ORIGIN}/legal/privacy">Privacy</a><a href="${APP_ORIGIN}/legal/terms">Terms</a></div>
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
  <script src="/assets/analytics.js"></script>
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
    <p class="eyebrow"><span>Free</span><span class="eyebrow-dot"></span>No signup required</p>
    <h1>Run the numbers.<br><em>Know the move.</em></h1>
    <p class="hero-lede">Analyze rental, Airbnb, room-by-room, BRRRR, flip, and small commercial deals—then see what has to change when the numbers don’t work.</p>
    <div class="hero-actions"><a class="button button-primary" href="${appHref('hero', 'homepage_cta')}">Analyze a deal — free <span aria-hidden="true">↗</span></a><a class="button button-quiet" href="#how-it-works">See how it works</a></div>
    <p class="free-note"><span>✓</span> Free <span>✓</span> Start without an account <span>✓</span> Save up to 5 deals locally</p>
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
<section class="strategy-hero"><div class="strategy-hero-copy"><p class="breadcrumb"><a href="/">DealCooker</a><span>/</span>${escape(currentLabel)}</p><p class="eyebrow">${escape(page.eyebrow)}</p><h1>${escape(page.h1)}</h1><p>${escape(page.intro)}</p><div class="hero-actions"><a class="button button-primary" href="${appHref(page.source, 'seo_strategy_page', appStrategy)}">Run this analysis — free <span>↗</span></a><a class="button button-quiet" href="#worked-example">See a worked example</a></div><p class="free-note"><span>✓</span> Free <span>✓</span> No signup required</p></div><div class="strategy-mark"><img src="/assets/dealcooker-mark.png" alt="" width="160" height="185"><span>${escape(currentLabel)}</span></div></section>
<section class="direct-answer section-shell" aria-labelledby="direct-answer-heading"><p class="eyebrow">Direct answer</p><h2 id="direct-answer-heading">What this calculator does</h2><p>${escape(page.answer)}</p><div class="trust-line"><span>Published by DealCooker. Product owner: <a href="${AUTHOR.url}">${AUTHOR.name}</a>, ${AUTHOR.role}.</span><span>Last updated <time datetime="${BUILD_DATE}">${BUILD_DATE}</time>.</span></div></section>
<section class="worked-example section-shell" id="worked-example"><div class="section-heading split"><div><p class="eyebrow">Worked example</p><h2>Follow the assumptions into the result.</h2></div><p>Illustrative inputs only—not a property recommendation. Replace every assumption with verified numbers before making a decision.</p></div><div class="example-grid"><div class="example-inputs"><span>INPUTS</span>${page.inputs.map(([label,value]) => `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`).join('')}</div><div class="example-arrow">→</div><div class="example-results"><span>MODELED OUTPUT</span>${page.metrics.map(([label,value]) => `<div><small>${escape(label)}</small><strong>${escape(value)}</strong></div>`).join('')}</div></div><p class="example-note">This example is generated from DealCooker’s calculation engine during the site build, so the displayed outputs stay tied to the product’s math.</p></section>
<section class="levers-section"><div class="section-shell"><div class="section-heading"><p class="eyebrow">What DealCooker models</p><h2>Change an assumption. See the whole deal move.</h2></div><div class="levers-layout"><ol>${page.levers.map((lever,index) => `<li><span>0${index+1}</span><strong>${escape(lever)}</strong></li>`).join('')}</ol><div class="metric-list"><span>DECISION OUTPUTS</span>${page.metrics.map(([label]) => `<i>${escape(label)}<b>Included</b></i>`).join('')}<i>Calculation breakdown<b>Visible</b></i><i>Share + print report<b>Included</b></i></div></div></div></section>
<section class="strategy-work section-shell"><div><p class="eyebrow">When the deal misses</p><h2>Don’t stop at “no.”<br><em>Find the terms that work.</em></h2><p>DealCooker’s recommendation engine can test practical price, equity, and financing changes against the active strategy instead of leaving you with a red number and no next move.</p></div><div class="recommendation large"><span>MAKE THE DEAL WORK</span><strong>Test price and financing changes against your targets.</strong><a class="button button-primary" href="${appHref(`${page.source}-workout`, 'seo_strategy_page', appStrategy)}">Try it free ↗</a></div></section>
<section class="method-section"><div class="section-shell method-grid"><div><p class="eyebrow">Calculation methodology</p><h2>How DealCooker models this strategy</h2><p>${escape(page.methodology)}</p><a class="text-link" href="/methodology/">Read the full methodology and metric definitions ↗</a></div><aside><strong>Model boundaries</strong><p>Outputs are pre-tax estimates based on user inputs. DealCooker is not an appraisal, lender quote, legal opinion, tax calculation, or promise of performance.</p></aside></div></section>
<section class="faq-section section-shell"><div class="section-heading"><p class="eyebrow">Questions answered</p><h2>What investors ask about ${escape(currentLabel)}</h2></div><div class="faq-list">${page.questions.map(([question, answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('')}</div></section>
<section class="sources-section"><div class="section-shell"><div><p class="eyebrow">Primary references</p><h2>Sources behind the context</h2><p>DealCooker’s formulas come from its tested calculation engine. These external references support definitions, diligence reminders, or operating context—not the worked-example assumptions.</p></div><ol>${page.citations.map((citation) => `<li><a href="${citation.href}" rel="external"><strong>${escape(citation.label)}</strong><span>${escape(citation.note)}</span></a></li>`).join('')}</ol></div></section>
<section class="related-section"><div class="section-shell"><div class="section-heading split"><div><p class="eyebrow">Keep comparing</p><h2>The same property may have a better path.</h2></div>${relatedHeaderLink}</div><div class="related-grid">${page.related.filter((slug) => slug !== page.slug).map((slug) => { const related = pages.find((item) => item.slug === slug)!; return `<a href="/${slug}/"><span>${escape(related.eyebrow)}</span><strong>${escape(related.h1)}</strong><i>Explore ↗</i></a>`; }).join('')}</div></div></section>
<section class="page-cta"><div><p class="eyebrow">Free real estate underwriting</p><h2>Bring the property.<br>DealCooker brings the model.</h2><a class="button button-primary" href="${appHref(`${page.source}-final`, 'seo_strategy_page', appStrategy)}">Analyze a deal — free ↗</a><p>No credit card. No signup required to start.</p></div></section>`;
};

const methodologyBody = () => `
<section class="methodology-hero"><div class="section-shell"><p class="eyebrow">Transparent underwriting</p><h1>DealCooker methodology</h1><p>How the calculator turns property assumptions into cash flow, debt coverage, returns, and strategy comparisons.</p><div class="trust-line"><span>Published by DealCooker. Product owner: <a href="${AUTHOR.url}">${AUTHOR.name}</a>, ${AUTHOR.role}.</span><span>Last updated <time datetime="${BUILD_DATE}">${BUILD_DATE}</time>.</span></div></div></section>
<section class="methodology-content section-shell">
  <div class="direct-answer"><p class="eyebrow">Short version</p><h2>What DealCooker calculates</h2><p>DealCooker is a pre-tax real estate underwriting model. It connects acquisition cash, financing, strategy-specific income and expenses, reserves, debt service, refinance events, and sale assumptions into one traceable projection.</p></div>
  <div class="definition-grid">
    <article><h2>Net operating income (NOI)</h2><p>Modeled property income after vacancy and operating expenses, before debt service. The exact income and expense lines vary by strategy.</p></article>
    <article><h2>Monthly cash flow</h2><p>Modeled monthly NOI minus required monthly debt service. DealCooker may also show a view before selected reserves for transparency.</p></article>
    <article><h2>Cap rate</h2><p>Annual modeled NOI divided by the acquisition basis used by the engine. It is an unlevered property-income measure, not a financing return.</p></article>
    <article><h2>DSCR</h2><p>Modeled NOI divided by modeled debt service. A ratio above 1 means NOI exceeds debt service, but lender definitions and thresholds vary.</p></article>
    <article><h2>Cash-on-cash return</h2><p>Annual pre-tax cash flow divided by modeled cash invested. It is sensitive to leverage and does not replace a full hold-period analysis.</p></article>
    <article><h2>ROI and IRR</h2><p>ROI measures total modeled gain relative to invested cash. IRR annualizes the timing of initial cash, operations, refinance events, additional contributions, and exit proceeds.</p></article>
  </div>
</section>
<section class="method-section"><div class="section-shell method-grid"><div><p class="eyebrow">Engine-backed pages</p><h2>Worked examples stay tied to product math</h2><p>Every strategy page is regenerated from DealCooker’s calculation engine during the site build. The displayed examples are illustrative scenarios, not hand-entered promises or property recommendations.</p></div><aside><strong>Inputs drive outputs</strong><p>Small changes in rent, vacancy, financing, rehab, reserves, timing, and exit assumptions can materially change results. Replace examples with verified property-specific inputs.</p></aside></div></section>
<section class="faq-section section-shell"><div class="section-heading"><p class="eyebrow">Model boundaries</p><h2>What DealCooker does not do</h2></div><div class="faq-list"><details open><summary>Does DealCooker predict investment performance?</summary><p>No. It projects user-entered assumptions. It does not guarantee rent, occupancy, financing, appraisal, costs, refinance terms, sale value, or returns.</p></details><details><summary>Does it calculate taxes?</summary><p>No. Results are pre-tax estimates. Tax treatment varies by property, activity, ownership, jurisdiction, and taxpayer; use a qualified tax professional.</p></details><details><summary>Is it an appraisal or lender approval?</summary><p>No. DealCooker is not an appraisal, broker price opinion, credit decision, loan quote, or commitment to lend.</p></details><details><summary>How should results be verified?</summary><p>Confirm the rent roll, leases, market rents, expenses, insurance, taxes, title, zoning, permits, inspections, contractor bids, financing, and exit assumptions independently.</p></details></div></section>
<section class="sources-section"><div class="section-shell"><div><p class="eyebrow">Primary references</p><h2>Definitions and diligence context</h2><p>These authoritative sources support general definitions and verification guidance. DealCooker’s actual outputs are produced by its own tested engine.</p></div><ol>${[citations.piti, citations.rentalIncome, citations.dscr, citations.rentalTax, citations.saleTax].map((citation) => `<li><a href="${citation.href}" rel="external"><strong>${escape(citation.label)}</strong><span>${escape(citation.note)}</span></a></li>`).join('')}</ol></div></section>
<section class="page-cta"><div><p class="eyebrow">Use transparent assumptions</p><h2>Run the numbers.<br>Inspect the model.</h2><a class="button button-primary" href="${appHref('methodology', 'methodology_cta')}">Analyze a deal — free ↗</a><p>Educational analysis only. Verify assumptions independently.</p></div></section>`;

const websiteSchema = {
  '@context': 'https://schema.org', '@type': 'WebSite', name: 'DealCooker', url: `${SITE_ORIGIN}/`, description: 'Free real estate investment calculator and deal analyzer.'
};
const organizationSchema = {
  '@context': 'https://schema.org', '@type': 'Organization', name: 'DealCooker', url: `${SITE_ORIGIN}/`, logo: `${SITE_ORIGIN}/assets/dealcooker-mark.png`, founder: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url }
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
write('methodology/index.html', shell({
  title: 'DealCooker Methodology: Real Estate Calculator Formulas',
  description: 'See how DealCooker calculates NOI, cash flow, cap rate, DSCR, cash-on-cash return, ROI, and IRR across real estate strategies.',
  slug: 'methodology',
  body: methodologyBody(),
  schema: [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: 'DealCooker Methodology', url: `${SITE_ORIGIN}/methodology/`, dateModified: BUILD_DATE, author: organizationSchema, creator: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url }, about: softwareSchema },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'DealCooker', item: `${SITE_ORIGIN}/` }, { '@type': 'ListItem', position: 2, name: 'Methodology', item: `${SITE_ORIGIN}/methodology/` }] }
  ]
}));
for (const page of pages) {
  write(`${page.slug}/index.html`, shell({
    title: page.title,
    description: page.description,
    slug: page.slug,
    body: strategyBody(page),
    schema: [
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'DealCooker', item: `${SITE_ORIGIN}/` }, { '@type': 'ListItem', position: 2, name: page.eyebrow.replace(/^Free /, ''), item: `${SITE_ORIGIN}/${page.slug}/` }] },
      { '@context': 'https://schema.org', '@type': 'WebPage', name: page.h1, url: `${SITE_ORIGIN}/${page.slug}/`, description: page.description, dateModified: BUILD_DATE, author: organizationSchema, creator: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url }, isPartOf: { '@type': 'WebSite', name: 'DealCooker', url: `${SITE_ORIGIN}/` }, about: { '@type': 'SoftwareApplication', name: 'DealCooker', url: APP_ORIGIN } },
      { ...softwareSchema, name: page.strategy === 'compare' ? 'DealCooker Strategy Comparison' : `${strategyLabel[page.strategy]} Calculator`, url: `${SITE_ORIGIN}/${page.slug}/` }
    ]
  }));
}

copy('landing/assets/site.css', 'assets/site.css');
copy('landing/assets/analytics.js', 'assets/analytics.js');
copy('landing/assets/site.js', 'assets/site.js');
copy('public/brand/dealcooker-logo.png', 'assets/dealcooker-mark.png');
copy('public/apple-touch-icon.png', 'assets/apple-touch-icon.png');
copy('public/pwa-192.png', 'assets/favicon.png');
copy('public/email/dealcooker-desktop.jpg', 'assets/dealcooker-product.jpg');
copy('public/email/dealcooker-desktop.jpg', 'assets/dealcooker-social.jpg');
copy('landing/_headers', '_headers');
copy('landing/_redirects', '_redirects');
const indexNowKey = 'f2a2e51a3452babd2382b0dc1332c80d';
write(`${indexNowKey}.txt`, `${indexNowKey}\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: Claude-SearchBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`);
const sitemapRoutes = ['/', '/methodology/', ...pages.map((page) => `/${page.slug}/`)];
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${SITE_ORIGIN}${route}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>monthly</changefreq><priority>${route === '/' ? '1.0' : route === '/methodology/' ? '0.7' : '0.8'}</priority></url>`).join('\n')}\n</urlset>\n`);
write('llms.txt', `# DealCooker\n\n> DealCooker is a free real estate deal analyzer for rental, BRRRR, room-by-room, Airbnb, fix-and-flip, commercial, and strategy-comparison underwriting.\n\n## Canonical resources\n\n- [DealCooker](https://dealcooker.app/): Product overview and strategy links.\n- [Methodology](https://dealcooker.app/methodology/): Calculation definitions, model boundaries, authorship, and verification guidance.\n- [Rental property calculator](https://dealcooker.app/rental-property-calculator/): Long-term rental cash flow and return analysis.\n- [BRRRR calculator](https://dealcooker.app/brrrr-calculator/): Buy, rehab, rent, refinance, and repeat analysis.\n- [Room-by-room rental calculator](https://dealcooker.app/room-by-room-rental-calculator/): Weekly room-rental and PadSplit-style analysis.\n- [Airbnb investment calculator](https://dealcooker.app/airbnb-investment-calculator/): Short-term rental revenue, fees, costs, and returns.\n- [Fix-and-flip calculator](https://dealcooker.app/fix-and-flip-calculator/): Rehab, financing, sale, profit, ROI, and offer analysis.\n- [Commercial real estate calculator](https://dealcooker.app/commercial-real-estate-calculator/): NOI, DSCR, cash flow, and return analysis.\n- [Compare rental strategies](https://dealcooker.app/compare-rental-strategies/): Same-property strategy comparison.\n\n## Important\n\nWorked examples are generated from DealCooker's tested engine and are illustrative, pre-tax estimates. DealCooker is not an appraisal, lender quote, tax calculation, legal advice, investment advice, or guarantee. Verify all property-specific assumptions independently.\n`);

console.log(`Built DealCooker landing site with ${pages.length + 2} pages in ${OUT}.`);
