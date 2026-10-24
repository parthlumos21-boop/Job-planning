import React from 'react';
import { Compass, Settings, ShoppingBag, Factory, Truck, Megaphone, ChevronRight } from 'lucide-react';

const DEPT_THEMES = {
  marketing: {
    name: 'Marketing',
    icon: Megaphone,
    bgColor: 'bg-blue-50/50 hover:bg-blue-50/80',
    borderColor: 'border-blue-200/80',
    activeRing: 'ring-2 ring-[#0000AA]',
    barColor: 'bg-[#0000AA]',
    textColor: 'text-blue-950',
    badgeColor: 'bg-blue-100/80 text-blue-800'
  },
  design: {
    name: 'Electrical Design',
    icon: Compass,
    bgColor: 'bg-indigo-50/50 hover:bg-indigo-50/80',
    borderColor: 'border-indigo-200/80',
    activeRing: 'ring-2 ring-indigo-600',
    barColor: 'bg-indigo-600',
    textColor: 'text-indigo-950',
    badgeColor: 'bg-indigo-100/80 text-indigo-800'
  },
  mechanical: {
    name: 'Mechanical Design',
    icon: Settings,
    bgColor: 'bg-slate-50/80 hover:bg-slate-100/70',
    borderColor: 'border-slate-300/80',
    activeRing: 'ring-2 ring-slate-700',
    barColor: 'bg-slate-700',
    textColor: 'text-slate-900',
    badgeColor: 'bg-slate-200/80 text-slate-800'
  },
  purchase: {
    name: 'Procurement',
    icon: ShoppingBag,
    bgColor: 'bg-sky-50/50 hover:bg-sky-50/80',
    borderColor: 'border-sky-200/80',
    activeRing: 'ring-2 ring-sky-600',
    barColor: 'bg-sky-600',
    textColor: 'text-sky-950',
    badgeColor: 'bg-sky-100/80 text-sky-800'
  },
  production: {
    name: 'Production & QC',
    icon: Factory,
    bgColor: 'bg-blue-100/40 hover:bg-blue-100/70',
    borderColor: 'border-blue-300/80',
    activeRing: 'ring-2 ring-blue-700',
    barColor: 'bg-blue-700',
    textColor: 'text-blue-950',
    badgeColor: 'bg-blue-200/80 text-blue-900'
  }
};

export default function DepartmentMetricCard({ deptKey, stats, isSelected, onClick }) {
  const theme = DEPT_THEMES[deptKey] || DEPT_THEMES.marketing;
  const Icon = theme.icon;

  const total = stats?.total || 0;
  const completed = stats?.completed || 0;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className={`text-left w-full rounded-xl border p-2.5 transition-all duration-200 shadow-xs hover:shadow-sm ${
        theme.bgColor
      } ${theme.borderColor} ${isSelected ? theme.activeRing : 'hover:scale-[1.01]'}`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg bg-white shadow-xs shrink-0 ${theme.textColor}`}>
            <Icon size={14} />
          </div>
          <div className="min-w-0">
            <h4 className={`text-[11px] font-bold truncate ${theme.textColor}`}>{theme.name}</h4>
            <p className="text-[10px] text-slate-500 leading-tight">{total} Jobs</p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ml-1 ${theme.badgeColor}`}>
          {percent}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-white/80 rounded-full h-1.5 overflow-hidden border border-slate-200/50 mb-1.5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Numbers Breakdown */}
      <div className="flex items-center justify-between text-[10px] text-slate-600 font-medium leading-none">
        <span>Done: <strong className="text-emerald-700">{completed}</strong></span>
        <span>Pending: <strong className="text-amber-700">{total - completed}</strong></span>
      </div>
    </button>
  );
}
