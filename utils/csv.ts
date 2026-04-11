export const escapeCsvCell = (value: string | number) => `"${String(value ?? '').replace(/"/g, '""')}"`;
