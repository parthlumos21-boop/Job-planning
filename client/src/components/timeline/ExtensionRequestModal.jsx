import React, { useState } from 'react';
import { X, Calendar } from 'lucide-react';

const REASON_CATEGORIES = [
  'Customer Drawing Delay',
  'Component Procurement Delay',
  'Design Engineering Revision',
  'Fabrication Machine Breakdown',
  'QC / Testing Failure',
  'Site Delivery Readiness',
  'Force Majeure / Power Outage'
];

export default function ExtensionRequestModal({
  activeExtensionModal,
  onClose,
  onSubmit,
  submitting
}) {
  const [requestedDate, setRequestedDate] = useState('');
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reasonText, setReasonText] = useState('');

  if (!activeExtensionModal) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!requestedDate || !reasonText) return;
    onSubmit({
      scheduleId: activeExtensionModal.id,
      requestedDate,
      reasonCategory,
      reasonText
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
      <div className="bg-white rounded-[4px] border border-slate-300 w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Gray Title Bar */}
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-blue-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Request Deadline Extension — {activeExtensionModal.department?.toUpperCase()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              New Requested Completion Date *
            </label>
            <input
              type="date"
              required
              value={requestedDate}
              onChange={(e) => setRequestedDate(e.target.value)}
              className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
            />
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Current Target: {activeExtensionModal.approved_target_date || activeExtensionModal.original_target_date}
            </span>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Primary Reason Category *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
            >
              {REASON_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Justification &amp; Technical Explanation *
            </label>
            <textarea
              required
              rows={3}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="Explain why this extension is required and how it affects downstream departments..."
              className="w-full p-2.5 rounded-[3px] border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-3.5 rounded-[3px] bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-[30px] px-4 rounded-[3px] bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs border border-blue-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <span>{submitting ? 'Submitting...' : 'Submit Extension Request'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
