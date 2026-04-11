import { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { buildTaxAnalysis } from './tax';

export interface TaxPackOptions {
  taxYearStart: string;
  taxYearEnd: string;
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
}

interface TotalsRow {
  label: string;
  value: number;
}

interface HmrcSummaryData {
  taxYearLabel: string;
  taxYearRangeLabel: string;
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  analysis: ReturnType<typeof buildTaxAnalysis>;
  selectedDeduction: number;
  projection: ReturnType<typeof buildTaxAnalysis>['actualProjection'];
  taxSetAside: number;
  gap: number;
  providerTotals: TotalsRow[];
  expenseCategoryTotals: TotalsRow[];
  class2Note: string;
  incomeTaxLabel: string;
}

const escapeCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

const formatUkDate = (date: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${date}T12:00:00Z`));

const getTaxYearLabel = (taxYearStart: string) => {
  const startYear = Number.parseInt(taxYearStart.slice(0, 4), 10);
  return `${startYear}/${String(startYear + 1).slice(-2)}`;
};

const getIncomeTaxLabel = (projection: ReturnType<typeof buildTaxAnalysis>['actualProjection'], settings: Settings) => {
  if (projection.estimatedTax <= 0) return 'No income tax due';
  if (settings.isScottishTaxpayer) return 'Scottish income tax estimate';
  if (projection.taxableProfit <= 50_270) return 'Basic rate estimate';
  if (projection.taxableProfit <= 125_140) return 'Higher rate estimate';
  return 'Additional rate estimate';
};

const toSortedTotals = (map: Map<string, number>): TotalsRow[] =>
  [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value);

const buildHmrcSummaryData = (options: TaxPackOptions): HmrcSummaryData => {
  const logs = options.logs.filter((log) => inRange(log.date, options.taxYearStart, options.taxYearEnd));
  const trips = options.trips.filter((trip) => inRange(trip.date, options.taxYearStart, options.taxYearEnd));
  const expenses = options.expenses.filter((expense) => inRange(expense.date, options.taxYearStart, options.taxYearEnd));

  const analysis = buildTaxAnalysis({
    trips,
    expenses,
    dailyLogs: logs,
    settings: options.settings,
  });
  const projection =
    options.settings.claimMethod === 'ACTUAL' ? analysis.actualProjection : analysis.simplifiedProjection;
  const selectedDeduction =
    options.settings.claimMethod === 'ACTUAL' ? analysis.actualDeduction : analysis.simplifiedDeduction;
  const taxSetAside = analysis.totalRevenue * (options.settings.taxSetAsidePercent / 100);
  const gap = Math.max(0, projection.estimatedLiability - taxSetAside);

  const providerRevenue = new Map<string, number>();
  for (const log of logs) {
    if (log.providerSplits?.length) {
      for (const split of log.providerSplits) {
        providerRevenue.set(split.provider, (providerRevenue.get(split.provider) ?? 0) + split.revenue);
      }
      continue;
    }

    const provider = log.provider || 'Other';
    providerRevenue.set(provider, (providerRevenue.get(provider) ?? 0) + log.revenue);
  }

  const expenseTotals = new Map<string, number>();
  for (const expense of expenses) {
    expenseTotals.set(expense.category, (expenseTotals.get(expense.category) ?? 0) + expense.amount);
  }

  return {
    taxYearLabel: getTaxYearLabel(options.taxYearStart),
    taxYearRangeLabel: `${formatUkDate(options.taxYearStart)} to ${formatUkDate(options.taxYearEnd)}`,
    logs,
    trips,
    expenses,
    analysis,
    selectedDeduction,
    projection,
    taxSetAside,
    gap,
    providerTotals: toSortedTotals(providerRevenue),
    expenseCategoryTotals: toSortedTotals(expenseTotals),
    class2Note:
      'Mandatory Class 2 National Insurance was abolished from 6 April 2024. Above the small profits threshold it is treated as paid; below that it is voluntary and not included in this estimate.',
    incomeTaxLabel: getIncomeTaxLabel(projection, options.settings),
  };
};

const renderRows = (rows: TotalsRow[], emptyLabel: string) => {
  if (rows.length === 0) {
    return `<tr><td>${escapeHtml(emptyLabel)}</td><td>${escapeHtml(formatCurrency(0))}</td></tr>`;
  }

  return rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.label)}</td><td class="num">${escapeHtml(formatCurrency(row.value))}</td></tr>`
    )
    .join('');
};

export function generateTaxPackCSVs(options: TaxPackOptions): {
  summaryCSV: string;
  detailCSV: string;
  mileageCSV: string;
} {
  const summary = buildHmrcSummaryData(options);

  const summaryRows = [
    [
      'Tax Year',
      'Claim Method',
      'Scottish Taxpayer',
      'Total Earnings',
      'Total Business Miles',
      'Mileage Claim (GBP)',
      'Other Allowable Expenses (GBP)',
      'Selected Allowable Expenses (GBP)',
      'Estimated Net Profit (GBP)',
      'Income Tax Estimate (GBP)',
      'Class 2 NI Due (GBP)',
      'Class 4 NI Due (GBP)',
      'Total NI (GBP)',
      'Estimated Tax Liability (GBP)',
      'Payments On Account (GBP)',
      'January Payment Total (GBP)',
      'Personal Allowance Used (GBP)',
      'Personal Allowance Remaining (GBP)',
      'Tax Already Set Aside (GBP)',
      'Gap (GBP)',
    ],
    [
      summary.taxYearLabel,
      options.settings.claimMethod === 'ACTUAL' ? 'Actual costs' : 'Simplified mileage',
      options.settings.isScottishTaxpayer ? 'Yes' : 'No',
      summary.analysis.totalRevenue.toFixed(2),
      summary.analysis.totalBusinessMiles.toFixed(1),
      summary.analysis.totalMileageAllowance.toFixed(2),
      summary.analysis.otherBusinessExpenses.toFixed(2),
      summary.selectedDeduction.toFixed(2),
      summary.projection.taxableProfit.toFixed(2),
      summary.projection.estimatedTax.toFixed(2),
      summary.projection.estimatedClass2NI.toFixed(2),
      summary.projection.estimatedClass4NI.toFixed(2),
      summary.projection.estimatedNI.toFixed(2),
      summary.projection.estimatedLiability.toFixed(2),
      summary.projection.paymentOnAccountAmount.toFixed(2),
      summary.projection.januaryPaymentTotal.toFixed(2),
      summary.projection.personalAllowanceUsed.toFixed(2),
      summary.projection.personalAllowanceRemaining.toFixed(2),
      summary.taxSetAside.toFixed(2),
      summary.gap.toFixed(2),
    ],
  ];

  const detailRows: Array<Array<string | number>> = [];
  detailRows.push(['REPORT', 'Driver Buddy Tax Pack']);
  detailRows.push(['Tax Year', summary.taxYearLabel]);
  detailRows.push(['Date Range', summary.taxYearRangeLabel]);
  detailRows.push(['Important', 'Estimate for reference only. Verify with your accountant.']);
  detailRows.push([]);
  detailRows.push(['WORK LOG']);
  detailRows.push(['Date', 'Provider', 'Hours', 'Revenue', 'Miles', 'Fuel Litres', 'Notes']);
  detailRows.push(
    ...summary.logs.map((log) => [
      log.date,
      log.provider,
      log.hoursWorked.toFixed(2),
      log.revenue.toFixed(2),
      (log.milesDriven ?? 0).toFixed(1),
      (log.fuelLiters ?? 0).toFixed(2),
      log.notes ?? '',
    ])
  );
  detailRows.push([]);
  detailRows.push(['EXPENSES']);
  detailRows.push(['Date', 'Category', 'Amount', 'Description']);
  detailRows.push(
    ...summary.expenses.map((expense) => [
      expense.date,
      expense.category,
      expense.amount.toFixed(2),
      expense.description,
    ])
  );
  detailRows.push([]);
  detailRows.push(['MILEAGE']);
  detailRows.push(['Date', 'Start Location', 'End Location', 'Miles', 'Purpose', 'Notes']);
  detailRows.push(
    ...summary.trips
      .filter((trip) => trip.purpose === 'Business')
      .map((trip) => [
        trip.date,
        trip.startLocation,
        trip.endLocation,
        trip.totalMiles.toFixed(1),
        trip.purpose,
        trip.notes,
      ])
  );
  detailRows.push([]);
  detailRows.push(['SUMMARY']);
  detailRows.push(['Metric', 'Value']);
  detailRows.push(['Claim method', options.settings.claimMethod === 'ACTUAL' ? 'Actual costs' : 'Simplified mileage']);
  detailRows.push(['Scottish taxpayer', options.settings.isScottishTaxpayer ? 'Yes' : 'No']);
  detailRows.push(['Total earnings', formatCurrency(summary.analysis.totalRevenue)]);
  detailRows.push(['Total business miles', summary.analysis.totalBusinessMiles.toFixed(1)]);
  detailRows.push(['Mileage claim', formatCurrency(summary.analysis.totalMileageAllowance)]);
  detailRows.push(['Other allowable expenses', formatCurrency(summary.analysis.otherBusinessExpenses)]);
  detailRows.push(['Selected allowable expenses', formatCurrency(summary.selectedDeduction)]);
  detailRows.push(['Estimated net profit', formatCurrency(summary.projection.taxableProfit)]);
  detailRows.push([summary.incomeTaxLabel, formatCurrency(summary.projection.estimatedTax)]);
  detailRows.push(['Class 2 NI due', formatCurrency(summary.projection.estimatedClass2NI)]);
  detailRows.push(['Class 4 NI due', formatCurrency(summary.projection.estimatedClass4NI)]);
  detailRows.push(['Estimated tax liability', formatCurrency(summary.projection.estimatedLiability)]);
  detailRows.push(['Payments on account', formatCurrency(summary.projection.paymentOnAccountAmount)]);
  detailRows.push(['January payment total', formatCurrency(summary.projection.januaryPaymentTotal)]);
  detailRows.push(['Personal allowance used', formatCurrency(summary.projection.personalAllowanceUsed)]);
  detailRows.push(['Personal allowance remaining', formatCurrency(summary.projection.personalAllowanceRemaining)]);
  detailRows.push(['Tax already set aside', formatCurrency(summary.taxSetAside)]);
  detailRows.push(['Gap', formatCurrency(summary.gap)]);
  detailRows.push(['Class 2 note', summary.class2Note]);

  const mileageRows = [
    ['Date', 'Start Location', 'End Location', 'Miles', 'Purpose', 'Notes'],
    ...summary.trips
      .filter((trip) => trip.purpose === 'Business')
      .map((trip) => [
        trip.date,
        trip.startLocation,
        trip.endLocation,
        trip.totalMiles.toFixed(1),
        trip.purpose,
        trip.notes,
      ]),
  ];

  return {
    summaryCSV: summaryRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n'),
    detailCSV: detailRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n'),
    mileageCSV: mileageRows.map((row) => row.map(escapeCsvCell).join(',')).join('\n'),
  };
}

export function generateHmrcSummaryHtml(options: TaxPackOptions): string {
  const summary = buildHmrcSummaryData(options);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Driver Buddy HMRC Summary ${escapeHtml(summary.taxYearLabel)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Arial, sans-serif;
        color: #0f172a;
        background: #f8fafc;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        background: #f8fafc;
        color: #0f172a;
      }
      .page {
        max-width: 960px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 20px;
        padding: 32px;
      }
      h1, h2, h3, p { margin: 0; }
      h1 { font-size: 28px; }
      h2 {
        margin-top: 28px;
        font-size: 18px;
      }
      p + p { margin-top: 6px; }
      .meta {
        margin-top: 10px;
        color: #475569;
      }
      .warning {
        margin-top: 16px;
        padding: 14px 16px;
        border-radius: 14px;
        background: #fef3c7;
        border: 1px solid #f59e0b;
        color: #78350f;
        font-size: 14px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
        margin-top: 18px;
      }
      .stat {
        padding: 16px;
        border-radius: 14px;
        background: #f8fafc;
        border: 1px solid #cbd5e1;
      }
      .stat-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
      }
      .stat-value {
        margin-top: 8px;
        font-size: 22px;
        font-weight: 700;
      }
      .two-up {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 20px;
        margin-top: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12px;
        font-size: 14px;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid #e2e8f0;
        text-align: left;
        vertical-align: top;
      }
      th {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #64748b;
      }
      .num {
        text-align: right;
        white-space: nowrap;
      }
      .note {
        margin-top: 12px;
        font-size: 13px;
        color: #475569;
      }
      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }
        .page {
          border: 0;
          border-radius: 0;
          padding: 0;
        }
      }
      @media (max-width: 720px) {
        body { padding: 16px; }
        .page { padding: 20px; }
        .stats, .two-up { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <h1>Driver Buddy HMRC Summary</h1>
      <p class="meta">Tax year ${escapeHtml(summary.taxYearLabel)} (${escapeHtml(summary.taxYearRangeLabel)})</p>
      <p class="meta">Claim method: ${escapeHtml(options.settings.claimMethod === 'ACTUAL' ? 'Actual costs' : 'Simplified mileage')}</p>
      <p class="meta">Scottish taxpayer: ${escapeHtml(options.settings.isScottishTaxpayer ? 'Yes' : 'No')}</p>
      <div class="warning">Estimate for reference only. Verify with your accountant.</div>

      <section>
        <h2>Core Summary</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-label">Total earnings</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.analysis.totalRevenue))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Net profit after allowable expenses</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.taxableProfit))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">${escapeHtml(summary.incomeTaxLabel)}</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.estimatedTax))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Estimated tax liability</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.estimatedLiability))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Class 2 NI due</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.estimatedClass2NI))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Class 4 NI due</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.estimatedClass4NI))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Payments on account</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.paymentOnAccountAmount))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">January payment total</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.januaryPaymentTotal))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Personal allowance used</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.personalAllowanceUsed))}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Personal allowance remaining</div>
            <div class="stat-value">${escapeHtml(formatCurrency(summary.projection.personalAllowanceRemaining))}</div>
          </div>
        </div>
        <p class="note">${escapeHtml(summary.class2Note)}</p>
      </section>

      <section class="two-up">
        <div>
          <h2>Earnings by Platform</h2>
          <table>
            <thead>
              <tr><th>Platform</th><th class="num">Total</th></tr>
            </thead>
            <tbody>${renderRows(summary.providerTotals, 'No earnings logged')}</tbody>
          </table>
        </div>
        <div>
          <h2>Expenses by Category</h2>
          <table>
            <thead>
              <tr><th>Category</th><th class="num">Total</th></tr>
            </thead>
            <tbody>${renderRows(summary.expenseCategoryTotals, 'No expenses logged')}</tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>Mileage and Allowances</h2>
        <table>
          <tbody>
            <tr><th>Total business mileage</th><td class="num">${escapeHtml(summary.analysis.totalBusinessMiles.toFixed(1))} miles</td></tr>
            <tr><th>HMRC mileage claim</th><td class="num">${escapeHtml(formatCurrency(summary.analysis.totalMileageAllowance))}</td></tr>
            <tr><th>Other allowable expenses</th><td class="num">${escapeHtml(formatCurrency(summary.analysis.otherBusinessExpenses))}</td></tr>
            <tr><th>Selected allowable expenses</th><td class="num">${escapeHtml(formatCurrency(summary.selectedDeduction))}</td></tr>
            <tr><th>Tax already set aside</th><td class="num">${escapeHtml(formatCurrency(summary.taxSetAside))}</td></tr>
            <tr><th>Gap</th><td class="num">${escapeHtml(formatCurrency(summary.gap))}</td></tr>
          </tbody>
        </table>
      </section>
    </main>
  </body>
</html>`;
}
