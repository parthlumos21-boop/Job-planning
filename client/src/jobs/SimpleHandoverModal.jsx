import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';
import { cleanJobNo } from '../config/marketingFormConfig';
import {
  X, Send, CheckCircle2, AlertCircle, Loader2, ArrowRightLeft, ShieldCheck, UserCheck
} from 'lucide-react';

export default function SimpleHandoverModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedEngineer, setSelectedEngineer] = useState('');
  const [notes, setNotes] = useState('');
  const [verified, setVerified] = useState(true);

  if (!isOpen || !job) return null;

  const designEngineers = Array.from(new Set([
    ...(DEPARTMENT_USER_OPTIONS.design || []),
    ...(DEPARTMENT_USER_OPTIONS['design-electrical'] || []),
    ...(DEPARTMENT_USER_OPTIONS['design-mechanical'] || [])
  ]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!verified) {
      setError('Please verify technical data completeness before handing over.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const res = await api.post(`/jobs/${job.id}/handover/submit`, {
        targetDepartment: 'design',
        fromDepartment: 'marketing',
        toWorkerId: selectedEngineer ? Number(selectedEngineer) : null,
        notes: notes.trim(),
        checklist: {
          marketingDataVerified: true,
          submittedBy: user?.name || user?.username || 'Marketing',
          submittedAt: new Date().toISOString()
        }
      });

      const submitterName = user?.name || user?.username || 'Marketing Team';
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSuccess(`Job ${cleanJobNo(job.jobNo)} handed over to Design by ${submitterName} at ${nowStr}!`);

      if (onSuccess) {
        onSuccess(res.data?.job || {
          ...job,
          handoverStatus: 'Submitted to Design',
          targetDepartment: 'design',
          handoverSubmittedAt: new Date().toISOString(),
          handoverSubmittedBy: submitterName
        });
      }

      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1200);
    } catch (err) {
      console.error('Handover failed:', err);
      setError(err.response?.data?.detail || 'Failed to submit handover. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-blue-50 border-b border-indigo-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
              <ArrowRightLeft size={18} />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 tracking-tight">Handover to Design</h3>
              <p className="text-xs text-slate-500 font-medium">
                Job {cleanJobNo(job.jobNo)} • {job.clientName || 'General Client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* Job Summary Banner */}
          <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
            <div className="flex justify-between text-slate-600">
              <span className="font-semibold">Panel:</span>
              <span className="font-bold text-slate-900">{job.panelName || 'Standard Panel'} (Qty: {job.qty || 1})</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-semibold">Project:</span>
              <span className="font-medium text-slate-800">{job.projectName || '—'}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span className="font-semibold">Current Submitter:</span>
              <span className="font-bold text-indigo-700">{user?.name || user?.username || 'Marketing Team'}</span>
            </div>
          </div>

          {/* Target Design Engineer (Optional) */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Assign to Design Engineer (Optional)
            </label>
            <select
              value={selectedEngineer}
              onChange={(e) => setSelectedEngineer(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
            >
              <option value="">-- Design Department Queue (All Design Leads) --</option>
              {designEngineers.map((eng, idx) => {
                const name = typeof eng === 'string' ? eng : eng?.name || 'Engineer';
                return (
                  <option key={`design-eng-${name}-${idx}`} value={name}>
                    {name} (Design)
                  </option>
                );
              })}
            </select>
          </div>

          {/* Handover Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              Handover Remarks / Priority Note
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Customer PO verified. Urgent drawing approval requested."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
            />
          </div>

          {/* Readiness Confirmation */}
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-50/60 border border-indigo-100 cursor-pointer">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs text-indigo-950 font-medium">
              I confirm that project specs, PO details, and drawing data have been entered and are ready for Design.
            </span>
          </label>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !verified}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-sm hover:shadow transition-all"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Transferring...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Confirm Handover to Design →</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
