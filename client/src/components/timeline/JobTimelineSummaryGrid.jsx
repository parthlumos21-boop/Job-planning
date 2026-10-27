import React from 'react';

export default function JobTimelineSummaryGrid({ timeline, schedules = [] }) {
  const stagesCount = schedules.length || 7;
  
  // Find dispatch schedule or last stage for final delivery date
  const dispatchSched = schedules.find(s => s.department === 'dispatch') || schedules[schedules.length - 1];
  const deliveryDate = dispatchSched?.approved_target_date || dispatchSched?.original_target_date || timeline?.final_delivery_date || '—';

  // Total approved extensions
  const totalExtensions = schedules.reduce((acc, s) => acc + (s.approved_extension_days || 0), 0);

  // Total accountable delay days
  const totalAccountableDelay = schedules.reduce((acc, s) => acc + (s.accountable_delay_days || 0), 0);
  const isOverdue = totalAccountableDelay > 0;

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Section Title Bar */}
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 via-white to-slate-50/60 border-b border-slate-200/80 text-xs font-bold text-slate-800 uppercase tracking-wider">
        Job Summary
      </div>

      {/* Structured Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
        <div className="p-3">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Stages Tracked</span>
          <div className="text-sm font-bold text-slate-900 mt-0.5">{stagesCount} Stages</div>
          <span className="text-[10px] text-slate-400">Marketing through Dispatch</span>
        </div>

        <div className="p-3">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Customer Delivery Target</span>
          <div className="text-sm font-bold text-slate-900 mt-0.5">{deliveryDate}</div>
          <span className="text-[10px] text-slate-400">Calculated Final Dispatch Target</span>
        </div>

        <div className="p-3">
          <span className="text-[11px] font-semibold text-slate-500 uppercase block">Approved Extensions</span>
          <div className="text-sm font-bold text-slate-900 mt-0.5">+{totalExtensions} Working Days</div>
          <span className="text-[10px] text-slate-400">Authorized by Administration</span>
        </div>
      </div>

      {/* Accountable Delay Summary Bar */}
      <div className={`px-3.5 py-2 border-t border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2 ${
        isOverdue ? 'bg-rose-50/70 text-rose-900' : 'bg-slate-50 text-slate-700'
      }`}>
        <div className="flex items-center gap-2">
          <span className="font-bold">Accountable Delay:</span>
          {isOverdue ? (
            <span className="font-bold text-rose-700 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-rose-600 animate-pulse" />
              {totalAccountableDelay} Working Day{totalAccountableDelay > 1 ? 's' : ''} Overdue
            </span>
          ) : (
            <span className="font-semibold text-emerald-700 inline-flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              0 Days (On Track)
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
