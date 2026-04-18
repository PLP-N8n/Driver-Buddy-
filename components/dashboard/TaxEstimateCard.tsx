import React from 'react';
import { TrendingUp } from 'lucide-react';
import { calcKept, calcTaxBuffer } from '../../shared/calculations/tax';
import { formatCurrency, formatNumber, panelClasses, subtlePanelClasses } from '../../utils/ui';

type TaxEstimateCardProps = {
  totals: {
    totalRevenue: number;
    taxSetAside: number;
    totalBusinessMiles: number;
    mileageClaim: number;
  };
};

export const TaxEstimateCard: React.FC<TaxEstimateCardProps> = ({ totals }) => {
  const taxSetAsidePercent = totals.totalRevenue > 0 ? (totals.taxSetAside / totals.totalRevenue) * 100 : 0;
  const taxSetAside = calcTaxBuffer(totals.totalRevenue, taxSetAsidePercent);
  const keptEstimate = calcKept(totals.totalRevenue, totals.mileageClaim, taxSetAside);

  return (
    <section className={`${panelClasses} p-5`} data-kept-estimate={keptEstimate.toFixed(2)}>
      <div className="flex items-center gap-2 text-slate-400">
        <TrendingUp className="h-4 w-4" />
        <p className="text-xs font-semibold uppercase tracking-[0.2em]">This tax year</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs text-slate-500">Total earned</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatCurrency(totals.totalRevenue)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs text-slate-500">Tax to set aside</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatCurrency(taxSetAside)}</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs text-slate-500">Business miles</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatNumber(totals.totalBusinessMiles, 0)} mi</p>
        </div>
        <div className={`${subtlePanelClasses} p-4`}>
          <p className="text-xs text-slate-500">Mileage claim</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatCurrency(totals.mileageClaim)}</p>
        </div>
      </div>
    </section>
  );
};
