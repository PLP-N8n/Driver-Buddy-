import type { DriverRole } from '../types';

export const ROLE_PROVIDER_OPTIONS: Record<DriverRole, string[]> = {
  COURIER: ['Amazon Flex', 'DPD', 'Evri', 'Yodel', 'CitySprint', 'Royal Mail', 'Gophr'],
  FOOD_DELIVERY: ['Uber Eats', 'Deliveroo', 'Just Eat', 'Stuart', 'Beelivery', 'Gopuff'],
  TAXI: ['Uber', 'Bolt', 'FREENOW', 'Ola', 'Gett', 'Local Firm', 'Private Clients'],
  LOGISTICS: ['BCA Logistics', 'Engineius', 'Manheim', 'Drascombe', 'Auto Trader', 'Private Trade'],
  OTHER: ['Private client', 'Agency', 'Other'],
};

export const getProvidersByRole = (role: DriverRole): string[] => ROLE_PROVIDER_OPTIONS[role] ?? ROLE_PROVIDER_OPTIONS.OTHER;

export const getProviderOptions = (roles: DriverRole[], ...selectedProviders: Array<string | undefined>) => {
  const providers = Array.from(new Set(roles.flatMap(getProvidersByRole)));
  const missingSelectedProviders = selectedProviders
    .map((provider) => provider?.trim())
    .filter((provider): provider is string => Boolean(provider))
    .filter((provider) => !providers.includes(provider));

  return Array.from(new Set([...missingSelectedProviders, ...providers]));
};
