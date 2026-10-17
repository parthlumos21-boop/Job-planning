import React, { useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';
import { cleanJobNo } from '../config/marketingFormConfig';
import {
  X, Send, CheckCircle2, AlertCircle, Loader2, ArrowRightLeft
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

  const [targetDepartment, setTargetDepartment] = useState('design');
  const [selectedEngineer, setSelectedEngineer] = useState(job?.responsibleEnggName || job?.responsible_engg_name || '');
  const [notes, setNotes] = useState('Technical package ready for design.');

  const normalizeDept = (d) => {
    const s = (d || '').toLowerCase();
    if (s.includes('market')) return 'marketing';
    if (s.includes('mech')) return 'mechanical';
    if (s.includes('elect') || s.includes('design')) return 'design';
    if (s.includes('purch') || s.includes('proc')) return 'purchase';
    if (s.includes('prod') || s.includes('qc') || s.includes('disp')) return 'production';
    return s || 'design';
  };

  const targetDeptKey = normalizeDept(targetDepartment);
  const targetEngineers = Array.from(new Set([
    ...(DEPARTMENT_USER_OPTIONS[targetDeptKey] || []),
    'Keval V Shah'
  ]));

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const jobId = job.id || job.externalId || job.external_id;
      const res = await api.post(`/jobs/${jobId}/workflow/handover`, {
        targetDepartment: targetDepartment,
        responsibleEngineer: selectedEngineer,
        handoverNote: notes.trim(),
        notes: notes.trim()
      });

      setSuccess(`Job ${cleanJobNo(job.jobNo || job.job_no)} handed over to Electrical Design successfully!`);

      if (onSuccess) {
        onSuccess(res.data);
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

  const jobNoDisplay = cleanJobNo(job.jobNo || job.job_no || 'JOB');
  const panelDisplay = job.panelName || job.panel_name || 'Standard Panel';
  const customerDisplay = job.clientName || job.client_name || job.customer || 'Elite Electricals';
  const currentRespEngg = job.responsibleEnggName || job.responsible_engg_name || 'Hasmukh';
  const fromDeptDisplay = job.currentDepartment || job.current_department || 'Marketing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white">
              <ArrowRightLeft size={16} />
            </div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">
              HANDOVER TO DESIGN
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
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

          {/* Job Overview Section */}
          <div className="space-y-3 pb-3 border-b border-slate-200">
            <div>
              <div className="text-base font-black text-slate-900 tracking-tight">{jobNoDisplay}</div>
              <div className="text-xs font-semibold text-slate-600">{panelDisplay}</div>
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer</div>
              <div className="text-xs font-semibold text-slate-800 mt-0.5">{customerDisplay}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">From Department</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5 capitalize">{fromDeptDisplay}</div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Responsible Engineer</div>
                <div className="text-xs font-semibold text-slate-800 mt-0.5">{currentRespEngg}</div>
              </div>
            </div>
          </div>

          {/* Send To Section */}
          <div className="space-y-3 pt-1">
            <div className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Send To
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Department
              </label>
              <select
                value={targetDepartment}
                onChange={(e) => setTargetDepartment(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="design">Electrical Design</option>
                <option value="mechanical">Mechanical Design</option>
                <option value="purchase">Procurement</option>
                <option value="production">Production & QC & Dispatch</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Responsible Engineer
              </label>
              <select
                value={selectedEngineer}
                onChange={(e) => setSelectedEngineer(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">Select Engineer</option>
                {targetEngineers.map((eng, idx) => (
                  <option key={`eng-${idx}`} value={eng}>{eng}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Handover Note
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Technical package ready for design..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Readiness Badge */}
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-emerald-800 font-bold text-xs">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>Readiness: ✓ All required information complete</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
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
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-sm hover:shadow transition-all"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Transferring...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Handover to Design</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
