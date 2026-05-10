import React from 'react';

export interface RevenueTrendChartProps {
  data: { week: string; revenue: number }[];
  height?: number;
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ data, height = 150 }) => {
  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
        Log shifts to see trends
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const barWidth = 30;
  const gap = 10;
  const chartWidth = data.length * (barWidth + gap) + gap;
  const chartHeight = height;

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="w-full"
      role="img"
      aria-label="Weekly revenue trend"
    >
      {data.map((item) => {
        const barHeight = (item.revenue / maxRevenue) * (chartHeight - 30);
        const index = data.indexOf(item);
        const x = gap + index * (barWidth + gap);
        const y = chartHeight - barHeight - 20;

        return (
          <g key={item.week}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill="rgba(245, 158, 11, 0.6)"
            />
            <text
              x={x + barWidth / 2}
              y={chartHeight - 5}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="10"
              transform={`rotate(-45, ${x + barWidth / 2}, ${chartHeight - 5})`}
            >
              {item.week}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
