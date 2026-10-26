import React from 'react';
import { RefreshCw, ExternalLink, Printer, X } from 'lucide-react';

export default function JobTimelineHeader({ jobNo, jobId, onRefresh, refreshing, onClose }) {
  const handlePrint = () => {
    window.print();
  };

  const handleViewJob = () => {
    if (jobId) {
      window.open(`/jobs/${jobId}`, '_blank');
    }
  };

  return (
    <div className="pb-2.5 border-b border-slate-300 space-y-1.5">
      {/* Breadcrumb & Top Close Button Row */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
          <span>Job Planning</span>
          <span className="text-slate-400">&gt;</span>
          <span className="text-blue-800 font-bold">Timeline &amp; Delay Accountability</span>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="sm:hidden h-[26px] w-[26px] flex items-center justify-center rounded-[3px] bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-300 shadow-2xs cursor-pointer transition-colors shrink-0"
            title="Close"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Job No & Action Toolbar on the same row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-slate-800 tracking-tight">
            Job No: {String(jobNo || '—').replace(/^#/, '')} - Department Timeline &amp; Delay Accountability
          </h2>
        </div>

        {/* Action Toolbar on Job No row right side */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="h-[28px] w-[28px] flex items-center justify-center rounded-[3px] bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-2xs cursor-pointer disabled:opacity-50 transition-colors"
            title="Refresh Calculation"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-blue-600' : 'text-slate-600'} />
          </button>

          <button
            onClick={handleViewJob}
            className="h-[28px] px-2.5 rounded-[3px] bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
            title="Open Full Job Record"
          >
            <ExternalLink size={12} className="text-slate-500" />
            <span>View Job</span>
          </button>

          <button
            onClick={handlePrint}
            className="h-[28px] px-2.5 rounded-[3px] bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-300 shadow-2xs flex items-center gap-1 cursor-pointer transition-colors"
            title="Print Timeline Document"
          >
            <Printer size={12} className="text-slate-500" />
            <span>Print</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="h-[28px] w-[28px] flex items-center justify-center rounded-[3px] bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-300 shadow-2xs cursor-pointer transition-colors shrink-0 ml-0.5"
              title="Close Timeline View"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
