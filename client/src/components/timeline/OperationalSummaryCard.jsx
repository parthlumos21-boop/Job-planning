import React, { useMemo } from 'react';
import { Activity, Clock, CheckCircle2, Pause, AlertTriangle, Users } from 'lucide-react';

export default function OperationalSummaryCard({ jobs = [] }) {
  const summary = useMemo(() => {
    const total = jobs.length || 0;
    let inProgress = 0;
    let paused = 0;
    let draft = 0;
    let completed = 0;
    let overdue = 0;
    let activeWorkers = 0;

    jobs.forEach((j) => {
      const rawStatus = (j.status || 'Draft').toLowerCase();
      if (rawStatus === 'running' || rawStatus === 'in progress') {
        inProgress += 1;
        if (j.currentWorkerName) activeWorkers += 1;
      } else if (rawStatus === 'paused' || rawStatus === 'on hold') {
        paused += 1;
      } else if (rawStatus === 'completed') {
        completed += 1;
      } else {
        draft += 1;
      }

      if (j.isOverdue) overdue += 1;
    });

    const calcPct = (count) => (total > 0 ? Math.round((count / total) * 100) : 0);

    return {
      total,
      inProgress,
      inProgressPct: calcPct(inProgress),
      paused,
      pausedPct: calcPct(paused),
      draft,
      draftPct: calcPct(draft),
      completed,
      completedPct: calcPct(completed),
      overdue,
      activeWorkers
    };
  }, [jobs]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex flex-col justify-between h-full min-h-[380px]">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800 tracking-tight">
              Operational Summary
            </h3>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 border border-slate-200/80 px-2 py-0.5 rounded-full">
            {summary.total} {summary.total === 1 ? 'Job' : 'Jobs'}
          </span>
        </div>

        {/* Progress Item: In Progress (Exact Match to Image 1) */}
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                In Progress
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-normal">({summary.inProgress})</span>
                <span className="font-bold text-slate-900">{summary.inProgressPct}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary.inProgressPct}%` }}
              />
            </div>
          </div>

          {/* Progress Item: Scheduled / Draft */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                Scheduled / Draft
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-normal">({summary.draft})</span>
                <span className="font-bold text-slate-900">{summary.draftPct}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary.draftPct}%` }}
              />
            </div>
          </div>

          {/* Progress Item: On Hold / Paused */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                On Hold / Paused
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-normal">({summary.paused})</span>
                <span className="font-bold text-slate-900">{summary.pausedPct}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary.pausedPct}%` }}
              />
            </div>
          </div>

          {/* Progress Item: Completed */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="flex items-center gap-2 text-slate-700">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                Completed
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-normal">({summary.completed})</span>
                <span className="font-bold text-slate-900">{summary.completedPct}%</span>
              </div>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-blue-600 h-full rounded-full transition-all duration-500"
                style={{ width: `${summary.completedPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Highlights Footer */}
      <div className="pt-4 mt-4 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
        <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
            <Users size={14} />
          </div>
          <div>
            <div className="font-bold text-slate-900">{summary.activeWorkers}</div>
            <div className="text-[10px] text-slate-500">Active Workers</div>
          </div>
        </div>

        <div className="p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${summary.overdue > 0 ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-600'}`}>
            <AlertTriangle size={14} />
          </div>
          <div>
            <div className="font-bold text-slate-900">{summary.overdue}</div>
            <div className="text-[10px] text-slate-500">Overdue Jobs</div>
          </div>
        </div>
      </div>
    </div>
  );
}
