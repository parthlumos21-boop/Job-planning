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
      className={`text-left w-full rounded-2xl border p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
        theme.bgColor
      } ${theme.borderColor} ${isSelected ? theme.activeRing : 'hover:scale-[1.01]'}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl bg-white shadow-xs ${theme.textColor}`}>
            <Icon size={18} />
          </div>
          <div>
            <h4 className={`text-sm font-bold ${theme.textColor}`}>{theme.name}</h4>
            <p className="text-xs text-slate-500">{total} Total Jobs</p>
          </div>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${theme.badgeColor}`}>
          {percent}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-white/80 rounded-full h-2 overflow-hidden border border-slate-200/50 mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${theme.barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Numbers Breakdown */}
      <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 font-medium">
        <span>Done: <strong className="text-emerald-700">{completed}</strong></span>
        <span>Pending: <strong className="text-amber-700">{total - completed}</strong></span>
      </div>
    </button>
  );
}
