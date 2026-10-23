import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ArrowLeft, Edit3, ArrowRightLeft, Send, CheckCircle2, Clock, AlertTriangle,
  Briefcase, Calendar, UserCheck, Layers, FileText, ShoppingCart, History,
  ShieldCheck, Phone, MapPin, Truck, Package, Eye, ChevronRight, RefreshCw,
  CheckSquare, Plus, Check, X, AlertCircle, UserPlus, Cpu, Wrench, Download,
  Upload, FileUp, Folder
} from 'lucide-react';
import { cleanJobNo, isMarketingUser, isMarketingLead } from '../config/marketingFormConfig';
import SimpleHandoverModal from './SimpleHandoverModal';
import ReassignEngineerModal from './modals/ReassignEngineerModal';
import ReHandoverModal from './modals/ReHandoverModal';
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

  // Task Update State (Strictly Zero Sliders)
  const [taskUpdateOpen, setTaskUpdateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [sessionHoursInput, setSessionHoursInput] = useState('');
  const [statusInput, setStatusInput] = useState('In Progress');
  const [remarksInput, setRemarksInput] = useState('');
  const [blockedReasonInput, setBlockedReasonInput] = useState('');
  const [isCompletingTask, setIsCompletingTask] = useState(false);

  // Add Task Modal State
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [taskNameInput, setTaskNameInput] = useState('');
  const [taskAssigneeInput, setTaskAssigneeInput] = useState('');
  const [taskTargetDateInput, setTaskTargetDateInput] = useState('');
  const [taskEstimatedEffortInput, setTaskEstimatedEffortInput] = useState('4');
  const [taskInstructionsInput, setTaskInstructionsInput] = useState('');

  // Document Upload State
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [docFile, setDocFile] = useState(null);
  const [docType, setDocType] = useState('CUSTOMER_DRAWING');

  const [directAssignOpen, setDirectAssignOpen] = useState(false);
  const [assigneeName, setAssigneeName] = useState('');
  const [directTaskName, setDirectTaskName] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reHandoverModalOpen, setReHandoverModalOpen] = useState(false);

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

  // Handle Update Task (No progress sliders - hours & status only)
  const handleSaveTask = async (e) => {
    e.preventDefault();
    const targetTask = editingTask || workflowState?.myTask;
    if (!targetTask) return;
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
        taskId: targetTask.id,
        progress: (statusInput === 'Completed' || isCompletingTask) ? 100 : 50,
        sessionHours: sessHrs,
        completionRemarks: remarksInput.trim(),
        status: isCompletingTask ? 'Completed' : statusInput,
        blockedReason: statusInput === 'Blocked' ? blockedReasonInput.trim() : ''
      });
      setTaskUpdateOpen(false);
      setEditingTask(null);
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to update task: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Add Task to Department
  const handleAddTaskSubmit = async (e) => {
    e.preventDefault();
    if (!taskNameInput.trim()) {
      alert('Please enter a task name');
      return;
    }
    try {
      setActionLoading(true);
      await api.post(`/jobs/${id}/tasks`, {
        taskName: taskNameInput.trim(),
        assignedUser: taskAssigneeInput.trim() || undefined,
        targetDate: taskTargetDateInput || undefined,
        estimatedEffort: taskEstimatedEffortInput ? Number(taskEstimatedEffortInput) : 4,
        instructions: taskInstructionsInput.trim() || undefined
      });
      setAddTaskOpen(false);
      setTaskNameInput('');
      setTaskInstructionsInput('');
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to create task: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Document Upload (pgAdmin 4 job_documents table)
  const handleUploadDocSubmit = async (e) => {
    e.preventDefault();
    if (!docFile) {
      alert('Please select a file to upload');
      return;
    }
    try {
      setActionLoading(true);
      const formData = new FormData();
      formData.append('file', docFile);
      formData.append('document_type', docType);
      await api.post(`/jobs/${id}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadDocOpen(false);
      setDocFile(null);
      await fetchWorkflowState();
    } catch (err) {
      alert('Failed to upload document: ' + (err.response?.data?.detail || err.message));
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
        <p className="text-xs text-slate-500">
          This job may not exist, has been removed, or is not assigned to your department.
        </p>
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => navigate('/my-jobs')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs"
          >
            <ArrowLeft size={14} /> Back to My Jobs
          </button>
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
          >
            Dashboard
          </button>
        </div>
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
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              Control Center View
            </button>
          )}

          {/* 1. Add Task Button */}
          {(isAdmin || isCallerDept) && (
            <button
              onClick={() => {
                setTaskAssigneeInput(ownership?.assignedUser || deptUserCandidates[0] || '');
                setTaskTargetDateInput('');
                setTaskEstimatedEffortInput('4');
                setAddTaskOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              <span>+ Add Task</span>
            </button>
          )}

          {/* 2. Reassign User Button */}
          {(isAdmin || isCallerDept) && (
            <button
              onClick={() => setReassignModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer"
            >
              <UserCheck size={14} className="text-blue-600" />
              <span>Reassign User</span>
            </button>
          )}

          {/* 3. Request Clarification Button */}
          {(isAdmin || isCallerDept) && (
            <button
              onClick={() => setClarificationOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 transition-all shadow-xs cursor-pointer"
            >
              <AlertTriangle size={14} />
              <span>Request Clarification</span>
            </button>
          )}

          {/* 4. Handover -> Button */}
          {(isAdmin || isCallerDept) && (
            <button
              onClick={() => setHandoverModalOpen(true)}
              className={`inline-flex items-center gap-1.5 px-4 py-2 font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer ${
                workflowState?.isReadyForHandover
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/30'
                  : 'bg-slate-800 hover:bg-slate-900 text-white'
              }`}
            >
              <Send size={13} />
              <span>Handover →</span>
            </button>
          )}

          {(isAdmin || isOwnDepartment) && (
            <button
              onClick={() => navigate(`/jobs/edit/${job.id}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs"
            >
              <Edit3 size={14} />
              <span>Edit Specs</span>
            </button>
          )}
        </div>
      </div>

      {/* RETURNED FROM DESIGN ALERT BANNER */}
      {(jobInfo?.returnReason || currentStatus === 'Needs Clarification' || (job.handoverStatus || '').toLowerCase().includes('returned')) && (
        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-5 shadow-xs animate-in fade-in space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle size={22} />
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-rose-800 bg-rose-200/60 px-2.5 py-0.5 rounded-full">
                    Returned to Marketing
                  </span>
                  {jobInfo?.returnedBy && (
                    <span className="text-xs text-rose-700 font-semibold">
                      by <strong>{jobInfo.returnedBy}</strong>
                    </span>
                  )}
                  {jobInfo?.returnedAt && (
                    <span className="text-xs text-rose-500">
                      • {new Date(jobInfo.returnedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-black text-rose-950">
                  Return Reason: {jobInfo?.returnReason || job.handoverReturnReason || 'Missing Technical Information'}
                </h3>

                {jobInfo?.returnComment && (
                  <p className="text-xs text-rose-800 font-medium bg-white/80 p-3 rounded-xl border border-rose-200/80">
                    "{jobInfo.returnComment}"
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
              {(isAdmin || isMarketingUser(user)) && (
                <button
                  onClick={() => setReassignModalOpen(true)}
                  className="px-3 py-1.5 bg-white hover:bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Reassign Engineer
                </button>
              )}
              <button
                onClick={() => setReHandoverModalOpen(true)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Send size={13} />
                Re-Handover to Design
              </button>
            </div>
          </div>
        </div>
      )}

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
      {/* 2. READY FOR HANDOVER ENGINE & CHECKLIST BANNER */}
      {/* ========================================================================= */}
      {workflowState?.isReadyForHandover ? (
        <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-xs px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider">
              <CheckCircle2 size={13} />
              <span>Ready for Handover</span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight">
              All Department Requirements Satisfied
            </h2>
            <p className="text-xs text-emerald-50 font-medium max-w-xl">
              All tasks are completed, required specifications & drawings are stored in PostgreSQL, and responsible accountability is confirmed. Click below to transfer responsibility to the next department.
            </p>
          </div>

          <button
            onClick={() => setHandoverModalOpen(true)}
            className="px-5 py-3 bg-white hover:bg-emerald-50 text-emerald-800 text-xs font-black rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Send size={15} />
            <span>Handover to Next Department →</span>
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <span>Readiness Engine & Handover Checklist</span>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  {readiness?.score || '0/4'} Requirements Met
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete these departmental requirements to unlock job transfer to the next department.
              </p>
            </div>

            <button
              onClick={() => setHandoverModalOpen(true)}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer self-start sm:self-auto flex items-center gap-1.5"
            >
              <Send size={12} />
              <span>Open Handover Window</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. Tasks */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              readiness?.requirements?.find(r => r.key === 'tasks_completed')?.ready
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">1. Tasks</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  readiness?.requirements?.find(r => r.key === 'tasks_completed')?.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {readiness?.requirements?.find(r => r.key === 'tasks_completed')?.ready ? 'Complete' : 'Pending'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-1">
                {workflowState?.departmentTasks?.filter(t => (t.status || '').toLowerCase() === 'completed').length || 0} / {workflowState?.departmentTasks?.length || 0} Done
              </p>
              {!readiness?.requirements?.find(r => r.key === 'tasks_completed')?.ready && (
                <button
                  onClick={() => {
                    setTaskAssigneeInput(ownership?.assignedUser || deptUserCandidates[0] || '');
                    setAddTaskOpen(true);
                  }}
                  className="mt-2 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={12} /> Add Task
                </button>
              )}
            </div>

            {/* 2. Documents */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              readiness?.requirements?.find(r => r.key === 'documents_available')?.ready
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">2. Documents</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  readiness?.requirements?.find(r => r.key === 'documents_available')?.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {readiness?.requirements?.find(r => r.key === 'documents_available')?.ready ? 'Ready' : 'Pending'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-1">
                {workflowState?.documents?.length || 0} Stored in pgAdmin 4
              </p>
              <button
                onClick={() => setUploadDocOpen(true)}
                className="mt-2 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Upload size={12} /> Upload Document
              </button>
            </div>

            {/* 3. Responsible Engineer */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              readiness?.requirements?.find(r => r.key === 'responsible_assigned')?.ready
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">3. Accountability</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  readiness?.requirements?.find(r => r.key === 'responsible_assigned')?.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {readiness?.requirements?.find(r => r.key === 'responsible_assigned')?.ready ? 'Assigned' : 'Missing'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-1 truncate">
                {ownership?.responsibleEngineer || 'Unassigned'}
              </p>
              <button
                onClick={() => setReassignModalOpen(true)}
                className="mt-2 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <UserCheck size={12} /> Assign / Reassign
              </button>
            </div>

            {/* 4. Target Date */}
            <div className={`p-3.5 rounded-xl border transition-all ${
              readiness?.requirements?.find(r => r.key === 'target_date_defined')?.ready
                ? 'bg-emerald-50/70 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">4. Target Date</span>
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                  readiness?.requirements?.find(r => r.key === 'target_date_defined')?.ready
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {readiness?.requirements?.find(r => r.key === 'target_date_defined')?.ready ? 'Defined' : 'Missing'}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-800 mt-1">
                {jobInfo?.expectedDate || '—'}
              </p>
              <button
                onClick={() => navigate(`/jobs/edit/${job.id}`)}
                className="mt-2 text-[11px] font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit3 size={12} /> Edit Date
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. DEPARTMENT TASKS & WORK EXECUTION (Planned vs Actual Hours - ZERO SLIDERS) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/70 to-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-600 text-white shadow-xs">
                <CheckSquare size={16} />
              </span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                3. Department Tasks & Execution
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                ({workflowState?.departmentTasks?.length || 0} Tasks)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Real engineering work in <strong className="text-slate-700 capitalize">{ownership?.department}</strong>. Log session effort hours and transition statuses.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isCallerDept && (
              <button
                onClick={() => {
                  setTaskAssigneeInput(ownership?.assignedUser || deptUserCandidates[0] || '');
                  setTaskTargetDateInput('');
                  setTaskEstimatedEffortInput('4');
                  setAddTaskOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Add Task</span>
              </button>
            )}

            {isCallerDept && (
              <button
                onClick={() => {
                  setAssigneeName(ownership?.assignedUser || '');
                  setDirectTaskName(myTask?.taskName || '');
                  setDirectAssignOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer"
              >
                <UserPlus size={14} className="text-blue-600" />
                <span>Quick Reassign Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Tasks List */}
        <div className="p-5 sm:p-6 space-y-4">
          {workflowState?.departmentTasks && workflowState.departmentTasks.length > 0 ? (
            <div className="space-y-3.5">
              {workflowState.departmentTasks.map((t) => {
                const isTaskDone = (t.status || '').toLowerCase() === 'completed';
                const isTaskBlocked = (t.status || '').toLowerCase() === 'blocked';

                return (
                  <div
                    key={t.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                      isTaskDone
                        ? 'bg-slate-50/60 border-slate-200/70'
                        : isTaskBlocked
                        ? 'bg-rose-50/40 border-rose-200'
                        : 'bg-white border-slate-200/90 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      {/* Left: Task Info */}
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${
                            isTaskDone
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isTaskBlocked
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {t.status || 'In Progress'}
                          </span>

                          {/* Timing Status Badge */}
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            t.timingStatus === 'Overdue'
                              ? 'bg-rose-100 text-rose-800'
                              : t.timingStatus === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}>
                            {t.timingStatus || 'On Time'}
                          </span>

                          <span className="text-xs text-slate-400 font-medium">
                            • Dept: <strong className="text-slate-700 capitalize">{t.department}</strong>
                          </span>

                          {t.sentBy && (
                            <span className="text-xs text-slate-400 font-medium">
                              • Created by: <strong className="text-slate-600">{t.sentBy}</strong>
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-black text-slate-900 tracking-tight">
                          {t.taskName}
                        </h4>

                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <UserCheck size={14} className="text-slate-400" />
                            <span>Assigned: <strong>{t.assignedUser || 'Department Team'}</strong></span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-slate-400" />
                            <span>Target Date: <strong>{t.targetDate || 'Flexible'}</strong></span>
                          </div>
                        </div>

                        {t.blockedReason && (
                          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 flex items-start gap-2">
                            <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="block text-rose-800">Blocker Reason:</strong>
                              <span>{t.blockedReason}</span>
                            </div>
                          </div>
                        )}

                        {t.completionRemarks && (
                          <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200/70 font-medium">
                            <strong className="text-slate-700">Remarks: </strong>
                            {t.completionRemarks}
                          </p>
                        )}
                      </div>

                      {/* Right: Hours & Action buttons */}
                      <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end justify-between gap-3 shrink-0">
                        {/* Effort Box */}
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-xs text-slate-700 min-w-[200px]">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                            <span>Planned: <strong>{t.estimatedEffort || 0}h</strong></span>
                            <span>Actual Logged: <strong className="text-blue-600">{t.actualEffort || 0}h</strong></span>
                          </div>
                          <div className="text-[11px] font-bold text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded border border-amber-200/70 text-center">
                            Remaining: {Math.max(0, Number(t.estimatedEffort || 0) - Number(t.actualEffort || 0))}h
                          </div>
                        </div>

                        {/* Task Action Buttons */}
                        {isCallerDept && !isTaskDone && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setEditingTask(t);
                                setSessionHoursInput('');
                                setStatusInput(t.status || 'In Progress');
                                setRemarksInput(t.completionRemarks || '');
                                setBlockedReasonInput(t.blockedReason || '');
                                setIsCompletingTask(false);
                                setTaskUpdateOpen(true);
                              }}
                              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-2xs"
                            >
                              Log Hours & Status
                            </button>

                            <button
                              onClick={() => {
                                setEditingTask(t);
                                setSessionHoursInput('');
                                setStatusInput('Completed');
                                setRemarksInput(t.completionRemarks || '');
                                setBlockedReasonInput('');
                                setIsCompletingTask(true);
                                setTaskUpdateOpen(true);
                              }}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 size={13} />
                              <span>Complete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <CheckSquare size={22} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Active Tasks Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Create clear tasks for your department to assign responsible engineers, log session hours, and achieve handover readiness.
              </p>
              {isCallerDept && (
                <button
                  onClick={() => {
                    setTaskAssigneeInput(ownership?.assignedUser || deptUserCandidates[0] || '');
                    setAddTaskOpen(true);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  <span>Create First Task</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. JOB DOCUMENTS (Stored in PostgreSQL pgAdmin 4 job_documents table) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-gradient-to-r from-slate-50/70 to-white">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white shadow-xs">
                <Folder size={16} />
              </span>
              <h3 className="text-base font-black text-slate-900 tracking-tight">
                4. Job Documents & Drawings
              </h3>
              <span className="text-xs font-semibold text-slate-400">
                ({workflowState?.documents?.length || 0} Files in pgAdmin 4)
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Job-level information stored in PostgreSQL table <code className="text-indigo-600 font-bold">job_documents</code>. Sender selects documents during Handover; receiving department gets instant access.
            </p>
          </div>

          <button
            onClick={() => setUploadDocOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
          >
            <Upload size={14} />
            <span>+ Upload Document</span>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          {workflowState?.documents && workflowState.documents.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                    <th className="py-2.5 px-3">File Name</th>
                    <th className="py-2.5 px-3">Document Type</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Uploaded By</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workflowState.documents.map((doc) => (
                    <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-800 flex items-center gap-2">
                        <FileText size={16} className="text-blue-600 shrink-0" />
                        <span className="truncate max-w-xs" title={doc.fileName || doc.originalName}>
                          {doc.fileName || doc.originalName}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                          {doc.documentType}
                        </span>
                      </td>
                      <td className="py-3 px-3 capitalize font-semibold text-slate-600">
                        {doc.department}
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {doc.uploadedBy}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">
                        {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <a
                          href={doc.fileUrl || `/uploads/${job.id}/${doc.fileName}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-slate-100 text-blue-600 hover:text-blue-800 font-bold rounded-lg border border-slate-200 shadow-2xs transition-all"
                        >
                          <Download size={12} />
                          <span>View / Download</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <FileText size={22} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Job Documents Attached</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Upload customer drawings, SLD, Bill of Materials (BOM), or purchase orders. All documents are stored in pgAdmin 4 PostgreSQL.
              </p>
              <button
                onClick={() => setUploadDocOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Upload size={14} />
                <span>Upload First Document</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. STRUCTURED JOB SPECIFICATIONS & COMMERCIAL DETAILS */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Technical Specifications */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-blue-50 text-blue-600"><Cpu size={14} /></div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
                5. Technical Specifications
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
                Commercial & Order Details
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
                    {h.responsibleEnggName && (
                      <span className="ml-2 text-indigo-700 font-semibold">• Resp Engg: {h.responsibleEnggName}</span>
                    )}
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

      {/* Task Update Modal (Strictly Zero Sliders) */}
      {taskUpdateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">
                {isCompletingTask ? 'Complete Task' : 'Log Hours & Update Status'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold">{editingTask?.taskName || myTask?.taskName || 'Department Task'}</p>
            </div>
            <form onSubmit={handleSaveTask} className="space-y-3.5">
              {/* Effort Breakdown */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-center text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Planned</span>
                  <span className="font-black text-slate-800">{editingTask?.estimatedEffort || myTask?.estimatedEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Actual Logged</span>
                  <span className="font-black text-blue-600">{editingTask?.actualEffort || myTask?.actualEffort || 0}h</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Remaining</span>
                  <span className="font-black text-amber-600">
                    {Math.max(0, Number((editingTask || myTask)?.estimatedEffort || 0) - Number((editingTask || myTask)?.actualEffort || 0))}h
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Session Hours Worked (adds to total logged effort)
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
                    required
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Session Notes / Completion Remarks</label>
                <textarea
                  rows={2}
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder="Details of work performed in this session..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setTaskUpdateOpen(false);
                    setEditingTask(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className={`px-5 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer ${
                    isCompletingTask ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isCompletingTask ? 'Confirm Completed' : 'Save Session'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {addTaskOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">+ Add Department Task</h3>
              <p className="text-xs text-slate-500">Define a real execution task for {ownership?.department}.</p>
            </div>
            <form onSubmit={handleAddTaskSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Task Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={taskNameInput}
                  onChange={(e) => setTaskNameInput(e.target.value)}
                  placeholder="e.g. Prepare SLD / Schematics Drawing"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Assigned User</label>
                  <select
                    value={taskAssigneeInput}
                    onChange={(e) => setTaskAssigneeInput(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                  >
                    <option value="">-- Choose Member --</option>
                    {deptUserCandidates.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Planned Effort (Hours)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    value={taskEstimatedEffortInput}
                    onChange={(e) => setTaskEstimatedEffortInput(e.target.value)}
                    placeholder="4"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Target Due Date</label>
                <input
                  type="date"
                  value={taskTargetDateInput}
                  onChange={(e) => setTaskTargetDateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Instructions / Description</label>
                <textarea
                  rows={2}
                  value={taskInstructionsInput}
                  onChange={(e) => setTaskInstructionsInput(e.target.value)}
                  placeholder="Specific technical criteria or scope..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAddTaskOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Document Modal (pgAdmin 4 job_documents table) */}
      {uploadDocOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">+ Upload Job Document</h3>
              <p className="text-xs text-slate-500">Stored in PostgreSQL table <code className="text-indigo-600 font-bold">job_documents</code>.</p>
            </div>
            <form onSubmit={handleUploadDocSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Select File <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  onChange={(e) => setDocFile(e.target.files[0] || null)}
                  accept=".pdf,.dwg,.dxf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 file:mr-3 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Document Category / Type</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="CUSTOMER_DRAWING">Customer Drawing / SLD</option>
                  <option value="BOM">Bill of Materials (BOM)</option>
                  <option value="PO">Purchase Order (PO)</option>
                  <option value="PANEL_SPECIFICATION">Technical Specification</option>
                  <option value="TEST_REPORT">Test Report / QC Document</option>
                  <option value="GENERAL">General Job Document</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadDocOpen(false);
                    setDocFile(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !docFile}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer disabled:bg-slate-300"
                >
                  {actionLoading ? 'Uploading...' : 'Upload Document'}
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

      {/* Reassign Engineer Modal */}
      {reassignModalOpen && (
        <ReassignEngineerModal
          job={job}
          isOpen={reassignModalOpen}
          onClose={() => setReassignModalOpen(false)}
          onSuccess={async (updatedJob) => {
            setJob(prev => ({ ...prev, ...updatedJob }));
            await fetchWorkflowState();
            setReassignModalOpen(false);
          }}
        />
      )}

      {/* Re-Handover Modal */}
      {reHandoverModalOpen && (
        <ReHandoverModal
          job={job}
          isOpen={reHandoverModalOpen}
          onClose={() => setReHandoverModalOpen(false)}
          onSuccess={async (updatedJob) => {
            setJob(prev => ({ ...prev, ...updatedJob }));
            await fetchWorkflowState();
            setReHandoverModalOpen(false);
          }}
        />
      )}

    </div>
  );
}
