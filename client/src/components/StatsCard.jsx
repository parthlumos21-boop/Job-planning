export default function StatsCard({
  title,
  value,
  icon,
  trend,
  trendPositive = true,
  subtitle
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs hover:shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between min-h-[135px]">
      {/* Top Header: Title & Stylized Icon Badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500 tracking-wider uppercase select-none truncate">
          {title}
        </span>
        {icon && (
          <div className="w-9 h-9 rounded-xl bg-blue-50/80 border border-blue-100/90 text-[#0000AA] flex items-center justify-center shrink-0 shadow-2xs">
            {icon}
          </div>
        )}
      </div>

      {/* Main KPI Value */}
      <div className="mt-2 text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-none">
        {value !== undefined && value !== null ? value : 0}
      </div>

      {/* Secondary Supporting Information / Trend */}
      <div className="mt-3 flex items-center gap-2 text-xs font-medium text-slate-500 flex-wrap">
        {trend && (
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold ${
              trendPositive
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                : 'bg-rose-50 text-rose-700 border border-rose-200/60'
            }`}
          >
            {trend}
          </span>
        )}
        {subtitle && (
          <span className="text-slate-400 text-xs truncate">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
