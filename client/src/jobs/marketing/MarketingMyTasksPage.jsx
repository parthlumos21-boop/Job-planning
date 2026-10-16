import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import {
  CheckSquare, PlusCircle, RefreshCw, Search, Filter, Clock, AlertTriangle,
  Calendar, CheckCircle2, Play, AlertCircle, Edit3, Trash2, ShieldAlert,
  ArrowRight, UserCheck, Briefcase, Eye, ChevronRight
} from 'lucide-react';
import MarketingTaskModal from './MarketingTaskModal';
import { isMarketingLead, cleanJobNo } from '../../config/marketingFormConfig';

export default function MarketingMyTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState('my'); // 'my' or 'all'
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [onlyDueToday, setOnlyDueToday] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Quick Action Modals
  const [blockingTask, setBlockingTask] = useState(null);
  const [blockReasonInput, setBlockReasonInput] = useState('');
  const [completingTask, setCompletingTask] = useState(null);
  const [actualEffortInput, setActualEffortInput] = useState('');
  const [completionRemarksInput, setCompletionRemarksInput] = useState('');

  const isLead = isMarketingLead(user) || user?.role === 'admin' || user?.role === 'executive';

  const fetchTasks = async () => {
    try {
      setRefreshing(true);
      const queryParams = new URLSearchParams();
      queryParams.set('scope', scope);
      if (statusFilter !== 'all') queryParams.set('status', statusFilter);
      if (priorityFilter !== 'all') queryParams.set('priority', priorityFilter);
      if (onlyOverdue) queryParams.set('overdue', 'true');
      if (onlyDueToday) queryParams.set('due_today', 'true');
      if (search) queryParams.set('search', search);

      const res = await api.get(`/marketing/tasks?${queryParams.toString()}`);
      setTasks(res.data?.tasks || []);
    } catch (err) {
      console.error('Failed to load marketing tasks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [scope, statusFilter, priorityFilter, onlyOverdue, onlyDueToday]);

  const summary = useMemo(() => {
    let openCount = 0;
    let dueTodayCount = 0;
    let overdueCount = 0;
    let totalEst = 0.0;
    let totalAct = 0.0;
    let blockedReadinessCount = 0;

    tasks.forEach((t) => {
      const isClosed = ['completed', 'cancelled'].includes(t.status?.toLowerCase());
      const estHrs = t.effort_unit === 'hours' ? t.estimated_effort : t.estimated_effort / 60;
      const actHrs = t.effort_unit === 'hours' ? t.actual_effort : t.actual_effort / 60;
      totalEst += estHrs;
      totalAct += actHrs;

      if (!isClosed) {
        openCount++;
        if (t.is_due_today) dueTodayCount++;
        if (t.is_overdue) overdueCount++;
        if (t.is_mandatory_for_readiness) blockedReadinessCount++;
      }
    });

    return {
      openCount,
      dueTodayCount,
      overdueCount,
      totalEst: Math.round(totalEst * 10) / 10,
      totalAct: Math.round(totalAct * 10) / 10,
      blockedReadinessCount
    };
  }, [tasks]);

  const handleStartTask = async (taskId) => {
    try {
      await api.patch(`/marketing/tasks/${taskId}`, { status: 'In Progress' });
      fetchTasks();
    } catch (err) {
      alert('Failed to start task: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleConfirmBlock = async () => {
    if (!blockingTask) return;
    if (!blockReasonInput.trim()) {
      alert('Please enter a blocked reason.');
      return;
    }
    try {
      await api.patch(`/marketing/tasks/${blockingTask.id}`, {
        status: 'Blocked',
        blocked_reason: blockReasonInput.trim()
      });
      setBlockingTask(null);
      setBlockReasonInput('');
      fetchTasks();
    } catch (err) {
      alert('Failed to block task: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleConfirmComplete = async () => {
    if (!completingTask) return;
    try {
      await api.patch(`/marketing/tasks/${completingTask.id}`, {
        status: 'Completed',
        actual_effort: parseFloat(actualEffortInput) || completingTask.estimated_effort || 0,
        completion_remarks: completionRemarksInput.trim()
      });
      setCompletingTask(null);
      setActualEffortInput('');
      setCompletionRemarksInput('');
      fetchTasks();
    } catch (err) {
      alert('Failed to complete task: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;
    try {
      await api.delete(`/marketing/tasks/${taskId}`);
      fetchTasks();
    } catch (err) {
      alert('Failed to delete task: ' + (err.response?.data?.detail || err.message));
    }
  };

  const getPriorityBadge = (priority) => {
    const p = (priority || 'Normal').toLowerCase();
    if (p === 'urgent') return 'bg-rose-100 text-rose-800 border-rose-300 font-black';
    if (p === 'high') return 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
    if (p === 'low') return 'bg-slate-100 text-slate-700 border-slate-300 font-medium';
    return 'bg-blue-50 text-blue-800 border-blue-200 font-semibold';
  };

  const getStatusBadge = (status) => {
    const s = (status || 'Open').toLowerCase();
    if (s === 'completed') return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (s === 'in progress') return 'bg-blue-100 text-blue-800 border-blue-300';
    if (s === 'blocked') return 'bg-rose-100 text-rose-800 border-rose-300';
    if (s === 'cancelled') return 'bg-slate-200 text-slate-700 border-slate-300';
    return 'bg-slate-100 text-slate-800 border-slate-200';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
            <CheckSquare size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Marketing My Tasks</h1>
            <p className="text-xs text-slate-500">
              Manage personal and department tasks, schedule target dates, track effort and resolve readiness blockers.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Toggle for Leads & Admins */}
          {isLead && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setScope('my')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  scope === 'my'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                My Tasks
              </button>
              <button
                onClick={() => setScope('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  scope === 'all'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Marketing
              </button>
            </div>
          )}

          <button
            onClick={fetchTasks}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => {
              setEditingTask(null);
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
          >
            <PlusCircle size={15} />
            <span>+ Add Task</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-96">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchTasks()}
              placeholder="Search by task title, job no, client, project..."
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-blue-500 outline-hidden text-xs text-slate-800 font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setOnlyOverdue(!onlyOverdue);
                if (!onlyOverdue) setOnlyDueToday(false);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                onlyOverdue
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Overdue Only
            </button>

            <button
              onClick={() => {
                setOnlyDueToday(!onlyDueToday);
                if (!onlyDueToday) setOnlyOverdue(false);
              }}
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                onlyDueToday
                  ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Due Today Only
            </button>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {['all', 'Open', 'In Progress', 'Blocked', 'Completed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all border ${
                statusFilter.toLowerCase() === tab.toLowerCase()
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab === 'all' ? 'All Statuses' : tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <RefreshCw size={24} className="animate-spin text-blue-600" />
            <span>Loading tasks...</span>
          </div>
        ) : tasks.length === 0 ? (
          <div className="p-16 text-center text-xs text-slate-400 space-y-2">
            <CheckSquare size={32} className="mx-auto text-slate-300" />
            <p className="font-semibold text-slate-700">No marketing tasks found.</p>
            <p className="text-slate-400">Click "+ Add Task" to schedule and track your work.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Task Title & Scope</th>
                  <th className="py-3.5 px-4">Linked Job</th>
                  <th className="py-3.5 px-4">Assigned To</th>
                  <th className="py-3.5 px-4">Target Date</th>
                  <th className="py-3.5 px-4">Effort (Est / Act)</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-blue-50/20 transition-colors">
                    {/* Task Title */}
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        {t.is_mandatory_for_readiness && (
                          <span
                            title="Mandatory for Job Readiness Check"
                            className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider border border-amber-300 shrink-0"
                          >
                            Readiness
                          </span>
                        )}
                        <span>{t.title}</span>
                      </div>
                      {t.description && (
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.description}</p>
                      )}
                      {t.blocked_reason && t.status === 'Blocked' && (
                        <p className="text-[11px] text-rose-600 font-medium mt-0.5">
                          Blocked: {t.blocked_reason}
                        </p>
                      )}
                    </td>

                    {/* Linked Job */}
                    <td className="py-3.5 px-4">
                      <Link
                        to={`/jobs/${t.job_id}`}
                        className="inline-flex items-center gap-1 font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <Briefcase size={13} />
                        <span>Job #{cleanJobNo(t.job_no || t.job_id)}</span>
                      </Link>
                      <div className="text-[11px] text-slate-500 truncate max-w-[150px]">
                        {t.client_name || t.project_name || 'Project'}
                      </div>
                    </td>

                    {/* Assigned To */}
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                        <UserCheck size={13} className="text-blue-600 shrink-0" />
                        <span>{t.assigned_to_name}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">By {t.created_by_name}</span>
                    </td>

                    {/* Target Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{t.target_date}</div>
                      {t.is_overdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 mt-0.5">
                          <AlertTriangle size={10} /> Overdue by {Math.abs(t.days_remaining)}d
                        </span>
                      )}
                      {t.is_due_today && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 mt-0.5">
                          <Clock size={10} /> Due Today
                        </span>
                      )}
                      {!t.is_overdue && !t.is_due_today && t.days_remaining > 0 && (
                        <span className="text-[10px] text-slate-400 block">{t.days_remaining}d remaining</span>
                      )}
                    </td>

                    {/* Effort */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-800">
                        {t.estimated_effort} <span className="text-[10px] font-normal text-slate-400">{t.effort_unit}</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-semibold">
                        Act: {t.actual_effort || 0} {t.effort_unit}
                      </div>
                    </td>

                    {/* Priority */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] border ${getPriorityBadge(t.priority)}`}>
                        {t.priority}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(t.status)}`}>
                        {t.status}
                      </span>
                    </td>

                    {/* Quick Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.status === 'Open' && (
                          <button
                            onClick={() => handleStartTask(t.id)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors font-bold flex items-center gap-1"
                            title="Start Task"
                          >
                            <Play size={13} />
                          </button>
                        )}

                        {t.status !== 'Completed' && (
                          <button
                            onClick={() => {
                              setCompletingTask(t);
                              setActualEffortInput(String(t.actual_effort || t.estimated_effort || ''));
                            }}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors font-bold flex items-center gap-1"
                            title="Mark Completed"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}

                        {t.status !== 'Blocked' && t.status !== 'Completed' && (
                          <button
                            onClick={() => {
                              setBlockingTask(t);
                              setBlockReasonInput(t.blocked_reason || '');
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Mark Blocked"
                          >
                            <AlertCircle size={14} />
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setEditingTask(t);
                            setModalOpen(true);
                          }}
                          className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Task"
                        >
                          <Edit3 size={14} />
                        </button>

                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Add / Edit Task */}
      {modalOpen && (
        <MarketingTaskModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingTask(null);
          }}
          onSaved={fetchTasks}
          task={editingTask}
          currentUser={user}
        />
      )}

      {/* Modal for Blocking Task */}
      {blockingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertCircle size={18} className="text-rose-600" />
              <span>Mark Task as Blocked</span>
            </h3>
            <p className="text-xs text-slate-500">
              Please state why this task is blocked (e.g. Waiting for customer approval, material PO pending).
            </p>
            <textarea
              rows={3}
              required
              value={blockReasonInput}
              onChange={(e) => setBlockReasonInput(e.target.value)}
              placeholder="Enter blocked reason..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-hidden focus:bg-white focus:border-rose-500 font-medium text-slate-900 resize-none"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setBlockingTask(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBlock}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-sm"
              >
                Confirm Block
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Completing Task */}
      {completingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle2 size={18} className="text-emerald-600" />
              <span>Complete Task & Log Effort</span>
            </h3>
            <p className="text-xs text-slate-500">
              Confirm task completion and record actual hours/effort spent.
            </p>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">
                Actual Effort ({completingTask.effort_unit || 'hours'})
              </label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={actualEffortInput}
                onChange={(e) => setActualEffortInput(e.target.value)}
                placeholder="e.g. 2.5"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-hidden focus:bg-white focus:border-emerald-500 font-medium text-slate-900"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-xs">Completion Remarks</label>
              <input
                type="text"
                value={completionRemarksInput}
                onChange={(e) => setCompletionRemarksInput(e.target.value)}
                placeholder="e.g. Customer approved specifications"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-hidden focus:bg-white focus:border-emerald-500 font-medium text-slate-900"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCompletingTask(null)}
                className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmComplete}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm"
              >
                Complete Task
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
