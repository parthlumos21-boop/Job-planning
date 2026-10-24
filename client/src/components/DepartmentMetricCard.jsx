import React from 'react';
import { Compass, Settings, ShoppingBag, Factory, Truck, Megaphone, ChevronRight } from 'lucide-react';

const DEPT_THEMES = {
  marketing: {
    name: 'Marketing',
    icon: Megaphone,
    bgColor: 'bg-blue-50/70',
    borderColor: 'border-blue-200',
    activeRing: 'ring-2 ring-blue-500',
    barColor: 'bg-blue-600',
    textColor: 'text-blue-900',
    badgeColor: 'bg-blue-100 text-blue-800'
  },
  design: {
    name: 'Electrical Design',
    icon: Compass,
    bgColor: 'bg-emerald-50/70',
    borderColor: 'border-emerald-200',
    activeRing: 'ring-2 ring-emerald-500',
    barColor: 'bg-emerald-600',
    textColor: 'text-emerald-900',
    badgeColor: 'bg-emerald-100 text-emerald-800'
  },
  mechanical: {
    name: 'Mechanical Design',
    icon: Settings,
    bgColor: 'bg-purple-50/70',
    borderColor: 'border-purple-200',
    activeRing: 'ring-2 ring-purple-500',
    barColor: 'bg-purple-600',
    textColor: 'text-purple-900',
    badgeColor: 'bg-purple-100 text-purple-800'
  },
  purchase: {
    name: 'Procurement',
    icon: ShoppingBag,
    bgColor: 'bg-amber-50/70',
    borderColor: 'border-amber-200',
    activeRing: 'ring-2 ring-amber-500',
    barColor: 'bg-amber-600',
    textColor: 'text-amber-900',
    badgeColor: 'bg-amber-100 text-amber-800'
  },
  production: {
    name: 'Production & QC',
    icon: Factory,
    bgColor: 'bg-rose-50/70',
    borderColor: 'border-rose-200',
    activeRing: 'ring-2 ring-rose-500',
    barColor: 'bg-rose-600',
    textColor: 'text-rose-900',
    badgeColor: 'bg-rose-100 text-rose-800'
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
