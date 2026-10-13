import { useState, useEffect } from 'react';
import api from '../services/api';
import { X, Sliders, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function JobProgressModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  const [progress, setProgress] = useState(0);
  const [completedUnits, setCompletedUnits] = useState(0);
  const [targetUnits, setTargetUnits] = useState(100);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (job) {
      setProgress(Number(job.progressPercentage) || 0);
      setCompletedUnits(job.completedWorkUnits ?? 0);
      setTargetUnits(job.targetWorkUnits ?? 100);
      setNote('');
      setError(null);
    }
  }, [job]);

  if (!isOpen || !job) return null;

  // Auto sync percentage when completed units change
  const handleCompletedUnitsChange = (val) => {
    const units = Math.max(0, parseInt(val) || 0);
    setCompletedUnits(units);
    if (targetUnits > 0) {
      const calcPct = Math.min(100, Math.round((units / targetUnits) * 100));
      setProgress(calcPct);
    }
  };

  const handlePercentageChange = (val) => {
    const pct = Math.min(100, Math.max(0, parseFloat(val) || 0));
    setProgress(pct);
    if (targetUnits > 0) {
      setCompletedUnits(Math.round((pct / 100) * targetUnits));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api.post(`/jobs/${job.id}/progress`, {
        progress_percentage: Number(progress),
        completed_work_units: Number(completedUnits),
        target_work_units: Number(targetUnits),
        note: note.trim() || undefined
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to update progress');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Sliders size={18} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Update Job Progress</h3>
              <p className="text-xs text-slate-500">
                {job.jobNo} • {job.panelName || 'General Panel'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {/* Progress Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">Completion Percentage</label>
              <span className="text-sm font-bold text-indigo-700">{progress}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={progress}
              onChange={(e) => handlePercentageChange(e.target.value)}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>0% (Not Started)</span>
              <span>50%</span>
              <span>100% (Finished)</span>
            </div>
          </div>

          {/* Physical Work Units */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Completed Units
              </label>
              <input
                type="number"
                min="0"
                value={completedUnits}
                onChange={(e) => handleCompletedUnitsChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Target Units
              </label>
              <input
                type="number"
                min="1"
                value={targetUnits}
                onChange={(e) => setTargetUnits(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Audit Note */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Progress Note / Milestone (Optional)
            </label>
            <textarea
              rows="3"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Busbars fitted, stage 2 electrical wiring completed, passed initial QA check..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shadow-sm transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>Save Progress</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
