import React from 'react';
import type { ActiveWorkSession } from '../../types';
import { formatCurrency } from '../../utils/ui';
import { HeroTile } from './HeroTile';
import { RealTimeTaxMeter, type RealTimeTaxMeterProps } from './RealTimeTaxMeter';

export interface BentoHeroProps {
  taxMeterProps: RealTimeTaxMeterProps;
  todayRevenue: number;
  weekRevenue: number;
  weeklyRevenueTarget: number;
  weekProgressPercent: number;
  taxSaved: number;
  totalBusinessMiles: number;
  activeSession: ActiveWorkSession | null;
  activeDurationHours: number;
  hasAnyLoggedShifts: boolean;
  onTileClick: (tile: 'today' | 'week' | 'tax' | 'miles') => void;
}

export const BentoHero: React.FC<BentoHeroProps> = ({
  taxMeterProps,
  todayRevenue,
  weekRevenue,
  weeklyRevenueTarget,
  weekProgressPercent,
  taxSaved,
  totalBusinessMiles,
  activeSession,
  activeDurationHours,
  hasAnyLoggedShifts,
  onTileClick,
}) => {
  const todayEmpty = !hasAnyLoggedShifts && !activeSession;
  const weekEmpty = !hasAnyLoggedShifts;
  const milesEmpty = totalBusinessMiles === 0 && !hasAnyLoggedShifts;

  const todaySubLabel = activeSession
    ? `${formatCurrency(todayRevenue)} live · ${activeDurationHours.toFixed(1)}h`
    : undefined;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
      <div className="md:col-span-2">
        <RealTimeTaxMeter {...taxMeterProps} size="hero" />
      </div>

      <div className="grid grid-cols-2 gap-2 md:gap-3">
        <HeroTile
          label="Today's Revenue"
          value={todayRevenue}
          prefix="£"
          decimals={2}
          subLabel={todaySubLabel}
          isEmpty={todayEmpty}
          emptyHint="Log a shift"
          onClick={() => onTileClick('today')}
        />
        <HeroTile
          label="Week Progress"
          value={weekRevenue}
          prefix="£"
          decimals={2}
          progress={weekProgressPercent}
          subLabel={weeklyRevenueTarget > 0 ? `Target ${formatCurrency(weeklyRevenueTarget)}` : undefined}
          isEmpty={weekEmpty}
          emptyHint="No shifts this week"
          onClick={() => onTileClick('week')}
        />
        <HeroTile
          label="Tax Saved"
          value={taxSaved}
          prefix="£"
          decimals={2}
          isEmpty={taxSaved === 0 && !hasAnyLoggedShifts}
          emptyHint="Log a shift to see this"
          onClick={() => onTileClick('tax')}
        />
        <HeroTile
          label="Miles Logged"
          value={totalBusinessMiles}
          suffix=" mi"
          decimals={0}
          isEmpty={milesEmpty}
          emptyHint="Log a shift to see this"
          onClick={() => onTileClick('miles')}
        />
      </div>
    </div>
  );
};
