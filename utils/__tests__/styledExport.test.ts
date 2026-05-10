import { describe, it, expect } from 'vitest';
import { generateStyledHtmlReport } from '../styledExport';

describe('generateStyledHtmlReport', () => {
  it('returns HTML string containing taxYearLabel', () => {
    const html = generateStyledHtmlReport({
      taxYearLabel: '2026/27',
      logs: [],
      trips: [],
      expenses: [],
      settings: { taxSetAsidePercent: 20 } as any,
    });
    expect(html).toContain('<html');
    expect(html).toContain('2026/27');
  });

  it('includes shift details when logs present', () => {
    const html = generateStyledHtmlReport({
      taxYearLabel: '2026/27',
      logs: [
        {
          id: '1',
          date: '2026-05-10',
          provider: 'Uber',
          hoursWorked: 4,
          revenue: 100,
        },
      ],
      trips: [
        {
          id: 't1',
          date: '2026-05-10',
          startLocation: 'A',
          endLocation: 'B',
          startOdometer: 1000,
          endOdometer: 1010,
          totalMiles: 10,
          purpose: 'Business',
          notes: '',
        },
      ],
      expenses: [],
      settings: { taxSetAsidePercent: 20 } as any,
    });
    expect(html).toContain('2026-05-10');
    expect(html).toContain('Uber');
    expect(html).toContain('10 mi');
  });
});
