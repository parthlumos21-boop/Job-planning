import React, { useState } from 'react';
import { Check, X, ShieldCheck } from 'lucide-react';

export default function TimelineAuditTabs({
  delayEvents = [],
  scheduleRevisions = [],
  pendingExtensions = [],
  isAdmin,
  onApproveExtension,
  onRejectExtension,
  reviewingId
}) {
  const [activeTab, setActiveTab] = useState('delays'); // 'delays' | 'revisions' | 'approvals'

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Tabs Bar */}
      <div className="bg-gradient-to-r from-slate-50 via-white to-slate-50/60 border-b border-slate-200/80 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveTab('delays')}
            className={`px-3 py-1.5 rounded-lg font-semibold text-xs border transition-colors cursor-pointer ${
              activeTab === 'delays'
                ? 'bg-white text-blue-700 border-slate-300 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            Recorded Delay Events ({delayEvents.length})
          </button>

          <button
            onClick={() => setActiveTab('revisions')}
            className={`px-3 py-1.5 rounded-[3px] font-semibold text-xs border transition-colors cursor-pointer ${
              activeTab === 'revisions'
                ? 'bg-white text-blue-700 border-slate-300 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-slate-200/60'
            }`}
          >
            Deadline Revisions Audit ({scheduleRevisions.length})
          </button>

          {isAdmin && pendingExtensions.length > 0 && (
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-3 py-1.5 rounded-[3px] font-semibold text-xs border transition-colors cursor-pointer flex items-center gap-1 ${
                activeTab === 'approvals'
                  ? 'bg-white text-amber-700 border-slate-300 font-bold shadow-2xs'
                  : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
              }`}
            >
              <span>Pending Extension Approvals</span>
              <span className="px-1.5 py-0.2 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold">
                {pendingExtensions.length}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Delay Events */}
      {activeTab === 'delays' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3 border-r border-slate-200">Department</th>
                <th className="py-2 px-3 border-r border-slate-200">Reason Category</th>
                <th className="py-2 px-3 border-r border-slate-200 text-center">Days</th>
                <th className="py-2 px-3 border-r border-slate-200">Responsible</th>
                <th className="py-2 px-3 border-r border-slate-200">Remarks</th>
                <th className="py-2 px-3 text-right">Logged At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {delayEvents.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-6 text-center text-slate-400">
                    No delay events recorded for this job.
                  </td>
                </tr>
              ) : (
                delayEvents.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 border-r border-slate-200 font-bold capitalize text-slate-800">
                      {ev.department}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-slate-700">
                      <span className="font-semibold text-slate-900">
                        {ev.reason_name || ev.reason_code || 'General Delay'}
                      </span>
                      {ev.category && (
                        <span className="ml-1 text-[10px] px-1 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-600 uppercase">
                          {ev.category}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-center font-bold text-rose-700">
                      +{ev.delay_days}d
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-slate-600">
                      {ev.responsible_person || '—'}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-slate-600 max-w-xs truncate" title={ev.remarks}>
                      {ev.remarks || '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400 text-[11px] font-mono">
                      {ev.logged_at ? ev.logged_at.slice(0, 16).replace('T', ' ') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Revisions Audit Trail */}
      {activeTab === 'revisions' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 px-3 border-r border-slate-200">Department</th>
                <th className="py-2 px-3 border-r border-slate-200">Previous Target</th>
                <th className="py-2 px-3 border-r border-slate-200">Revised Target</th>
                <th className="py-2 px-3 border-r border-slate-200 text-center">+Days</th>
                <th className="py-2 px-3 border-r border-slate-200">Reason Category</th>
                <th className="py-2 px-3 border-r border-slate-200">Approved By</th>
                <th className="py-2 px-3 text-right">Revised At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {scheduleRevisions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-6 text-center text-slate-400">
                    No deadline revisions approved for this job.
                  </td>
                </tr>
              ) : (
                scheduleRevisions.map((rev) => (
                  <tr key={rev.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 border-r border-slate-200 font-bold capitalize text-slate-800">
                      {rev.department}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-mono text-slate-500 text-[11px]">
                      {rev.previous_target_date}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 font-mono text-blue-700 font-bold text-[11px]">
                      {rev.revised_target_date}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-center font-bold text-blue-700">
                      +{rev.extension_days}d
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-slate-700">
                      {rev.reason_category || 'Administrative Extension'}
                    </td>
                    <td className="py-2 px-3 border-r border-slate-200 text-slate-700 font-semibold">
                      {rev.approved_by || 'Administration'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400 text-[11px] font-mono">
                      {rev.created_at ? rev.created_at.slice(0, 16).replace('T', ' ') : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Admin Approvals */}
      {activeTab === 'approvals' && (
        <div className="p-3 space-y-2">
          {pendingExtensions.map((req) => (
            <div key={req.id} className="p-3 rounded-[3px] border border-amber-300 bg-amber-50/50 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-amber-950 capitalize">{req.department}</span>
                  <span className="text-slate-500">•</span>
                  <span className="font-semibold text-slate-700">Requested: {req.requested_date}</span>
                  <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold text-[10px] rounded">
                    +{req.extension_days} Days Extension
                  </span>
                </div>
                <p className="text-slate-600 mt-1">
                  <strong className="text-slate-800">{req.reason_category}:</strong> {req.reason_text}
                </p>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Requested by: {req.requested_by_name || 'Department Engineer'} on {req.requested_at?.slice(0, 10)}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onApproveExtension(req.id)}
                  disabled={reviewingId === req.id}
                  className="h-[28px] px-3 rounded-[3px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-2xs cursor-pointer border border-emerald-700 disabled:opacity-50"
                >
                  <Check size={12} />
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => onRejectExtension(req.id)}
                  disabled={reviewingId === req.id}
                  className="h-[28px] px-2.5 rounded-[3px] bg-white hover:bg-rose-50 text-rose-700 font-semibold text-xs flex items-center gap-1 shadow-2xs border border-slate-300 cursor-pointer disabled:opacity-50"
                >
                  <X size={12} />
                  <span>Reject</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
