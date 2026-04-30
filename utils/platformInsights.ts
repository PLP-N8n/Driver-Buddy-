import type { DailyWorkLog } from '../types';

export interface PlatformSummary {
  provider: string;
  totalEarnings: number;
  totalHours: number;
  hourlyRate: number;
  shiftCount: number;
  earningsShare: number;
}

type PlatformAccumulator = {
  provider: string;
  totalEarnings: number;
  totalHours: number;
  shiftCount: number;
};

const fallbackProvider = 'Other';

const normalizeProviderKey = (provider: string) => provider.trim().toLocaleLowerCase('en-GB') || fallbackProvider.toLocaleLowerCase('en-GB');

const getDisplayProvider = (provider: string) => provider.trim() || fallbackProvider;

const addProviderEntry = (
  platforms: Map<string, PlatformAccumulator>,
  provider: string,
  earnings: number,
  hours: number
) => {
  const safeEarnings = Number.isFinite(earnings) ? earnings : 0;
  const safeHours = Number.isFinite(hours) ? hours : 0;
  const key = normalizeProviderKey(provider);
  const existing = platforms.get(key) ?? {
    provider: getDisplayProvider(provider),
    totalEarnings: 0,
    totalHours: 0,
    shiftCount: 0,
  };

  platforms.set(key, {
    provider: existing.provider,
    totalEarnings: existing.totalEarnings + safeEarnings,
    totalHours: existing.totalHours + safeHours,
    shiftCount: existing.shiftCount + 1,
  });
};

export function calcPlatformSummaries(logs: DailyWorkLog[]): PlatformSummary[] {
  const platforms = new Map<string, PlatformAccumulator>();

  for (const log of logs) {
    if (log.providerSplits?.length) {
      const totalSplitRevenue = log.providerSplits.reduce((sum, split) => sum + split.revenue, 0);
      const revenueForHours = log.revenue > 0 ? log.revenue : totalSplitRevenue;

      for (const split of log.providerSplits) {
        const hourShare = revenueForHours > 0 ? split.revenue / revenueForHours : 0;
        addProviderEntry(
          platforms,
          split.provider,
          split.revenue,
          log.hoursWorked * hourShare
        );
      }
    } else {
      addProviderEntry(platforms, log.provider, log.revenue, log.hoursWorked);
    }
  }

  const grandTotalEarnings = [...platforms.values()].reduce((sum, platform) => sum + platform.totalEarnings, 0);

  return [...platforms.values()]
    .filter((platform) => platform.totalEarnings > 0)
    .map((platform) => ({
      ...platform,
      hourlyRate: platform.totalHours > 0 ? platform.totalEarnings / platform.totalHours : 0,
      earningsShare: grandTotalEarnings > 0 ? (platform.totalEarnings / grandTotalEarnings) * 100 : 0,
    }))
    .sort((left, right) => right.totalEarnings - left.totalEarnings);
}
