import { useState } from 'react';
import { DailyWorkLog, Expense, Settings, Trip, getCurrentTaxYearLabel } from '../types';
import { escapeCsvCell } from '../utils/csv';
import { generateHmrcSummaryHtml } from '../utils/taxPack';
import { ukTaxYearEnd, ukTaxYearStart } from '../utils/ukDate';

interface ExportConfig {
  includeTrips: boolean;
  includeExpenses: boolean;
  includeWorkLogs: boolean;
}

interface UseExportParams {
  trips: Trip[];
  expenses: Expense[];
  dailyLogs: DailyWorkLog[];
  settings: Settings;
  trackEvent: (name: string, props?: Record<string, unknown>) => void;
  triggerTextDownload: (filename: string, content: string, mimeType?: string) => void;
  queueDownload: (count: number, fn: () => void) => void;
  setShowExportModal: (open: boolean) => void;
}

export function useExport({
  trips,
  expenses,
  dailyLogs,
  settings,
  trackEvent,
  triggerTextDownload,
  queueDownload,
  setShowExportModal,
}: UseExportParams) {
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    includeTrips: true,
    includeExpenses: true,
    includeWorkLogs: true,
  });

  const handleExport = () => {
    const rows: string[] = [];
    if (exportConfig.includeTrips) {
      rows.push('MILEAGE LOG');
      rows.push(['Date', 'Purpose', 'Start', 'End', 'Start Odo', 'End Odo', 'Total Miles', 'Notes'].map(escapeCsvCell).join(','));
      rows.push(...trips.map((trip) => [trip.date, trip.purpose, trip.startLocation, trip.endLocation, trip.startOdometer, trip.endOdometer, trip.totalMiles, trip.notes].map(escapeCsvCell).join(',')));
      rows.push('');
    }
    if (exportConfig.includeExpenses) {
      rows.push('EXPENSES LOG');
      rows.push(['Date', 'Category', 'Amount', 'Description'].map(escapeCsvCell).join(','));
      rows.push(...expenses.map((expense) => [expense.date, expense.category, expense.amount, expense.description].map(escapeCsvCell).join(',')));
      rows.push('');
    }
    if (exportConfig.includeWorkLogs) {
      rows.push('PERFORMANCE LOG');
      rows.push(['Date', 'Provider', 'Hours', 'Revenue', 'Jobs/Drops', 'Fuel (Liters)'].map(escapeCsvCell).join(','));
      rows.push(...dailyLogs.map((log) => [log.date, log.provider, log.hoursWorked, log.revenue, log.jobCount || 0, log.fuelLiters || 0].map(escapeCsvCell).join(',')));
      rows.push('');
    }
    const exportCount =
      (exportConfig.includeTrips ? trips.length : 0) +
      (exportConfig.includeExpenses ? expenses.length : 0) +
      (exportConfig.includeWorkLogs ? dailyLogs.length : 0);
    queueDownload(exportCount, () => {
      triggerTextDownload('DriverBuddy_Export.csv', rows.join('\n'));
    });
    setShowExportModal(false);
    trackEvent('export_downloaded', {
      includeTrips: exportConfig.includeTrips,
      includeExpenses: exportConfig.includeExpenses,
      includeWorkLogs: exportConfig.includeWorkLogs,
    });
  };

  const handleHmrcSummaryExport = () => {
    const recordCount = dailyLogs.length + trips.length + expenses.length;
    const html = generateHmrcSummaryHtml({
      taxYearStart: ukTaxYearStart(),
      taxYearEnd: ukTaxYearEnd(),
      logs: dailyLogs,
      trips,
      expenses,
      settings,
    });

    queueDownload(recordCount, () => {
      triggerTextDownload(`driver-buddy-hmrc-summary-${getCurrentTaxYearLabel().replace('/', '-')}.html`, html, 'text/html;charset=utf-8');
    });

    trackEvent('hmrc_summary_downloaded', {
      claimMethod: settings.claimMethod,
      isScottishTaxpayer: Boolean(settings.isScottishTaxpayer),
    });
  };

  return { exportConfig, setExportConfig, handleExport, handleHmrcSummaryExport };
}
