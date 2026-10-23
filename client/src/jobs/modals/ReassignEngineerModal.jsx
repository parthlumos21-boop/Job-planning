import React, { useState } from 'react';
import api from '../../services/api';
import { cleanJobNo } from '../../config/marketingFormConfig';
import { DEPARTMENT_USER_OPTIONS } from '../departmentUserOptions';
import { X, UserCheck, AlertCircle, Loader2 } from 'lucide-react';

export default function ReassignEngineerModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  if (!isOpen || !job) return null;

  const currentEngineer = job.responsibleEnggName || job.responsible_engg_name || job.responsibleEngineer || 'Unassigned';
  const rawDept = String(job.currentDepartment || job.current_department || 'marketing').toLowerCase();
  const deptKey = rawDept.includes('design') ? 'design' : rawDept.includes('mech') ? 'mechanical' : rawDept.includes('purch') || rawDept.includes('proc') ? 'purchase' : rawDept.includes('prod') || rawDept.includes('qc') ? 'production' : 'marketing';
  const deptList = DEPARTMENT_USER_OPTIONS[deptKey] || DEPARTMENT_USER_OPTIONS.marketing || [];
  const availableEngineers = deptList.filter(
    (name) => name.toLowerCase() !== currentEngineer.toLowerCase()
  );

  const [selectedEngineer, setSelectedEngineer] = useState(availableEngineers[0] || '');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedEngineer) {
      setError('Please select a new Responsible Engineer');
      return;
    }
    if (!reason || reason.trim().length < 3) {
      setError('Please enter a mandatory reason for reassignment (at least 3 characters)');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const jobId = job.id || job.externalId || job.external_id;
      const res = await api.post(`/jobs/${jobId}/reassign-engineer`, {
        new_engineer_name: selectedEngineer,
        reason: reason.trim()
      });

      if (onSuccess) {
        onSuccess(res.data?.job || res.data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to reassign engineer:', err);
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to reassign engineer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <UserCheck size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reassign Responsible Engineer</h3>
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

          {/* Current Engineer Label */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Current Responsible Engineer
            </label>
            <div className="px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800">
              {currentEngineer}
            </div>
          </div>

          {/* New Engineer Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              New Responsible Engineer <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedEngineer}
              onChange={(e) => setSelectedEngineer(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              required
            >
              {availableEngineers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          {/* Reason (Mandatory) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Reason for Reassignment <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Engineer changed for this project / Project scope reassignment"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
              required
            />
          </div>

          <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
            <strong>Note:</strong> Reassignment is permanently tracked. The previous engineer ({currentEngineer}) will remain in history and timeline records.
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-sm transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading && <Loader2 size={13} className="animate-spin" />}
              Reassign Engineer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
