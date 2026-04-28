import { ExpenseCategory } from '../types';

const KEYWORD_MAP: Array<[ExpenseCategory, string[]]> = [
  [ExpenseCategory.FUEL, ['shell', 'bp', 'esso', 'texaco', 'morrisons fuel', 'tesco fuel', 'sainsbury fuel', 'petrol', 'diesel', 'fuel station', 'fuel pump', 'jet1']],
  [ExpenseCategory.PUBLIC_CHARGING, ['pod point', 'osprey', 'gridserve', 'bp pulse', 'ubitricity', 'char.gy', 'osprey', 'mer', 'geniepoint', 'zap', 'charging point', 'ev charge', 'rapid charge', 'fast charge', 'public charge']],
  [ExpenseCategory.HOME_CHARGING, ['home charge', 'home energy', 'octopus', 'bulb', 'ovo', 'british gas', 'edf', 'scottish power', 'e.on', 'utility bill', 'electricity bill']],
  [ExpenseCategory.REPAIRS, ['halfords', 'kwik fit', 'kwikfit', 'arnold clark', 'mr tyre', 'national tyres', 'formula one', 'garage', 'mechanic', 'service', 'mot prep', 'repair', 'tyre', 'tyres', 'brake', 'brakes', 'oil change', 'windscreen', 'auto parts', 'parts', 'exhaust', 'clutch', 'gearbox', 'bodywork', 'dent', 'scratch']],
  [ExpenseCategory.INSURANCE, ['direct line', 'admiral', 'aviva', 'hastings', 'confused.com', 'comparethemarket', 'go compare', 'policy', 'premium', 'insurance', 'insure', 'cover', 'topdrive', 'ingenie', 'tempcover']],
  [ExpenseCategory.TAX, ['dvla', 'road tax', 'vehicle tax', 'vehicle excise', 'ved', 'tax disc', 'gov.uk vehicle']],
  [ExpenseCategory.MOT, ['mot', 'ministry of transport', 'mot test', 'mot station', 'mot centre', 'mot check']],
  [ExpenseCategory.CLEANING, ['carwash', 'car wash', 'auto shine', 'valeting', 'valet', 'detailing', 'jet wash', 'hand wash', 'cleaning products', 'polish', 'wax', 'hoover']],
  [ExpenseCategory.PARKING, ['parking', 'car park', 'ncp', 'q-park', 'q park', 'apcoa', 'ringgo', 'paybyphone', 'pay by phone', 'penalty charge', 'pcn', 'toll', 'dart charge', 'congestion charge', 'ulez', 'clean air zone', 'caz', 'bridge toll']],
  [ExpenseCategory.PHONE, ['vodafone', 'ee', 'o2', 'three', '3 mobile', 'giffgaff', 'smarty', 'lebara', 'lyca', 'sim only', 'sim card', 'mobile bill', 'phone bill', 'data plan', 'airtime']],
  [ExpenseCategory.ACCOUNTANCY, ['accountant', 'accountancy', 'bookkeeper', 'tax return', 'self assessment', 'hmrc fee', 'tax agent', 'xero', 'quickbooks', 'sage', 'freeagent', 'crunch', 'taxscouts', 'taxd', 'tax adviser', 'chartered']],
  [ExpenseCategory.SUBSCRIPTIONS, ['amazon', 'deliveroo plus', 'uber one', 'just eat', 'stuart', 'gophr', 'boltfood', 'subscription', 'monthly fee', 'annual fee', 'membership', 'waze', 'tomtom', 'garmin', 'dashcam', 'fleet']],
  [ExpenseCategory.PROTECTIVE_CLOTHING, ['helmet', 'gloves', 'jacket', 'hi-vis', 'high vis', 'hiviz', 'reflective', 'safety vest', 'boots', 'waterproof', 'cycling gear', 'protective', 'thermal', 'gilet']],
  [ExpenseCategory.TRAINING, ['training', 'course', 'licence', 'license', 'cpc', 'driver cpc', 'first aid', 'defensive driving', 'advanced driving', 'qualification', 'certificate', 'dbs check', 'pcn exam', 'taxi test', 'knowledge test']],
  [ExpenseCategory.BANK_CHARGES, ['bank charge', 'bank fee', 'transaction fee', 'transfer fee', 'stripe fee', 'paypal fee', 'square fee', 'payment processing', 'merchant fee', 'currency fee', 'overdraft', 'arrangement fee']],
];

export function suggestCategory(description: string): ExpenseCategory | null {
  if (!description || description.trim().length < 3) return null;

  const lower = description.toLowerCase();

  for (const [category, keywords] of KEYWORD_MAP) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return category;
    }
  }

  return null;
}
