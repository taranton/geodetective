import React from 'react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';

interface ConfidenceChartProps {
  score: number;
}

const ConfidenceChart: React.FC<ConfidenceChartProps> = ({ score }) => {
  const data = [
    {
      name: 'Confidence',
      value: score,
      fill: score > 80 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444',
    },
  ];

  return (
    <div className="relative h-48 w-48 mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis
            type="number"
            domain={[0, 100]}
            angleAxisId={0}
            tick={false}
          />
          <RadialBar
            background
            dataKey="value"
            cornerRadius={30 / 2}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-3xl font-bold text-white">{score}%</span>
        <span className="text-xs text-slate-400 uppercase tracking-widest">Confidence</span>
      </div>
    </div>
  );
};

export default ConfidenceChart;
