import React, { useState } from 'react';
import api from '../../services/api';
import { cleanJobNo } from '../../config/marketingFormConfig';
import { X, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';

const RETURN_REASONS = [
  'Missing Customer Drawing',
  'Missing Technical Specification',
  'Incorrect Job Information',
  'Responsible Engineer Clarification',
  'Date Clarification',
  'Other'
];

export default function ReturnJobModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  if (!isOpen || !job) return null;

  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!comment || comment.trim().length < 3) {
      setError('Please provide an explanation comment for the return (at least 3 characters)');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const jobId = job.id || job.externalId || job.external_id;
      const res = await api.post(`/jobs/${jobId}/handover/return`, {
        reason: reason,
        comment: comment.trim()
      });

      if (onSuccess) {
        onSuccess(res.data?.job || res.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to return job:', err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to return job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-rose-100 bg-rose-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Return Job to Marketing</h3>
              <p className="text-xs text-slate-500">Job {cleanJobNo(job.jobNo || job.job_no)} • {job.panelName || ''}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Return Reason Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Select Return Reason <span className="text-rose-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all"
              required
            >
              {RETURN_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Explanation Comment */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Explanation & Required Corrections <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Specify exactly what Marketing must correct or provide (e.g. Please upload the revised customer GA drawing and confirm busbar rating)..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all resize-none"
              required
            />
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
            <strong>Target:</strong> This job will be flagged as <strong>Returned to Marketing</strong> on the Marketing dashboard with your reason and explanation visible to the team.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Confirm Return to Marketing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
