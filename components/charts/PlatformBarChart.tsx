import React from 'react';

export interface PlatformBarChartProps {
  data: { provider: string; revenue: number }[];
  height?: number;
}

export const PlatformBarChart: React.FC<PlatformBarChartProps> = ({ data }) => {
  if (data.length === 0) return null;

  const maxRevenue = Math.max(...data.map((d) => d.revenue), 1);
  const barHeight = 20;
  const gap = 8;
  const labelWidth = 60;
  const chartWidth = 300;
  const chartFullHeight = data.length * (barHeight + gap) + gap;

  return (
    <svg
      viewBox={`0 0 ${chartWidth + labelWidth} ${chartFullHeight}`}
      className="w-full"
      role="img"
      aria-label="Platform revenue comparison"
    >
      {data.map((item, index) => {
        const barWidth = (item.revenue / maxRevenue) * chartWidth;
        const y = gap + index * (barHeight + gap);

        return (
          <g key={item.provider}>
            <text x={0} y={y + barHeight / 2 + 4} fill="#94a3b8" fontSize="12">
              {item.provider}
            </text>
            <rect
              x={labelWidth}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
              fill="rgba(99, 102, 241, 0.6)"
            />
            <text
              x={labelWidth + barWidth + 6}
              y={y + barHeight / 2 + 4}
              fill="#cbd5e1"
              fontSize="10"
            >
              £{item.revenue}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
