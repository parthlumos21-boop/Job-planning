import React from 'react';
import { Eye, Edit3, Calendar, User, Building, Zap, Layers, CheckCircle2, Clock, ArrowRightLeft } from 'lucide-react';

const DEPT_SHORT_NAMES = [
  { key: 'marketing', label: 'MKT', name: 'Marketing' },
  { key: 'design', label: 'DES', name: 'Design' },
  { key: 'mechanical', label: 'MECH', name: 'Mechanical' },
  { key: 'purchase', label: 'PUR', name: 'Procurement' },
  { key: 'production', label: 'PRD', name: 'Production' },
  { key: 'dispatch', label: 'DIS', name: 'Dispatch' },
];

export default function JobCard({ job, onView, onEdit, onHandover }) {
  if (!job) return null;

  const deptStatus = job.departmentStatus || {};
  const isAllCompleted = DEPT_SHORT_NAMES.every(d => deptStatus[d.key] === 'completed');

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-blue-400/80 transition-all duration-200 flex flex-col justify-between overflow-hidden group">
      {/* Top Header */}
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
              #{job.jobNo || job.id}
            </span>
            {job.srNo && (
              <span className="text-[11px] font-medium text-slate-400">
                SR: {job.srNo}
              </span>
            )}
          </div>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 max-w-[150px] truncate" title={job.clientName}>
            <Building size={12} className="mr-1 text-slate-400 shrink-0" />
            <span className="truncate">{job.clientName || 'General Client'}</span>
          </span>
        </div>

        {/* Panel Name & Project */}
        <h3 className="text-base font-bold text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors" title={job.panelName}>
          {job.panelName || 'Unnamed Panel'}
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-0.5 line-clamp-1" title={job.projectName}>
          {job.projectName ? `Project: ${job.projectName}` : 'Standard Project'}
        </p>

        {/* Specs Metadata Chips */}
        <div className="grid grid-cols-2 gap-2 mt-4 text-xs text-slate-600">
          <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <Layers size={13} className="text-slate-400 shrink-0" />
            <span className="truncate">Qty: <strong className="text-slate-800">{job.qty || '1'}</strong></span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <Zap size={13} className="text-amber-500 shrink-0" />
            <span className="truncate" title={job.incomerRating || 'Standard'}>
              {job.incomerRating || 'Rating: N/A'}
            </span>
          </div>

          {job.deliveryDate && (
            <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100 col-span-2">
              <Calendar size={13} className="text-blue-500 shrink-0" />
              <span className="truncate">Due: <strong className="text-slate-700">{job.deliveryDate}</strong></span>
            </div>
          )}
        </div>

        {/* Responsible Engineer */}
        {job.responsibleEnggName && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-600">
            <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px]">
              {job.responsibleEnggName.charAt(0).toUpperCase()}
            </div>
            <span className="text-slate-700 font-medium truncate">{job.responsibleEnggName}</span>
          </div>
        )}
      </div>

      {/* Workflow Stepper Bar */}
      <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Workflow Status
          </span>
          {isAllCompleted ? (
            <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={12} /> Dispatched
            </span>
          ) : (
            <span className="text-[11px] font-medium text-amber-600 flex items-center gap-1">
              <Clock size={12} /> In Progress
            </span>
          )}
        </div>

        {/* 6 Department Pills */}
        <div className="flex items-center justify-between gap-1 pt-1">
          {DEPT_SHORT_NAMES.map(d => {
            const isDone = deptStatus[d.key] === 'completed';
            return (
              <div
                key={d.key}
                className="flex-1 flex flex-col items-center group/dot"
                title={`${d.name}: ${isDone ? 'Completed' : 'Pending'}`}
              >
                <div
                  className={`w-full h-1.5 rounded-full transition-colors ${
                    isDone ? 'bg-emerald-500' : 'bg-slate-200'
                  }`}
                />
                <span className={`text-[9px] mt-1 font-semibold ${isDone ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {d.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Card Action Buttons */}
      <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2">
        <button
          onClick={() => onView && onView(job.id)}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
        >
          <Eye size={13} />
          Details
        </button>
        {onHandover && (
          <button
            onClick={() => onHandover(job)}
            className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/70 transition-colors"
          >
            <ArrowRightLeft size={13} />
            Handover
          </button>
        )}
        <button
          onClick={() => onEdit && onEdit(job.id)}
          className="inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/70 transition-colors"
        >
          <Edit3 size={13} />
          Edit
        </button>
      </div>
    </div>
  );
}
