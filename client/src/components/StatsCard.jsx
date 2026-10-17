export default function StatsCard({ title, value, icon, color = 'blue' }) {
  const colorMap = {
    blue: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#1769FF]',
      pill: 'bg-[#E8F1FF] text-[#1769FF]',
      text: 'text-[#172B4D]'
    },
    yellow: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#92400E]',
      pill: 'bg-[#FEF3C7] text-[#92400E]',
      text: 'text-[#172B4D]'
    },
    green: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#15803D]',
      pill: 'bg-[#DCFCE7] text-[#15803D]',
      text: 'text-[#172B4D]'
    },
    orange: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#92400E]',
      pill: 'bg-[#FEF3C7] text-[#92400E]',
      text: 'text-[#172B4D]'
    },
    red: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#B91C1C]',
      pill: 'bg-[#FEE2E2] text-[#B91C1C]',
      text: 'text-[#172B4D]'
    },
    purple: {
      card: 'bg-white border-[#DCE5F0] hover:border-[#1769FF]',
      pill: 'bg-[#E8F1FF] text-[#1769FF]',
      text: 'text-[#172B4D]'
    },
  };

  const theme = colorMap[color] || colorMap.blue;

  return (
    <div className={`rounded-xl border p-5 shadow-xs transition-all ${theme.card}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#64748B]">{title}</p>
          <p className={`mt-1.5 text-2xl font-black ${theme.text}`}>{value}</p>
        </div>
        {icon && (
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${theme.pill}`}>
            <span className="text-xl">{icon}</span>
          </div>
        )}
      </div>
    </div>
  );
}

