import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  CheckSquare, RefreshCw, Search, Clock, AlertTriangle,
  Calendar, CheckCircle2, AlertCircle, ChevronRight,
  UserCheck, Briefcase, Building, Layers, Eye
} from 'lucide-react';
import { cleanJobNo } from '../config/marketingFormConfig';

const DEPT_LABELS = {
  marketing: 'Marketing',
  design: 'Design - Electrical',
  mechanical: 'Design - Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
  qc: 'Production & QC & Dispatch'
};

export default function DepartmentMyTasksPage() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // active | not_started | due_today | overdue | completed | all
  const [selectedDept, setSelectedDept] = useState(() => user?.departments?.[0] || 'marketing');

  // Modal State for "Update My Progress"
  const [activeTask, setActiveTask] = useState(null);
  const [progressInput, setProgressInput] = useState(0);
  const [sessionHoursInput, setSessionHoursInput] = useState('');
  const [statusInput, setStatusInput] = useState('In Progress');
  const [remarksInput, setRemarksInput] = useState('');
  const [blockedReasonInput, setBlockedReasonInput] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';
  const effectiveDept = isAdmin ? selectedDept : (user?.departments?.[0] || 'marketing');
  const todayStr = new Date().toISOString().split('T')[0];

  const fetchTasks = async () => {
    try {
      setRefreshing(true);
      const params = new URLSearchParams();
      if (effectiveDept && effectiveDept !== 'all') params.set('department', effectiveDept);
      if (search) params.set('search', search);

      const res = await api.get(`/jobs/department-tasks/my-tasks?${params.toString()}`);
      setTasks(res.data?.tasks || []);
    } catch (err) {
      console.error('Failed to load department tasks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [effectiveDept]);

  // Dynamic filter counts computed 100% from actual authorized tasks
  const filterCounts = useMemo(() => {
    let all = tasks.length;
    let active = 0;
    let notStarted = 0;
    let dueToday = 0;
    let overdue = 0;
    let completed = 0;

    tasks.forEach(t => {
      const isComp = (t.status || '').toLowerCase() === 'completed' || Number(t.progress || 0) >= 100;
      if (isComp) {
        completed++;
      } else {
        active++;
        if (Number(t.progress || 0) === 0 || (t.status || '').toLowerCase() === 'not started') {
          notStarted++;
        }
        if (t.targetDate && t.targetDate.startsWith(todayStr)) {
          dueToday++;
        }
        if (t.targetDate && t.targetDate < todayStr) {
          overdue++;
        }
      }
    });

    return { all, active, notStarted, dueToday, overdue, completed };
  }, [tasks, todayStr]);

  // Overall time & effort statistics
  const effortSummary = useMemo(() => {
    let totalEstimated = 0.0;
    let totalActual = 0.0;

    tasks.forEach(t => {
      totalEstimated += Number(t.estimatedEffort || 0);
      totalActual += Number(t.actualEffort || 0);
    });

    const remaining = Math.max(0, totalEstimated - totalActual);

    return {
      totalEstimated: Math.round(totalEstimated * 10) / 10,
      totalActual: Math.round(totalActual * 10) / 10,
      remaining: Math.round(remaining * 10) / 10
    };
  }, [tasks]);

  // Filter tasks for display
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      // 1. Search filter
      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        const matchesJob = (t.jobNo || '').toLowerCase().includes(q) || cleanJobNo(t.jobNo).toLowerCase().includes(q);
        const matchesClient = (t.clientName || '').toLowerCase().includes(q);
        const matchesPanel = (t.panelName || '').toLowerCase().includes(q);
        const matchesTask = (t.taskName || '').toLowerCase().includes(q);
        const matchesUser = (t.assignedUser || '').toLowerCase().includes(q);
        if (!matchesJob && !matchesClient && !matchesPanel && !matchesTask && !matchesUser) {
          return false;
        }
      }

      // 2. Tab filter
      const isComp = (t.status || '').toLowerCase() === 'completed' || Number(t.progress || 0) >= 100;
      if (activeTab === 'active') return !isComp;
      if (activeTab === 'not_started') return !isComp && (Number(t.progress || 0) === 0 || (t.status || '').toLowerCase() === 'not started');
      if (activeTab === 'due_today') return !isComp && t.targetDate && t.targetDate.startsWith(todayStr);
      if (activeTab === 'overdue') return !isComp && t.targetDate && t.targetDate < todayStr;
      if (activeTab === 'completed') return isComp;
      return true; // 'all'
    });
  }, [tasks, activeTab, search, todayStr]);

  const handleOpenUpdateModal = (task, isQuickComplete = false) => {
    setActiveTask(task);
    setProgressInput(isQuickComplete ? 100 : (task.progress || 0));
    setSessionHoursInput('');
    setStatusInput(isQuickComplete ? 'Completed' : (task.status || 'In Progress'));
    setRemarksInput(task.completionRemarks || '');
    setBlockedReasonInput(task.blockedReason || '');
    setModalError('');
  };

  const handleSaveProgress = async (e) => {
    e.preventDefault();
    if (!activeTask) return;

    const prog = statusInput === 'Completed' ? 100 : (activeTask.progress && activeTask.progress > 0 ? activeTask.progress : 50);

    const sessionHrs = sessionHoursInput ? parseFloat(sessionHoursInput) : 0.0;
    if (sessionHrs < 0) {
      setModalError('Actual session hours worked cannot be negative.');
      return;
    }

    if (statusInput === 'Blocked' && !blockedReasonInput.trim()) {
      setModalError('A blocker or delay reason is mandatory when marking a task Blocked.');
      return;
    }

    try {
      setModalSubmitting(true);
      setModalError('');

      await api.patch(`/jobs/${activeTask.jobId}/workflow/my-task`, {
        taskId: activeTask.id,
        progress: prog,
        sessionHours: sessionHrs,
        status: statusInput,
        completionRemarks: remarksInput.trim(),
        blockedReason: statusInput === 'Blocked' ? blockedReasonInput.trim() : ''
      });

      setActiveTask(null);
      await fetchTasks();
    } catch (err) {
      console.error('Failed to update task progress:', err);
      setModalError(err.response?.data?.detail || 'Failed to update progress. Please try again.');
    } finally {
      setModalSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
            <CheckSquare size={16} />
            <span>Task Execution & Time Tracking</span>
            <span className="text-slate-300">•</span>
            <span className="text-slate-600">{DEPT_LABELS[effectiveDept] || effectiveDept}</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            My Tasks & Own Work Progress
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your daily tasks, log actual session effort, update progress, and track milestone delivery dates.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
            >
              <option value="marketing">Marketing</option>
              <option value="design">Design - Electrical</option>
              <option value="mechanical">Design - Mechanical</option>
              <option value="purchase">Procurement</option>
              <option value="production">Production & QC & Dispatch</option>
            </select>
          )}

          <button
            onClick={fetchTasks}
            disabled={refreshing}
            className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            title="Refresh Tasks"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Time and Progress KPI Summary (Part 5) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Estimated Effort</span>
            <Clock size={15} className="text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            {effortSummary.totalEstimated} <span className="text-xs font-medium text-slate-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Total planned work</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Actual Time Logged</span>
            <CheckCircle2 size={15} className="text-blue-600" />
          </div>
          <div className="text-2xl font-black text-blue-600 mt-1">
            {effortSummary.totalActual} <span className="text-xs font-medium text-blue-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Recorded work sessions</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Remaining Estimate</span>
            <Layers size={15} className="text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-600 mt-1">
            {effortSummary.remaining} <span className="text-xs font-medium text-amber-400">hrs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Estimated minus actual</div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Active / Completed</span>
            <CheckSquare size={15} className="text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 mt-1">
            <span className="text-indigo-600">{filterCounts.active}</span>
            <span className="text-slate-300 font-light mx-1">/</span>
            <span className="text-emerald-600">{filterCounts.completed}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {filterCounts.overdue > 0 ? (
              <span className="text-rose-600 font-bold">{filterCounts.overdue} task{filterCounts.overdue > 1 ? 's' : ''} overdue</span>
            ) : (
              'All tasks on schedule'
            )}
          </div>
        </div>
      </div>

      {/* Dynamic Filter Tabs & 5-Field Search Bar (Part 3) */}
      <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Job No, Customer, Panel, Task, User..."
              className="w-full pl-9 pr-4 h-9 bg-slate-50 border border-slate-200 rounded-full text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-[#0000AA]/20 focus:border-[#0000AA] transition-all"
            />
          </div>

          <div className="text-xs font-semibold text-slate-500 shrink-0">
            Showing <strong className="text-indigo-600">{filteredTasks.length}</strong> task records
          </div>
        </div>

        {/* Real Filter Chips with Dynamic Authorized Counts */}
        <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
          {[
            { id: 'active', label: 'My Active Tasks', count: filterCounts.active },
            { id: 'not_started', label: 'Not Started', count: filterCounts.notStarted },
            { id: 'due_today', label: 'Due Today', count: filterCounts.dueToday },
            { id: 'overdue', label: 'Overdue', count: filterCounts.overdue, danger: filterCounts.overdue > 0 },
            { id: 'completed', label: 'Completed', count: filterCounts.completed },
            { id: 'all', label: 'All Tasks', count: filterCounts.all }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === tab.id
                    ? 'bg-white/20 text-white'
                    : tab.danger
                    ? 'bg-rose-100 text-rose-700 font-bold'
                    : 'bg-white text-slate-700 border border-slate-200'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Task List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-400 text-xs font-medium">
            <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
            Loading authorized department tasks...
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-xs font-medium space-y-1">
            <p className="font-bold text-slate-700 text-sm">No tasks found</p>
            <p>No tasks match the active "{activeTab.replace('_', ' ')}" filter for {DEPT_LABELS[effectiveDept] || effectiveDept}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3.5 text-slate-400 font-bold w-12 text-center">No</th>
                  <th className="py-3 px-3.5">Job / Task Name</th>
                  <th className="py-3 px-3.5">Project & Customer</th>
                  <th className="py-3 px-3.5">Department</th>
                  <th className="py-3 px-3.5">Assigned To</th>
                  <th className="py-3 px-3.5">Timeline</th>
                  <th className="py-3 px-3.5">Effort (Est / Act)</th>
                  <th className="py-3 px-3.5">Remaining</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((t, idx) => {
                  const isCompleted = (t.status || '').toLowerCase() === 'completed' || Number(t.progress || 0) >= 100;
                  const isOverdue = !isCompleted && t.targetDate && t.targetDate < todayStr;
                  const remainingEffort = Math.max(0, Number(t.estimatedEffort || 0) - Number(t.actualEffort || 0));

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Sequential Number (No) */}
                      <td className="py-3 px-3.5 whitespace-nowrap font-mono text-slate-400 text-xs text-center font-medium">
                        {idx + 1}
                      </td>

                      {/* Job & Task Name */}
                      <td className="py-3 px-3.5">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/jobs/${t.jobId}`}
                            className="font-black text-indigo-600 hover:text-indigo-800 hover:underline"
                            title="Open Job Details"
                          >
                            {cleanJobNo(t.jobNo)}
                          </Link>
                          <span className="text-slate-300">•</span>
                          <span className="font-bold text-slate-800 truncate max-w-[200px]" title={t.taskName}>
                            {t.taskName}
                          </span>
                        </div>
                        {t.sentBy && (
                          <div className="text-[11px] font-semibold text-indigo-600 mt-0.5 flex items-center gap-1">
                            <span>📨 Sent by: <strong>{t.sentBy}</strong> ({t.sentByDepartment || 'Marketing'})</span>
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400 truncate max-w-[260px] mt-0.5">
                          {t.panelName || 'Standard Panel'}
                        </div>
                      </td>

                      {/* Project & Customer */}
                      <td className="py-3 px-3.5">
                        <div className="font-semibold text-slate-800 truncate max-w-[170px]" title={t.projectName}>
                          {t.projectName || '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[170px]">
                          {t.clientName || 'General Client'}
                        </div>
                      </td>

                      {/* Department */}
                      <td className="py-3 px-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {DEPT_LABELS[t.department] || t.department}
                        </span>
                      </td>

                      {/* Assigned User */}
                      <td className="py-3 px-3.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                          <UserCheck size={13} className="text-slate-400" />
                          <span>{t.assignedUser || 'Unassigned'}</span>
                        </span>
                      </td>

                      {/* Timeline */}
                      <td className="py-3 px-3.5">
                        <div className="text-slate-700 font-semibold flex items-center gap-1">
                          <Calendar size={13} className="text-slate-400" />
                          <span>{t.targetDate || '—'}</span>
                        </div>
                        {isOverdue && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 mt-0.5">
                            <AlertCircle size={11} />
                            Overdue
                          </span>
                        )}
                      </td>

                      {/* Effort (Est / Act) */}
                      <td className="py-3 px-3.5 text-slate-700 font-semibold">
                        <span>{t.estimatedEffort || 0}h</span>
                        <span className="text-slate-400 font-normal mx-1">/</span>
                        <span className="text-blue-600">{t.actualEffort || 0}h</span>
                      </td>

                      {/* Remaining Effort */}
                      <td className="py-3 px-3.5">
                        <span className="font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-xs">
                          {remainingEffort}h
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3.5">
                        <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                          isCompleted
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : t.status === 'Blocked'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {t.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right space-x-1.5">
                        {!isCompleted ? (
                          <>
                            <button
                              onClick={() => handleOpenUpdateModal(t, false)}
                              className="px-2.5 py-1 rounded-lg border border-indigo-200 hover:bg-indigo-50 text-[11px] font-bold text-indigo-700 transition-all"
                            >
                              Update Progress
                            </button>
                            <button
                              onClick={() => handleOpenUpdateModal(t, true)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[11px] font-bold text-white transition-all shadow-xs"
                            >
                              Complete
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleOpenUpdateModal(t, false)}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-bold text-slate-600 transition-all"
                          >
                            Edit Log
                          </button>
                        )}
                        <Link
                          to={`/jobs/${t.jobId}`}
                          className="inline-flex items-center p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Open Job Details"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ⭐ UPDATE MY PROGRESS MODAL (Part 4) */}
      {activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider">
                  Update My Task & Log Work Session
                </div>
                <h3 className="text-base font-black text-slate-900 tracking-tight mt-0.5">
                  {activeTask.taskName}
                </h3>
                <p className="text-xs text-slate-500">
                  Job #{cleanJobNo(activeTask.jobNo)} • {activeTask.clientName || 'General Client'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProgress} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-semibold">
                  {modalError}
                </div>
              )}

              {/* Effort & Session Time Breakdown */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Estimated</span>
                  <span className="text-sm font-black text-slate-800">{activeTask.estimatedEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Logged</span>
                  <span className="text-sm font-black text-blue-600">{activeTask.actualEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining</span>
                  <span className="text-sm font-black text-amber-600">
                    {Math.max(0, Number(activeTask.estimatedEffort || 0) - Number(activeTask.actualEffort || 0))}h
                  </span>
                </div>
              </div>


              {/* 2. Session Hours Worked (Logged incrementally without overwriting estimates) */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Hours Worked in this Work Session
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  placeholder="e.g. 2.5 (adds to total logged time)"
                  value={sessionHoursInput}
                  onChange={(e) => setSessionHoursInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Each session entry is recorded permanently in the work history audit trail.
                </span>
              </div>

              {/* 3. Task Status */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Task Status
                </label>
                <select
                  value={statusInput}
                  onChange={(e) => {
                    const st = e.target.value;
                    setStatusInput(st);
                    if (st === 'Completed' && progressInput < 100) setProgressInput(100);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                >
                  <option value="In Progress">In Progress</option>
                  <option value="Blocked">Blocked / Delay</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>

              {/* 4. Blocker Reason (if Blocked) */}
              {statusInput === 'Blocked' && (
                <div className="animate-in fade-in duration-150">
                  <label className="text-xs font-bold text-rose-700 uppercase tracking-wider block mb-1">
                    Blocker or Delay Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={blockedReasonInput}
                    onChange={(e) => setBlockedReasonInput(e.target.value)}
                    placeholder="Describe what is blocking this task (e.g. Waiting for client approval, missing drawing input)..."
                    className="w-full px-3.5 py-2 bg-rose-50/50 border border-rose-300 rounded-xl text-xs font-medium text-slate-800 resize-none outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              )}

              {/* 5. Work Remarks / Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Work Update Remarks
                </label>
                <textarea
                  rows={2}
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder="Summary of work completed in this session..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 resize-none outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setActiveTask(null)}
                  disabled={modalSubmitting}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50"
                >
                  {modalSubmitting ? 'Saving...' : 'Save Work Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
