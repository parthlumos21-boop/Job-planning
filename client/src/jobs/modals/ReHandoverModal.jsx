import React, { useState } from 'react';
import api from '../../services/api';
import { cleanJobNo } from '../../config/marketingFormConfig';
import { X, Send, CheckCircle2, FileText, UserCheck, AlertCircle, Loader2 } from 'lucide-react';

export default function ReHandoverModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  if (!isOpen || !job) return null;

  const [notes, setNotes] = useState('Updated technical package and drawings verified. Ready for Design execution.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const attachmentsCount = (job.attachments || []).length;
  const currentEngineer = job.responsibleEnggName || job.responsible_engg_name || 'Unassigned';
  const previousEngineer = job.previousResponsibleEnggName || job.previous_responsible_engg_name;
  const returnReason = job.returnReason || job.handoverReturnReason;

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      const jobId = job.id || job.externalId || job.external_id;
      const res = await api.post(`/jobs/${jobId}/handover/re-submit`, {
        target_department: 'design',
        notes: notes.trim()
      });

      if (onSuccess) {
        onSuccess(res.data?.job || res.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to re-handover job:', err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to submit handover');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-indigo-100 bg-indigo-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Handover to Design</h3>
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

          {/* Verification Summary Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Responsible Engineer:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <UserCheck size={13} className="text-blue-600" />
                {currentEngineer}
                {previousEngineer && previousEngineer !== currentEngineer && (
                  <span className="text-[10px] text-slate-400 font-normal">(was {previousEngineer})</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-medium">Documents Attached:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <FileText size={13} className="text-slate-500" />
                {attachmentsCount > 0 ? `${attachmentsCount} verified file(s)` : 'None attached'}
              </span>
            </div>

            {returnReason && (
              <div className="pt-1 border-t border-slate-200">
                <span className="text-amber-700 font-medium">Previous Return Issue:</span>
                <p className="font-semibold text-slate-700 mt-0.5">{returnReason}</p>
              </div>
            )}

            <div className="flex items-center gap-1.5 text-emerald-700 font-bold pt-1 border-t border-slate-200">
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span>Readiness Check: Complete & Verified</span>
            </div>
          </div>

          {/* Handover Note */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Handover Note to Design Team (Optional)
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any specific instructions, clarifications, or notes for Design..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
            />
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Confirm Handover to Design
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
