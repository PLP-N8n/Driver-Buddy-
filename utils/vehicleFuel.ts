import { EnergyQuantityUnit, ExpenseCategory, Settings, VehicleFuelType } from '../types';

export const VEHICLE_FUEL_LABELS: Record<VehicleFuelType, string> = {
  PETROL: 'Petrol',
  DIESEL: 'Diesel',
  HYBRID: 'Hybrid',
  EV: 'Electric',
};

export function getVehicleEnergyExpenseCategory(settings: Pick<Settings, 'vehicleFuelType'>): ExpenseCategory {
  return settings.vehicleFuelType === 'EV' ? ExpenseCategory.PUBLIC_CHARGING : ExpenseCategory.FUEL;
}

export function getVehicleEnergyExpenseLabel(settings: Pick<Settings, 'vehicleFuelType'>): string {
  if (settings.vehicleFuelType === 'EV') return 'Charging';
  if (settings.vehicleFuelType === 'HYBRID') return 'Fuel / charging';
  return 'Fuel';
}

export function getVehicleEnergyExpenseDescription(settings: Pick<Settings, 'vehicleFuelType'>): string {
  if (settings.vehicleFuelType === 'EV') return 'EV charging';
  if (settings.vehicleFuelType === 'HYBRID') return 'Fuel or charging';
  return VEHICLE_FUEL_LABELS[settings.vehicleFuelType];
}

export function getVehicleEnergyQuantityUnit(settings: Pick<Settings, 'vehicleFuelType'>): EnergyQuantityUnit {
  return settings.vehicleFuelType === 'EV' ? 'kWh' : 'litre';
}

export function getEnergyQuantityUnitForCategory(category: ExpenseCategory): EnergyQuantityUnit | undefined {
  if (category === ExpenseCategory.FUEL) return 'litre';
  if (category === ExpenseCategory.PUBLIC_CHARGING || category === ExpenseCategory.HOME_CHARGING) return 'kWh';
  return undefined;
}

export function getEnergyQuantityLabel(unit: EnergyQuantityUnit): string {
  return unit === 'kWh' ? 'Energy in kWh' : 'Fuel volume in litres';
}

export function formatEnergyQuantity(quantity?: number, unit?: EnergyQuantityUnit): string {
  if (!quantity || !unit) return '';
  return unit === 'kWh' ? `${quantity} kWh` : `${quantity}L`;
}

export function isVehicleEnergyExpenseCategory(category: ExpenseCategory): boolean {
  return (
    category === ExpenseCategory.FUEL ||
    category === ExpenseCategory.PUBLIC_CHARGING ||
    category === ExpenseCategory.HOME_CHARGING
  );
}
