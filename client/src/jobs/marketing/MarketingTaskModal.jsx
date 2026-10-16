import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { X, Save, AlertCircle, Clock, Calendar, CheckSquare, Briefcase, User, AlertTriangle } from 'lucide-react';

export default function MarketingTaskModal({
  isOpen,
  onClose,
  onSaved,
  task = null,
  initialJobId = null,
  currentUser
}) {
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const todayStr = new Date().toISOString().slice(0, 10);

  const [formData, setFormData] = useState({
    job_id: initialJobId || '',
    title: '',
    description: '',
    start_date: todayStr,
    target_date: todayStr,
    estimated_effort: 1.0,
    effort_unit: 'hours',
    actual_effort: 0.0,
    priority: 'Normal',
    status: 'Open',
    blocked_reason: '',
    completion_remarks: '',
    is_mandatory_for_readiness: false,
    readiness_criterion_key: 'design_input'
  });

  useEffect(() => {
    if (isOpen) {
      loadJobs();
      if (task) {
        setFormData({
          job_id: task.job_id || initialJobId || '',
          title: task.title || '',
          description: task.description || '',
          start_date: task.start_date || todayStr,
          target_date: task.target_date || todayStr,
          estimated_effort: task.estimated_effort ?? 1.0,
          effort_unit: task.effort_unit || 'hours',
          actual_effort: task.actual_effort ?? 0.0,
          priority: task.priority || 'Normal',
          status: task.status || 'Open',
          blocked_reason: task.blocked_reason || '',
          completion_remarks: task.completion_remarks || '',
          is_mandatory_for_readiness: Boolean(task.is_mandatory_for_readiness),
          readiness_criterion_key: task.readiness_criterion_key || 'design_input'
        });
      } else {
        setFormData({
          job_id: initialJobId || '',
          title: '',
          description: '',
          start_date: todayStr,
          target_date: todayStr,
          estimated_effort: 1.0,
          effort_unit: 'hours',
          actual_effort: 0.0,
          priority: 'Normal',
          status: 'Open',
          blocked_reason: '',
          completion_remarks: '',
          is_mandatory_for_readiness: false,
          readiness_criterion_key: 'design_input'
        });
      }
      setErrorMessage('');
    }
  }, [isOpen, task, initialJobId]);

  const loadJobs = async () => {
    try {
      setLoadingJobs(true);
      const res = await api.get('/jobs');
      const all = Array.isArray(res.data) ? res.data : (res.data.jobs || []);
      setJobs(all);
    } catch (err) {
      console.warn('Could not load jobs for task selector:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!formData.title.trim()) {
      setErrorMessage('Task Title is required.');
      return;
    }

    if (!formData.job_id) {
      setErrorMessage('Please select a Linked Job.');
      return;
    }

    if (formData.target_date < formData.start_date) {
      setErrorMessage('Target Date cannot be earlier than Start Date.');
      return;
    }

    if (parseFloat(formData.estimated_effort) < 0) {
      setErrorMessage('Estimated effort cannot be negative.');
      return;
    }

    try {
      setSubmitting(true);
      if (task?.id) {
        // Edit Task
        const updatePayload = {
          title: formData.title.trim(),
          description: formData.description.trim(),
          start_date: formData.start_date,
          target_date: formData.target_date,
          estimated_effort: parseFloat(formData.estimated_effort) || 0,
          effort_unit: formData.effort_unit,
          actual_effort: parseFloat(formData.actual_effort) || 0,
          priority: formData.priority,
          status: formData.status,
          blocked_reason: formData.blocked_reason,
          completion_remarks: formData.completion_remarks,
          is_mandatory_for_readiness: formData.is_mandatory_for_readiness,
          readiness_criterion_key: formData.readiness_criterion_key
        };
        await api.patch(`/marketing/tasks/${task.id}`, updatePayload);
      } else {
        // Create Task
        const createPayload = {
          job_id: parseInt(formData.job_id, 10),
          title: formData.title.trim(),
          description: formData.description.trim(),
          start_date: formData.start_date,
          target_date: formData.target_date,
          estimated_effort: parseFloat(formData.estimated_effort) || 0,
          effort_unit: formData.effort_unit,
          priority: formData.priority,
          is_mandatory_for_readiness: formData.is_mandatory_for_readiness,
          readiness_criterion_key: formData.readiness_criterion_key
        };
        await api.post('/marketing/tasks', createPayload);
      }

      onSaved();
      onClose();
    } catch (err) {
      console.error('Task save failed:', err);
      setErrorMessage(err.response?.data?.detail || 'Failed to save task.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 to-indigo-50/30">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <CheckSquare size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {task ? 'Edit Marketing Task' : 'Add New Marketing Task'}
              </h2>
              <p className="text-xs text-slate-500">
                {task ? 'Update task progress, deadlines, or logged effort.' : 'Schedule an own task and link it to an existing project.'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-white rounded-xl transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Task Title */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Task Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Confirm PO Terms & Special Inspection Clause"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden font-medium text-slate-900"
            />
          </div>

          {/* Linked Job Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Linked Job / Project <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={formData.job_id}
              disabled={Boolean(initialJobId && !task)}
              onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden font-medium text-slate-900"
            >
              <option value="">-- Select an Existing Job --</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  Job #{j.jobNo || j.id} - {j.clientName || 'Direct'} ({j.panelName || 'General Panel'})
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Task Description</label>
            <textarea
              rows={2}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide instructions, required customer deliverables, or verification steps..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-hidden font-medium text-slate-900 resize-none"
            />
          </div>

          {/* Start Date & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Start Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Target Date <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Calendar size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  required
                  value={formData.target_date}
                  onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Estimated Effort & Effort Unit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Estimated Effort <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Clock size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  required
                  value={formData.estimated_effort}
                  onChange={(e) => setFormData({ ...formData, estimated_effort: e.target.value })}
                  className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Effort Unit</label>
              <select
                value={formData.effort_unit}
                onChange={(e) => setFormData({ ...formData, effort_unit: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
              >
                <option value="hours">Hours</option>
                <option value="minutes">Minutes</option>
              </select>
            </div>
          </div>

          {/* Priority & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            {task && (
              <div>
                <label className="block font-bold text-slate-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden font-medium text-slate-900"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Blocked">Blocked</option>
                  <option value="Completed">Completed</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>

          {/* Actual Effort (shown on edit) */}
          {task && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">
                Actual Time Tracking
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Actual Effort ({formData.effort_unit})</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.actual_effort}
                    onChange={(e) => setFormData({ ...formData, actual_effort: e.target.value })}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-600 mb-1">Completion Remarks</label>
                  <input
                    type="text"
                    value={formData.completion_remarks}
                    onChange={(e) => setFormData({ ...formData, completion_remarks: e.target.value })}
                    placeholder="e.g. Verified with client"
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
              </div>
              {formData.status === 'Blocked' && (
                <div>
                  <label className="block font-semibold text-rose-700 mb-1">Blocked Reason *</label>
                  <input
                    type="text"
                    value={formData.blocked_reason}
                    onChange={(e) => setFormData({ ...formData, blocked_reason: e.target.value })}
                    placeholder="Why is this task blocked?"
                    className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-rose-900"
                  />
                </div>
              )}
            </div>
          )}

          {/* Readiness Check Integration */}
          <div className="p-3.5 bg-amber-50/50 border border-amber-200/80 rounded-2xl flex items-start gap-3">
            <input
              type="checkbox"
              id="is_mandatory_for_readiness"
              checked={formData.is_mandatory_for_readiness}
              onChange={(e) => setFormData({ ...formData, is_mandatory_for_readiness: e.target.checked })}
              className="mt-1 h-4 w-4 rounded-md border-amber-300 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="is_mandatory_for_readiness" className="cursor-pointer select-none">
              <span className="font-bold text-slate-900 block">Mandatory for Job Readiness Check</span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                When enabled, this task must be marked <b>Completed</b> before the job can be submitted for Planning/Design.
              </p>
            </label>
          </div>

          {/* Footer Submit */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
            >
              <Save size={14} />
              <span>{submitting ? 'Saving...' : task ? 'Update Task' : 'Create Task'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
