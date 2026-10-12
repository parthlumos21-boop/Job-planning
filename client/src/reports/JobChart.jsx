import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function JobChart({ data, title = "Department Progress" }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="w-full bg-white rounded-2xl p-6 border border-indigo-50 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <h3 className="text-xl font-bold text-slate-800 mb-8 ml-2">{title}</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{
              top: 10,
              right: 10,
              left: -20,
              bottom: 10,
            }}
          >
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity={1} />
                <stop offset="100%" stopColor="#38BDF8" stopOpacity={0.8} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis 
              dataKey="name" 
              axisLine={false}
              tickLine={false}
              tick={{fill: '#94A3B8', fontSize: 12}}
              dy={10}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{fill: '#94A3B8', fontSize: 12}}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
            />
            <Tooltip 
              cursor={{fill: 'transparent'}}
              formatter={(value, name, item) => {
                const payload = item?.payload || {};
                return [`${value}% (${payload.filled || 0}/${payload.total || 0})`, 'Progress'];
              }}
              contentStyle={{
                backgroundColor: '#1E293B',
                border: 'none',
                borderRadius: '8px',
                color: '#F8FAFC',
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                padding: '12px'
              }}
              itemStyle={{ color: '#F8FAFC', fontWeight: 500 }}
            />
            <Bar 
              dataKey="progress" 
              radius={[6, 6, 0, 0]}
              barSize={40}
              fill="url(#barGradient)"
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
