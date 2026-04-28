import { DEFAULT_SETTINGS, DriverRole, Settings } from '../types';

export type StoredSettings = Partial<Settings> & { driverRole?: DriverRole };

export const stampSettings = (settings: Settings, updatedAt = new Date().toISOString()): Settings => ({
  ...settings,
  updatedAt,
});

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
    vehicleFuelType: storedSettings.vehicleFuelType ?? DEFAULT_SETTINGS.vehicleFuelType,
    analyticsConsent: storedSettings.analyticsConsent ?? DEFAULT_SETTINGS.analyticsConsent,
    colorTheme: storedSettings.colorTheme ?? DEFAULT_SETTINGS.colorTheme,
    debts: storedSettings.debts ?? DEFAULT_SETTINGS.debts,
    directDebits: storedSettings.directDebits ?? DEFAULT_SETTINGS.directDebits,
    debtStrategy: storedSettings.debtStrategy ?? DEFAULT_SETTINGS.debtStrategy,
    manualAllowances: storedSettings.manualAllowances ?? DEFAULT_SETTINGS.manualAllowances,
    recurringExpenses: storedSettings.recurringExpenses ?? DEFAULT_SETTINGS.recurringExpenses,
    updatedAt: storedSettings.updatedAt,
  };
};
