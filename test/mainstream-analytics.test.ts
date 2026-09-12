import {it,expect,vi} from 'vitest';
vi.mock('@/lib/analytics',()=>({trackAnalyticsEvent:vi.fn()}));
import {isMeasurementUrl,isMeaningfulProperty,productEventProperties} from '@/lib/product-analytics';
import {defaultDealInput} from '@/lib/models/deal';
it('excludes QA, local, preview and shared-link traffic',()=>{
  expect(isMeasurementUrl('https://www.dealcooker.app/')).toBe(true);
  for(const url of ['http://localhost:3027/','https://preview.vercel.app/','https://www.dealcooker.app/?qa=review','https://www.dealcooker.app/?s=private','https://www.dealcooker.app/?share=private']) expect(isMeasurementUrl(url)).toBe(false);
});
it('does not count blanks or samples as a valid property',()=>{
  const model=structuredClone(defaultDealInput);
  model.purchase.purchasePrice=0;
  expect(isMeaningfulProperty(model,'longTerm')).toBe(false);
  model.purchase.purchasePrice=250000;model.longTerm.grossRentMonthly=3000;model.analysis={kind:'sample'};
  expect(isMeaningfulProperty(model,'longTerm')).toBe(false);
  model.analysis={kind:'property'}; model.purchase.dealName='Real property';
  expect(isMeaningfulProperty(model,'longTerm')).toBe(true);
});
it('product event properties cannot contain property names, URLs or financial inputs',()=>{
  expect(productEventProperties('longTerm')).toEqual({strategy:'longTerm'});
});
