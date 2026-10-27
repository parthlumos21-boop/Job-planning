import React from 'react';
import { Plus, Clock, AlertTriangle, CheckCircle2, Calendar } from 'lucide-react';

const DEPT_NAMES = {
  marketing: 'Marketing',
  design: 'Electrical Design',
  mechanical: 'Mechanical Design',
  purchase: 'Procurement / Purchase',
  production: 'Production',
  qc: 'Quality Control (QC)',
  dispatch: 'Dispatch'
};

export default function DepartmentMilestoneTable({
  schedules = [],
  onOpenDelayModal,
  onOpenExtensionModal,
  isAdmin
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Section Header Bar */}
      <div className="px-5 py-3 bg-gradient-to-r from-slate-50 via-white to-slate-50/60 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Department Milestone Breakdown
          </h3>
        </div>

        {schedules.length > 0 && (
          <button
            onClick={() => onOpenDelayModal(schedules[0])}
            className="h-[28px] px-3 rounded-lg bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 text-xs font-semibold flex items-center gap-1 shadow-2xs cursor-pointer transition-colors"
          >
            <Plus size={12} />
            <span>+ Add Delay Event</span>
          </button>
        )}
      </div>

      {/* Dense Structured Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-3 border-r border-slate-200">Department Stage</th>
              <th className="py-2.5 px-3 border-r border-slate-200">Planned Start</th>
              <th className="py-2.5 px-3 border-r border-slate-200">Original Target</th>
              <th className="py-2.5 px-3 border-r border-slate-200">Approved Target</th>
              <th className="py-2.5 px-3 border-r border-slate-200">Actual Completion</th>
              <th className="py-2.5 px-3 border-r border-slate-200 text-center">Delay Status</th>
              <th className="py-2.5 px-3 border-r border-slate-200 text-center">Accountable</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {schedules.length === 0 ? (
              <tr>
                <td colSpan="8" className="py-8 text-center text-slate-400">
                  No department schedules initialized for this job.
                </td>
              </tr>
            ) : (
              schedules.map((s) => {
                const deptTitle = DEPT_NAMES[s.department] || s.department;
                const isCompleted = s.status === 'Completed' || Boolean(s.actual_completion_date);
                const rawDelay = s.raw_delay_days || 0;
                const accountableDelay = s.accountable_delay_days || 0;
                const approvedExt = s.approved_extension_days || 0;

                return (
                  <tr key={s.id || s.department} className="hover:bg-slate-50/80 transition-colors">
                    {/* 1. Department Stage */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-bold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span className="capitalize">{deptTitle}</span>
                        {isCompleted && <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />}
                      </div>
                    </td>

                    {/* 2. Planned Start Date */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-600 text-[11px]">
                      {s.planned_start_date || '—'}
                    </td>

                    {/* 3. Original Target Date */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-800 font-semibold text-[11px]">
                      {s.original_target_date || '—'}
                    </td>

                    {/* 4. Approved Target Date */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-[11px]">
                      <span className={approvedExt > 0 ? 'text-blue-700 font-bold' : 'text-slate-800'}>
                        {s.approved_target_date || s.original_target_date || '—'}
                      </span>
                      {approvedExt > 0 && (
                        <span className="ml-1 text-[10px] text-blue-600 font-semibold">
                          (+{approvedExt}d)
                        </span>
                      )}
                    </td>

                    {/* 5. Actual Completion */}
                    <td className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-600 text-[11px]">
                      {s.actual_completion_date ? (
                        <span className="text-emerald-700 font-semibold">{s.actual_completion_date}</span>
                      ) : (
                        <span className="text-slate-400 italic">In Progress</span>
                      )}
                    </td>

                    {/* 6. Delay Status */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center">
                      {rawDelay > 0 ? (
                        <span className="inline-block px-1.5 py-0.5 rounded-[2px] bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                          +{rawDelay}d Delay
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded-[2px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[10px]">
                          On Track
                        </span>
                      )}
                    </td>

                    {/* 7. Accountable Days */}
                    <td className="py-2.5 px-3 border-r border-slate-200 text-center font-bold">
                      {accountableDelay > 0 ? (
                        <span className="text-rose-700 font-bold text-xs">{accountableDelay} Days</span>
                      ) : (
                        <span className="text-slate-400 font-normal">0</span>
                      )}
                    </td>

                    {/* 8. Action Buttons */}
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onOpenDelayModal(s)}
                          className="h-[26px] px-2 rounded-[2px] bg-white hover:bg-slate-50 text-rose-700 border border-slate-300 text-[11px] font-semibold cursor-pointer shadow-2xs transition-colors"
                          title="Record Department Delay Event"
                        >
                          Delay
                        </button>
                        <button
                          onClick={() => onOpenExtensionModal(s)}
                          className="h-[26px] px-2 rounded-[2px] bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 text-[11px] font-semibold cursor-pointer shadow-2xs transition-colors"
                          title="Request Target Date Extension"
                        >
                          Extend
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
