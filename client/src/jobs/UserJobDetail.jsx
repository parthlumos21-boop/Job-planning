import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ArrowLeft, Edit3, ArrowRightLeft, Send, CheckCircle2, Clock, AlertTriangle,
  Briefcase, Calendar, UserCheck, Layers, FileText, ShoppingCart, History,
  ShieldCheck, Phone, MapPin, Truck, Package, Eye, ChevronRight, RefreshCw,
  CheckSquare, Plus, Check, X, AlertCircle, UserPlus, Cpu, Wrench
} from 'lucide-react';
import { cleanJobNo, isMarketingUser, isMarketingLead } from '../config/marketingFormConfig';
import SimpleHandoverModal from './SimpleHandoverModal';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';

const DEPT_PROGRESS_STEPS = [
  { key: 'marketing', label: '1. Marketing' },
  { key: 'design', label: '2. Electrical Design' },
  { key: 'purchase', label: '3. Procurement' },
  { key: 'production', label: '4. Production & QC' },
  { key: 'dispatch', label: '5. Dispatch' }
];

export default function UserJobDetail({ onSwitchToAdmin }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [workflowState, setWorkflowState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals & Action States
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const [clarificationReason, setClarificationReason] = useState('Missing Technical Information');
  const [clarificationRemarks, setClarificationRemarks] = useState('');

  const [taskUpdateOpen, setTaskUpdateOpen] = useState(false);
  const [progressInput, setProgressInput] = useState(0);
  const [sessionHoursInput, setSessionHoursInput] = useState('');
  const [statusInput, setStatusInput] = useState('In Progress');
  const [remarksInput, setRemarksInput] = useState('');
  const [blockedReasonInput, setBlockedReasonInput] = useState('');
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  const [directAssignOpen, setDirectAssignOpen] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [directTaskName, setDirectTaskName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Tabs for detailed view beneath 8 core workflow sections
  const [activeTab, setActiveTab] = useState('overview');

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';

  const fetchWorkflowState = async () => {
    try {
      setLoading(true);
      setError('');
      const [jobRes, wfRes] = await Promise.all([
        api.get(`/jobs/${id}`),
        api.get(`/jobs/${id}/workflow-state`)
      ]);
      setJob(jobRes.data);
      setWorkflowState(wfRes.data);
    } catch (err) {
      console.error('Failed to load job workflow:', err);
      if (err.response?.status === 404) {
        setError('Job record not found.');
      } else {
        setError(err.response?.data?.detail || 'Failed to load job details.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchWorkflowState();
    }
  }, [id]);

  // Handle Accept Job
  const handleAcceptJob = async () => {
    try {
      setActionLoading(true);
      await api.post(`/jobs/${id}/workflow/accept`, {});
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to accept job: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Return for Clarification
  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!clarificationRemarks.trim()) {
      alert('Clarification remarks are required');
      return;
    }
    try {
      setActionLoading(true);
      await api.post(`/jobs/${id}/workflow/return`, {
        reasonCategory: clarificationReason,
        remarks: clarificationRemarks.trim()
      });
      setClarificationOpen(false);
      setClarificationRemarks('');
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to return job: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Update My Task
  const handleSaveTask = async (e) => {
    e.preventDefault();
    if (!workflowState?.myTask) return;
    const prog = isCompletingTask ? 100 : Number(progressInput);
    if (prog < 0 || prog > 100) {
      alert('Progress percentage must be between 0% and 100%');
      return;
    }
    const sessHrs = sessionHoursInput ? Number(sessionHoursInput) : 0;
    if (sessHrs < 0) {
      alert('Session hours worked cannot be negative');
      return;
    }
    if (statusInput === 'Blocked' && !blockedReasonInput.trim()) {
      alert('A blocker or delay reason is required when marking a task Blocked');
      return;
    }
    try {
      setActionLoading(true);
      await api.patch(`/jobs/${id}/workflow/my-task`, {
        taskId: workflowState.myTask.id,
        progress: prog,
        sessionHours: sessHrs,
        completionRemarks: remarksInput.trim(),
        status: isCompletingTask ? 'Completed' : statusInput,
        blockedReason: statusInput === 'Blocked' ? blockedReasonInput.trim() : ''
      });
      setTaskUpdateOpen(false);
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to update task: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Direct Assign
  const handleDirectAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assigneeName) {
      alert('Please select an engineer or user to assign.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post(`/jobs/${id}/workflow/direct-assign`, {
        assignedUserName: assigneeName,
        taskName: directTaskName.trim()
      });
      setDirectAssignOpen(false);
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to assign task: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-blue-600" />
        <p className="text-sm font-semibold">Loading Department Workflow...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center">
          <AlertTriangle size={28} />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{error || 'Job Not Accessible'}</h2>
        <button
          onClick={() => navigate('/my-jobs')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
        >
          <ArrowLeft size={14} /> Back to My Jobs
        </button>
      </div>
    );
  }

  const { jobInfo, ownership, myTask, readiness, primaryAction, incomingHandover, history } = workflowState || {};
  const normalizeDept = (d) => {
    const s = (d || '').toLowerCase();
    if (s.includes('market')) return 'marketing';
    if (s.includes('mech')) return 'mechanical';
    if (s.includes('elect') || s.includes('design')) return 'design';
    if (s.includes('purch') || s.includes('proc')) return 'purchase';
    if (s.includes('prod') || s.includes('qc') || s.includes('disp')) return 'production';
    return s || 'marketing';
  };

  const currentDeptKey = normalizeDept(ownership?.department || 'marketing');
  const currentStatus = ownership?.currentStatus || 'In Progress';
  const isPendingAcceptance = currentStatus === 'Pending Acceptance';
  const isClarification = currentStatus === 'Needs Clarification';
  const userDepts = (user?.departments || []).map(normalizeDept);
  const userPrimaryDept = userDepts[0] || 'marketing';
  const isOwnDepartment = isAdmin || userDepts.includes(currentDeptKey);
  const isCallerDept = isOwnDepartment;

  // Scoped history: regular users see only their department's activity; admins see all
  const visibleHistory = (history || []).filter(h => {
    if (isAdmin) return true;
    const hDept = normalizeDept(h.department);
    return userDepts.includes(hDept);
  });

  // Available users for direct assignment in current department
  const deptUserCandidates = DEPARTMENT_USER_OPTIONS[currentDeptKey] || [];

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      
      {/* ========================================================================= */}
      {/* 1. JOB HEADER */}
      {/* ========================================================================= */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <button
            onClick={() => navigate('/my-jobs')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-800 shrink-0 mt-0.5"
            title="Back to My Jobs"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {cleanJobNo(jobInfo?.jobNo || job.jobNo)}
              </h1>
              <span className="text-slate-300">•</span>
              <span className="text-sm sm:text-base font-bold text-slate-800">
                {jobInfo?.panelName || 'Standard Panel'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs sm:text-sm font-semibold text-slate-600">
                {jobInfo?.customer || 'General Client'}
              </span>

              {/* Current Status Pill */}
              <span className={`px-3 py-1 rounded-full text-xs font-black shadow-2xs ${
                currentStatus === 'In Progress'
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : currentStatus === 'Pending Acceptance'
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : currentStatus === 'Needs Clarification'
                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}>
                {currentStatus}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1 font-medium">
              Project: <strong className="text-slate-800">{jobInfo?.project || '—'}</strong> • Current Owner: <strong className="text-slate-800 uppercase">{ownership?.department}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && onSwitchToAdmin && (
            <button
              onClick={onSwitchToAdmin}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
            >
              Control Center View
            </button>
          )}

          {(isAdmin || isOwnDepartment) && (
            <button
              onClick={() => navigate(`/jobs/edit/${job.id}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs"
            >
              <Edit3 size={14} />
              <span>Edit Specifications</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. JOB PROGRESS STEPPER */}
      {/* ========================================================================= */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2.5">
          {isAdmin ? 'Workflow Progress Pipeline' : 'Your Department Workflow Stage'}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(() => {
            const visibleSteps = isAdmin
              ? DEPT_PROGRESS_STEPS
              : DEPT_PROGRESS_STEPS.filter(step => userDepts.includes(step.key));

            return visibleSteps.map((step, idx) => {
              const currentIdx = DEPT_PROGRESS_STEPS.findIndex(s => s.key === currentDeptKey);
              const stepIdxInFull = DEPT_PROGRESS_STEPS.findIndex(s => s.key === step.key);
              const isCurrent = step.key === currentDeptKey;
              const isPassed = stepIdxInFull < currentIdx;

              return (
                <div key={step.key} className="flex items-center gap-2 shrink-0">
                  <div className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    isCurrent
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : isPassed
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                      : 'bg-slate-50 text-slate-400 border-slate-200'
                  }`}>
                    {isPassed && <span className="mr-1.5">✓</span>}
                    {step.label}
                  </div>
                  {isAdmin && idx < visibleSteps.length - 1 && (
                    <ChevronRight size={14} className="text-slate-300" />
                  )}
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. JOB INFORMATION & 4. CURRENT OWNERSHIP (Admin Only - Untouched) */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* 3. JOB INFORMATION */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                3. Job Information
              </h3>
              <span className="text-[11px] font-bold text-slate-400">Master Record</span>
            </div>

            <div className="grid grid-cols-2 gap-3.5 text-xs">
              <div>
                <span className="text-slate-400 block font-medium">Customer</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{jobInfo?.customer || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Project</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{jobInfo?.project || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Panel Name & Rating</span>
                <span className="font-bold text-slate-900 mt-0.5 block">{jobInfo?.panelName || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Quantity</span>
                <span className="font-black text-slate-900 mt-0.5 block">{jobInfo?.quantity || 1} Unit</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Original Date</span>
                <span className="font-semibold text-slate-700 mt-0.5 block">{jobInfo?.originalDate || '—'}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-medium">Expected Date</span>
                <span className="font-black text-slate-900 mt-0.5 block">{jobInfo?.expectedDate || '—'}</span>
              </div>
            </div>
          </div>

          {/* 4. CURRENT OWNERSHIP */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                4. Current Ownership
              </h3>
              <span className="text-[11px] font-bold text-blue-600 uppercase">{ownership?.department}</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[11px] block font-semibold">Active Department</span>
                  <span className="font-black text-slate-900 text-sm capitalize">{ownership?.department}</span>
                </div>
                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">Stage Owner</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[11px] block font-semibold">Responsible Engineer</span>
                  <span className="font-bold text-indigo-700 mt-0.5 block truncate">
                    {ownership?.responsibleEngineer || 'Unassigned'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Technical Accountability</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 text-[11px] block font-semibold">Assigned User</span>
                  <span className="font-bold text-slate-900 mt-0.5 block truncate">
                    {ownership?.assignedUser || 'Queue (Pending Accept)'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Current Task Executor</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="font-semibold text-slate-500">Current Status:</span>
                <span className="font-bold text-slate-800">{ownership?.currentStatus}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MY TASK & WORK EXECUTION (Structured & Modernized for Regular Users) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Card Header Strip */}
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/70 to-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                <CheckSquare size={16} />
              </span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                {isAdmin ? '5. My Task & Work Execution' : '3. My Task & Work Execution'}
              </h3>
              {myTask && (
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                  myTask.status === 'Completed'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : myTask.status === 'Blocked'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                }`}>
                  {myTask.status}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Active engineering task for <strong className="text-slate-700 capitalize">{ownership?.department}</strong> department. Complete work and log effort hours.
            </p>
          </div>

          {isCallerDept && (
            <button
              onClick={() => {
                setAssigneeName(ownership?.assignedUser || '');
                setDirectTaskName(myTask?.taskName || '');
                setDirectAssignOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs"
            >
              <UserPlus size={14} className="text-blue-600" />
              <span>Direct Assign</span>
            </button>
          )}
        </div>

        {myTask ? (
          <div className="p-5 sm:p-6 space-y-6">
            {/* Task Overview Card */}
            <div className="bg-slate-50/80 rounded-xl p-4 sm:p-5 border border-slate-200/70 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider text-blue-600 bg-blue-50/80 px-2.5 py-0.5 rounded-md border border-blue-200/60">
                      {myTask.department} Task
                    </span>
                    {myTask.targetedDate && myTask.targetedDate < new Date().toISOString().split('T')[0] && myTask.status !== 'Completed' && (
                      <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 text-[10px] uppercase tracking-wider">
                        Overdue
                      </span>
                    )}
                  </div>
                  <h4 className="text-lg font-black text-slate-900 tracking-tight mt-1.5">
                    {myTask.taskName || 'Department Engineering Task'}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-600 mt-1 font-medium">
                    <UserCheck size={14} className="text-slate-400" />
                    <span>Assigned Engineer:</span>
                    <strong className="text-slate-900 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      {myTask.assignedUser || ownership?.assignedUser || 'Unassigned'}
                    </strong>
                  </div>
                </div>

                {/* Progress Circle / Bar Indicator */}
                <div className="w-full md:w-56 bg-white p-3 rounded-xl border border-slate-200/80 shadow-xs">
                  <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                    <span className="text-slate-500">Progress</span>
                    <span className={`text-sm font-black ${myTask.status === 'Completed' ? 'text-emerald-600' : 'text-blue-600'}`}>
                      {myTask.progress}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border border-slate-200/60">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        myTask.status === 'Completed' ? 'bg-emerald-500' : 'bg-blue-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, myTask.progress || 0))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Timeline & Effort Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200/60">
                <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Start Date</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar size={13} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-800">{myTask.startDate || 'Today'}</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Target Due Date</span>
                  <div className="flex items-center gap-1.5 mt-1">
                    <Clock size={13} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-800">{myTask.targetedDate || '—'}</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Effort Logged</span>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className="text-sm font-black text-blue-600">{myTask.actualEffort || 0}h</span>
                    <span className="text-[11px] font-semibold text-slate-400">/ {myTask.estimatedEffort || 0}h est</span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-xl border border-slate-200/70">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Remaining Effort</span>
                  <div className="mt-1">
                    <span className="inline-block text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      {Math.max(0, Number(myTask.estimatedEffort || 0) - Number(myTask.actualEffort || 0))}h remaining
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Remarks / Blockers if present */}
            {myTask.blockedReason && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2.5">
                <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block text-rose-800">Task Blocked Reason:</span>
                  <span className="font-medium mt-0.5 block">{myTask.blockedReason}</span>
                </div>
              </div>
            )}

            {myTask.completionRemarks && (
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 space-y-1">
                <span className="font-bold text-slate-800 block text-[11px] uppercase tracking-wider">Completion Remarks:</span>
                <p className="font-medium">{myTask.completionRemarks}</p>
              </div>
            )}

            {/* Task Action Buttons */}
            {isCallerDept && myTask.status !== 'Completed' && (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-100">
                <button
                  onClick={() => {
                    setProgressInput(myTask.progress || 0);
                    setSessionHoursInput('');
                    setStatusInput(myTask.status || 'In Progress');
                    setRemarksInput(myTask.completionRemarks || '');
                    setBlockedReasonInput(myTask.blockedReason || '');
                    setIsCompletingTask(false);
                    setTaskUpdateOpen(true);
                  }}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all shadow-xs"
                >
                  Update Progress & Log Hours
                </button>
                <button
                  onClick={() => {
                    setProgressInput(100);
                    setSessionHoursInput('');
                    setStatusInput('Completed');
                    setRemarksInput(myTask.completionRemarks || '');
                    setBlockedReasonInput('');
                    setIsCompletingTask(true);
                    setTaskUpdateOpen(true);
                  }}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <CheckCircle2 size={15} />
                  <span>Mark Task as Completed</span>
                </button>
              </div>
            )}

            {!isOwnDepartment && (
              <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-500 flex items-center justify-between border border-slate-200/60">
                <span>Task currently active in <strong>{ownership?.department}</strong>.</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">View-Only</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-slate-400 text-xs font-medium bg-slate-50 rounded-b-2xl border-t border-slate-100">
            No active task created yet. Task is generated automatically upon accepting the job.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. STRUCTURED JOB SPECIFICATIONS (Visible for Regular Department Users) */}
      {/* ========================================================================= */}
      {!isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Technical Specifications */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-blue-50 text-blue-600"><Cpu size={14} /></div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  4. Technical Specifications
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Engineering Specs</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Panel Type</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {job?.typeOfPanel || jobInfo?.panelName || 'Standard Panel'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Incomer Rating</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {job?.incomerRating || 'Standard Rating'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Quantity</span>
                <span className="font-black text-slate-900 mt-0.5 block">
                  {job?.panelQty || jobInfo?.quantity || 1} Unit(s)
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Industry</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {job?.industry || 'Manufacturing'}
                </span>
              </div>
            </div>
          </div>

          {/* Commercial & Order Details */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-600"><FileText size={14} /></div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  5. Commercial & Order Details
                </h3>
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Purchase Order</span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">PO Number</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {job?.poNo || '—'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">PO Date</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {job?.poDate || '—'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Customer</span>
                <span className="font-bold text-slate-900 mt-0.5 block truncate">
                  {jobInfo?.customer || job?.customer || '—'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider block">Expected Date</span>
                <span className="font-black text-slate-900 mt-0.5 block truncate">
                  {jobInfo?.expectedDate || job?.expectedDate || '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. READINESS CHECK (Admin Control Center View Only) */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                6. Readiness Check & Validation
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Mandatory engineering and commercial requirements needed before handover is enabled.
              </p>
            </div>
            <div className="text-right">
              <span className="text-sm font-black text-blue-600">{readiness?.score || '0/6'}</span>
              <span className="text-xs text-slate-400 ml-1 font-semibold">Checks Passed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {(readiness?.requirements || []).map((req, idx) => (
              <div
                key={req.key || idx}
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs transition-all ${
                  req.ready
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    req.ready ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'
                  }`}>
                    {req.ready ? <Check size={12} /> : <X size={12} />}
                  </div>
                  <span className="font-semibold">{req.label}</span>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-wider ${req.ready ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {req.ready ? 'Ready' : 'Pending'}
                </span>
              </div>
            ))}
          </div>

          {!readiness?.isFullyReady && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                <span>Some mandatory information is incomplete. Complete required data before handover.</span>
              </div>
              <button
                onClick={() => navigate(`/jobs/edit/${job.id}`)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg shrink-0 shadow-xs"
              >
                Complete Missing Information
              </button>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. NEXT ACTION / HANDOVER (Admin Control Center View Only) */}
      {/* ========================================================================= */}
      {isAdmin && (
        <div className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl shadow-md space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
                7. Next Primary Action
              </span>
              <h3 className="text-lg font-black tracking-tight mt-0.5">
                {isPendingAcceptance
                  ? `Incoming Job for ${ownership?.department}`
                  : isClarification
                  ? `Clarification Requested by Previous Department`
                  : myTask?.status === 'Completed' && readiness?.isFullyReady
                  ? `Ready for Department Handover`
                  : `Working on Current Department Stage`}
              </h3>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                {isPendingAcceptance
                  ? `Received from ${incomingHandover?.fromDepartment || 'previous department'}. Accept to start working and auto-generate task, or return for clarification.`
                  : isClarification
                  ? `Review clarification comments, edit required information, and re-handover.`
                  : myTask?.status === 'Completed' && readiness?.isFullyReady
                  ? `All requirements complete. Click below to transfer responsibility to the next department.`
                  : `Complete My Task and verify all readiness checklist items to unlock handover.`}
              </p>
            </div>

            {/* Action Trigger Buttons */}
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {/* If Pending Acceptance */}
              {isPendingAcceptance && (
                <>
                  <button
                    onClick={() => setClarificationOpen(true)}
                    disabled={actionLoading}
                    className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
                  >
                    Return for Clarification
                  </button>
                  <button
                    onClick={handleAcceptJob}
                    disabled={actionLoading}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <CheckCircle2 size={16} />
                    <span>Accept Job</span>
                  </button>
                </>
              )}

              {/* If In Progress and Ready for Handover */}
              {!isPendingAcceptance && (
                <button
                  onClick={() => setHandoverModalOpen(true)}
                  disabled={!readiness?.isFullyReady || myTask?.status !== 'Completed' || actionLoading}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2"
                >
                  <Send size={15} />
                  <span>
                    {currentDeptKey === 'marketing'
                      ? 'Handover to Design'
                      : currentDeptKey === 'design'
                      ? 'Handover to Procurement'
                      : currentDeptKey === 'purchase'
                      ? 'Handover to Production'
                      : 'Handover to Next Department'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. MY DEPARTMENT HISTORY & AUDIT LOG */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-slate-100 text-slate-700"><History size={15} /></div>
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
              {isAdmin ? '8. Recent Workflow History & Audit Log' : `6. My Department History (${userPrimaryDept.toUpperCase()})`}
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-semibold">
            {isAdmin ? `${visibleHistory.length} Events (All Departments)` : `${visibleHistory.length} Events Recorded`}
          </span>
        </div>

        {visibleHistory && visibleHistory.length > 0 ? (
          <div className="space-y-3">
            {visibleHistory.map((h, idx) => (
              <div key={h.id || idx} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{h.action}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-semibold text-blue-600 capitalize">{h.department}</span>
                  </div>
                  <p className="text-slate-500 font-medium">
                    Performed by: <strong className="text-slate-800">{h.performedBy || 'System'}</strong>
                  </p>
                  {h.details && (
                    <p className="text-[11px] text-slate-400 italic">
                      {typeof h.details === 'object' ? JSON.stringify(h.details) : h.details}
                    </p>
                  )}
                </div>
                <div className="text-[11px] text-slate-400 font-medium shrink-0">
                  {h.timestamp ? new Date(h.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 text-center text-slate-400 text-xs font-medium">
            No history recorded yet for {isAdmin ? 'this job' : `${userPrimaryDept.toUpperCase()} department on this job`}.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODALS */}
      {/* ========================================================================= */}

      {/* Simple Handover Modal */}
      {handoverModalOpen && (
        <SimpleHandoverModal
          job={job}
          isOpen={handoverModalOpen}
          onClose={() => setHandoverModalOpen(false)}
          onSuccess={() => fetchWorkflowState()}
        />
      )}

      {/* Clarification Return Modal */}
      {clarificationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Return for Clarification</h3>
              <p className="text-xs text-slate-500">Provide details on what needs correction before acceptance.</p>
            </div>
            <form onSubmit={handleReturnSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reason Category</label>
                <select
                  value={clarificationReason}
                  onChange={(e) => setClarificationReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                >
                  <option value="Missing Technical Information">Missing Technical Information</option>
                  <option value="Drawing Discrepancy">Drawing Discrepancy</option>
                  <option value="Commercial Conflict">Commercial Conflict</option>
                  <option value="Infeasible Delivery Date">Infeasible Delivery Date</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Clarification Remarks</label>
                <textarea
                  rows={3}
                  value={clarificationRemarks}
                  onChange={(e) => setClarificationRemarks(e.target.value)}
                  placeholder="Detail exact information or drawings required..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setClarificationOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Update Modal */}
      {taskUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">
                {isCompletingTask ? 'Complete My Task' : 'Update Task Progress'}
              </h3>
              <p className="text-xs text-slate-500">{myTask?.taskName}</p>
            </div>
            <form onSubmit={handleSaveTask} className="space-y-3.5">
              {/* Effort Breakdown */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Estimated</span>
                  <span className="font-black text-slate-800">{myTask?.estimatedEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Logged</span>
                  <span className="font-black text-blue-600">{myTask?.actualEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining</span>
                  <span className="font-black text-amber-600">
                    {Math.max(0, Number(myTask?.estimatedEffort || 0) - Number(myTask?.actualEffort || 0))}h
                  </span>
                </div>
              </div>

              {!isCompletingTask && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    Progress: {progressInput}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={progressInput}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setProgressInput(val);
                      if (val >= 100) setStatusInput('Completed');
                    }}
                    className="w-full cursor-pointer accent-blue-600"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Hours Worked in this Work Session (adds to logged time)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={sessionHoursInput}
                  onChange={(e) => setSessionHoursInput(e.target.value)}
                  placeholder="e.g. 2.5"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              {!isCompletingTask && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Task Status</label>
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                  >
                    <option value="In Progress">In Progress</option>
                    <option value="Blocked">Blocked / Delay</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              )}

              {statusInput === 'Blocked' && (
                <div>
                  <label className="text-xs font-bold text-rose-700 block mb-1">
                    Blocker or Delay Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={blockedReasonInput}
                    onChange={(e) => setBlockedReasonInput(e.target.value)}
                    placeholder="Describe what is causing the delay or blockage..."
                    className="w-full px-3 py-2 bg-rose-50/50 border border-rose-300 rounded-xl text-xs font-medium resize-none"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Completion Remarks / Session Notes</label>
                <textarea
                  rows={2}
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder="Notes on work performed..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setTaskUpdateOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs ${
                    isCompletingTask ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isCompletingTask ? 'Confirm Task Completed' : 'Save Progress'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Direct Assign Modal */}
      {directAssignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Direct Assign Task</h3>
              <p className="text-xs text-slate-500">Assign a team member in {ownership?.department} to this job's task.</p>
            </div>
            <form onSubmit={handleDirectAssignSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Select User / Engineer</label>
                <select
                  value={assigneeName}
                  onChange={(e) => setAssigneeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  required
                >
                  <option value="">-- Choose Member --</option>
                  {deptUserCandidates.map((cand) => (
                    <option key={cand} value={cand}>{cand}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Task Title</label>
                <input
                  type="text"
                  value={directTaskName}
                  onChange={(e) => setDirectTaskName(e.target.value)}
                  placeholder={myTask?.taskName || 'Department Execution Task'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDirectAssignOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                >
                  Confirm Assignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
