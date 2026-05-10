import { DailyWorkLog, Expense, Settings, Trip } from '../types';
import { formatCurrency } from './ui';

const escHtml = (value: unknown): string => {
  const s = String(value ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

export function generateStyledHtmlReport(params: {
  taxYearLabel: string;
  logs: DailyWorkLog[];
  trips: Trip[];
  expenses: Expense[];
  settings: Settings;
}): string {
  const { taxYearLabel, logs, trips } = params;
  const totalRevenue = logs.reduce((sum, log) => sum + log.revenue, 0);
  const totalMiles = trips
    .filter((t) => t.purpose === 'Business')
    .reduce((sum, t) => sum + t.totalMiles, 0);

  const shiftRows = logs
    .map(
      (log) =>
        `<tr><td>${escHtml(log.date)}</td><td>${escHtml(log.provider)}</td><td>${escHtml(log.hoursWorked)}</td><td>${formatCurrency(log.revenue)}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Driver Buddy Report ${taxYearLabel}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1f2937}
h1{font-size:28px;margin-bottom:8px}
h2{font-size:20px;margin-top:32px;margin-bottom:16px;border-bottom:2px solid #f59e0b;padding-bottom:8px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{padding:12px;text-align:left;border-bottom:1px solid #e5e7eb}
th{background:#f9fafb;font-weight:600}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:24px}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px}
.card h3{font-size:14px;color:#6b7280;margin:0}
.card p{font-size:24px;font-weight:700;margin:8px 0 0}
</style>
</head>
<body>
<h1>Driver Buddy Tax Report</h1>
<p>Tax Year ${escHtml(taxYearLabel)}</p>

<div class="summary">
  <div class="card"><h3>Total Revenue</h3><p>${formatCurrency(totalRevenue)}</p></div>
  <div class="card"><h3>Business Miles</h3><p>${totalMiles} mi</p></div>
  <div class="card"><h3>Shifts Logged</h3><p>${logs.length}</p></div>
</div>

<h2>Shift Details</h2>
<table>
  <thead><tr><th>Date</th><th>Provider</th><th>Hours</th><th>Revenue</th></tr></thead>
  <tbody>
    ${shiftRows}
  </tbody>
</table>
</body>
</html>`;
}
