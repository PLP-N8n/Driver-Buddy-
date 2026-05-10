import React from 'react';

export interface ProfitTaxChartProps {
  data: { month: string; profit: number; tax: number; deductions: number }[];
  height?: number;
}

const buildAreaPath = (points: [number, number][]) => {
  if (points.length === 0) return '';
  const first = points[0]!;
  const rest = points.slice(1);
  return `M ${first[0]},${first[1]} ` + rest.map(([x, y]) => `L ${x},${y}`).join(' ');
};

export const ProfitTaxChart: React.FC<ProfitTaxChartProps> = ({ data, height = 150 }) => {
  if (data.length === 0) return null;

  const maxValue = Math.max(...data.map((d) => d.profit + d.tax + d.deductions), 1);
  const chartWidth = 400;
  const chartHeight = height;
  const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;

  const getPoints = (selector: (d: (typeof data)[0]) => number, base: number) =>
    data.map((d, i) => {
      const value = selector(d) + base;
      const x = i * stepX;
      const y = chartHeight - (value / maxValue) * (chartHeight - 30);
      return [x, y] as [number, number];
    });

  const deductionPoints = getPoints((d) => d.deductions, 0);
  const profitBasePoints = getPoints((d) => d.deductions, 0);
  const profitTopPoints = getPoints((d) => d.deductions + d.profit, 0);
  const taxTopPoints = getPoints((d) => d.deductions + d.profit + d.tax, 0);

  const closePath = (top: [number, number][], bottom: [number, number][]) => {
    const reversedBottom = [...bottom].reverse();
    return buildAreaPath([...top, ...reversedBottom, top[0]!]) + 'Z';
  };

  const bottomLine = deductionPoints.map(([x]) => [x, chartHeight] as [number, number]);

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-full"
      role="img"
      aria-label="Profit and tax trend"
    >
      <path d={closePath(deductionPoints, bottomLine)} fill="rgba(99, 102, 241, 0.2)" />
      <path d={closePath(profitTopPoints, profitBasePoints)} fill="rgba(16, 185, 129, 0.2)" />
      <path d={closePath(taxTopPoints, profitTopPoints)} fill="rgba(245, 158, 11, 0.2)" />
    </svg>
  );
};
