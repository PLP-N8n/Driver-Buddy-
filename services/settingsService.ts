import { DEFAULT_SETTINGS, DriverRole, Settings } from '../types';

export type StoredSettings = Partial<Settings> & { driverRole?: DriverRole };

export const normalizeSettings = (storedSettings: StoredSettings): Settings => {
  const driverRoles = storedSettings.driverRoles?.length
    ? storedSettings.driverRoles
    : storedSettings.driverRole
      ? [storedSettings.driverRole]
      : DEFAULT_SETTINGS.driverRoles;

  return {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    driverRoles,
    analyticsConsent: storedSettings.analyticsConsent ?? DEFAULT_SETTINGS.analyticsConsent,
    colorTheme: storedSettings.colorTheme ?? DEFAULT_SETTINGS.colorTheme,
    debts: storedSettings.debts ?? DEFAULT_SETTINGS.debts,
    debtStrategy: storedSettings.debtStrategy ?? DEFAULT_SETTINGS.debtStrategy,
    manualAllowances: storedSettings.manualAllowances ?? DEFAULT_SETTINGS.manualAllowances,
  };
};
