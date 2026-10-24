export default function StatsCard({
  title,
  value,
  icon,
  trend,
  trendPositive = true,
  subtitle
}) {
  return (
    <div className="bg-white rounded-[11px] border border-slate-200/90 p-2.5 sm:p-3 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between min-h-[140px] sm:min-h-[145px]">
      {/* OUTER CARD HEADER: Title on left, small 13-14px outline icon on right */}
      <div className="flex items-center justify-between px-0.5 pb-2.5">
        <span className="text-[11px] font-medium text-slate-500 tracking-tight select-none">
          {title}
        </span>
        {icon && (
          <span className="text-slate-400 shrink-0 flex items-center justify-center">
            {icon}
          </span>
        )}
      </div>

      {/* INNER KPI CONTAINER: Distinct nested border and inset */}
      <div className="bg-slate-50/40 rounded-[8px] border border-slate-200/90 p-3 sm:p-3.5 flex-1 flex flex-col justify-between">
        {/* Main KPI Value */}
        <div className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 leading-none pt-1">
          {value !== undefined && value !== null ? value : 0}
        </div>

        {/* Secondary Supporting Information */}
        <div className="mt-3 flex items-center gap-1.5 text-[10px] leading-tight font-medium text-slate-400">
          {trend && (
            <span className={trendPositive ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
              {trend}
            </span>
          )}
          {subtitle && (
            <span className="truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
