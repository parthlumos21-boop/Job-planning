import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ArrowLeft, Edit3, ArrowRightLeft, Send, CheckCircle2, Clock, AlertTriangle,
  Briefcase, Calendar, UserCheck, Layers, FileText, ShoppingCart, History,
  ShieldCheck, Phone, MapPin, Truck, Package, Eye, ChevronRight, RefreshCw,
  CheckSquare, Plus
} from 'lucide-react';
import { cleanJobNo, getHandoverAccountability, isMarketingUser, isMarketingLead } from '../config/marketingFormConfig';
import SimpleHandoverModal from './SimpleHandoverModal';
import MarketingTaskModal from './marketing/MarketingTaskModal';

const STAGE_STEPS = [
  { key: 'MARKETING', label: '1. Marketing Entry' },
  { key: 'DESIGN', label: '2. Design Review' },
  { key: 'PURCHASE', label: '3. Procurement' },
  { key: 'PRODUCTION', label: '4. Production & QC' },
  { key: 'DISPATCH', label: '5. Dispatch' }
];

export default function UserJobDetail({ onSwitchToAdmin }) {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'marketing', 'po', 'schedule', 'dept', 'history'
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [historyEvents, setHistoryEvents] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [jobTasks, setJobTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase() === 'keval v shah';
  const isMktUser = isMarketingUser(user);
  const isLead = isMarketingLead(user);

  const fetchJob = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/jobs/${id}`);
      setJob(res.data);
    } catch (err) {
      console.error('Failed to fetch job:', err);
      if (err.response?.status === 403) {
        setError('You are not authorized to access this job record.');
      } else if (err.response?.status === 404) {
        setError('Job record not found.');
      } else {
        setError(err.response?.data?.detail || 'Failed to load job details.');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/jobs/${id}/handover/history`);
      setHistoryEvents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.warn('Could not load history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const fetchJobTasks = async () => {
    try {
      setTasksLoading(true);
      const res = await api.get(`/marketing/tasks/jobs/${id}`);
      setJobTasks(res.data?.tasks || []);
    } catch (err) {
      console.warn('Could not load job marketing tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchJob();
      fetchHistory();
      fetchJobTasks();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-indigo-600" />
        <p className="text-sm font-semibold">Loading My Job Details...</p>
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
          Please verify that you have permission to view this job record or check your assigned jobs.
        </p>
        <button
          onClick={() => navigate('/my-jobs')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
        >
          <ArrowLeft size={14} /> Back to My Jobs
        </button>
      </div>
    );
  }

  const handoverInfo = getHandoverAccountability(job);
  const isHandedOver = (job.handoverStatus || '').toLowerCase().includes('submitted');
  const isCompleted = (job.lifecycleStatus || '').toLowerCase() === 'completed' || job.actualEndAt !== null;

  // Determine current active pipeline stage
  let activeStageKey = 'MARKETING';
  if (isCompleted) {
    activeStageKey = 'DISPATCH';
  } else if ((job.targetDepartment || '').toLowerCase() === 'design' || isHandedOver) {
    activeStageKey = 'DESIGN';
  } else if ((job.targetDepartment || '').toLowerCase() === 'purchase') {
    activeStageKey = 'PURCHASE';
  } else if ((job.targetDepartment || '').toLowerCase() === 'production') {
    activeStageKey = 'PRODUCTION';
  }

  // Next required action prompt
  const nextActionText = isCompleted
    ? 'Job has been completed and dispatched successfully.'
    : isHandedOver
    ? `Technical package handed over to Design by ${handoverInfo?.submittedBy || 'Marketing'}. Awaiting Design acceptance.`
    : job.dataGivenToDesign
    ? `Data Given to Design date recorded (${job.dataGivenToDesign}). Click 'Handover to Design' to transfer responsibility.`
    : 'Complete customer specifications, PO details, and submit Handover to Design.';

  const canEdit = isMktUser || isAdmin || isLead;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header & Breadcrumb */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <button
            onClick={() => navigate('/my-jobs')}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-800 shrink-0 mt-0.5"
            title="Back to My Jobs"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Job {cleanJobNo(job.jobNo)}
              </h1>
              <span className="text-slate-300">•</span>
              <span className="text-sm sm:text-base font-bold text-slate-800 truncate max-w-xs sm:max-w-md">
                {job.panelName || 'Standard Panel'}
              </span>

              {/* Status Badge */}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isCompleted
                  ? 'bg-emerald-100 text-emerald-800'
                  : isHandedOver
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {job.handoverStatus || (isCompleted ? 'Completed' : 'In Marketing')}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-1 font-medium">
              Customer: <strong className="text-slate-800">{job.clientName || 'General Client'}</strong>
              {job.projectName && <span> • Project: <strong className="text-slate-800">{job.projectName}</strong></span>}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
          {isAdmin && onSwitchToAdmin && (
            <button
              onClick={onSwitchToAdmin}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
            >
              Switch to Planning Lead View
            </button>
          )}

          {canEdit && (
            <button
              onClick={() => navigate(`/jobs/edit/${job.id}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl border border-blue-200 transition-all shadow-xs"
            >
              <Edit3 size={14} />
              <span>Edit Details</span>
            </button>
          )}

        </div>
      </div>

      {/* Quick Summary Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Customer</p>
          <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{job.clientName || '—'}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Industry</p>
          <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{job.typeOfIndustries || '—'}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Quantity</p>
          <p className="text-xs font-black text-slate-800 mt-0.5">{job.qty || 1} Unit(s)</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Responsible Engg</p>
          <p className="text-xs font-bold text-indigo-700 truncate mt-0.5">{job.responsibleEnggName || 'Unassigned'}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Original Date</p>
          <p className="text-xs font-semibold text-slate-700 mt-0.5">{job.poDate || job.date || '—'}</p>
        </div>
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <p className="text-[10px] uppercase font-bold text-slate-400">Expected Date</p>
          <p className="text-xs font-black text-slate-900 mt-0.5">{job.deliveryDate || (job.stageDueDate ? job.stageDueDate.slice(0, 10) : '—')}</p>
        </div>
      </div>

      {/* Main Responsive Workspace: 2 Columns on Desktop, 1 Column on Tablet/Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: 6 Responsive Tabs Workspace (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          {/* Tabs Navigation */}
          <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs flex items-center gap-1 overflow-x-auto">
            {[
              { id: 'overview', label: '1. Overview', icon: Layers },
              { id: 'marketing', label: '2. Marketing Details', icon: Briefcase },
              { id: 'po', label: '3. Purchase Order', icon: ShoppingCart },
              { id: 'schedule', label: '4. Schedule', icon: Calendar },
              ...((!isMktUser || isAdmin) ? [{ id: 'dept', label: '5. Department Work', icon: UserCheck }] : []),
              { id: 'history', label: '6. History', icon: History },
              ...((isMktUser || isAdmin) ? [{ id: 'tasks', label: `Tasks (${jobTasks.length})`, icon: CheckSquare }] : [])
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    activeTab === t.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon size={14} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-6 animate-in fade-in">
              {/* Stepper */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Workflow Lifecycle Pipeline</h3>
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  {STAGE_STEPS.map((step, idx) => {
                    const stepOrder = STAGE_STEPS.findIndex(s => s.key === activeStageKey);
                    const isPassed = idx < stepOrder;
                    const isCurrent = step.key === activeStageKey;

                    return (
                      <div key={step.key} className="flex items-center gap-2 shrink-0">
                        <div className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                          isCurrent
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : isPassed
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                            : 'bg-slate-50 text-slate-400 border-slate-200'
                        }`}>
                          {step.label}
                        </div>
                        {idx < STAGE_STEPS.length - 1 && <ChevronRight size={14} className="text-slate-300" />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Next Action Callout */}
              <div className="p-4 bg-indigo-50/80 border border-indigo-100 rounded-xl">
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">Next Action</span>
                <p className="text-xs font-semibold text-indigo-950 mt-1">{nextActionText}</p>
              </div>

              {/* Core Glance Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Project Name</span>
                  <p className="text-sm font-bold text-slate-900">{job.projectName || '—'}</p>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Panel Name & Rating</span>
                  <p className="text-sm font-bold text-slate-900">{job.panelName || '—'}</p>
                  {job.incomerRating && <p className="text-xs text-slate-500 font-medium">Incomer: {job.incomerRating}</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: MARKETING DETAILS */}
          {activeTab === 'marketing' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Marketing & Commercial Details</h3>
                <span className="text-xs text-slate-400 font-medium">14 Fields Verified</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Panel Name</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.panelName || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Quantity</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.qty || 1}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Industry Type</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.typeOfIndustries || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Project Name</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.projectName || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Customer Name</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.clientName || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Panel Type</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.typeOfPanel || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Responsible Engineer</span>
                  <span className="font-bold text-indigo-700 mt-0.5 block">{job.responsibleEnggName || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Contact Person</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.contactPerson || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Contact Number</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{(job.fields?.marketing || {})['Contact Number'] || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Transportation Details</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{(job.fields?.marketing || {})['Transportation'] || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Packing Requirements</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{(job.fields?.marketing || {})['Packing'] || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Inspection Call Date</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{(job.fields?.marketing || {})['Inspection Call date'] || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Data Given to Design</span>
                  <span className="font-bold text-indigo-700 mt-0.5 block">{job.dataGivenToDesign || '—'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Marketing Remarks</span>
                  <span className="font-medium text-slate-800 mt-0.5 block">{(job.fields?.marketing || {})['Marketing Remarks'] || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PURCHASE ORDER */}
          {activeTab === 'po' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Purchase Order & Commercial Commitments</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Purchase Order Number</span>
                  <span className="font-black text-slate-900 mt-0.5 block text-sm">{job.poNo || '—'}</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Purchase Order Date</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.poDate || '—'}</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Delivery Period</span>
                  <span className="font-bold text-slate-900 mt-0.5 block">{job.deliveryPeriod || '—'}</span>
                </div>
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Delivery Date as per PO</span>
                  <span className="font-bold text-indigo-700 mt-0.5 block">{job.deliveryDate || '—'}</span>
                </div>
                <div className="sm:col-span-2 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Delivery Address</span>
                  <span className="font-medium text-slate-800 mt-0.5 block">{job.deliveryAddress || '—'}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SCHEDULE */}
          {activeTab === 'schedule' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Schedule & Date Accountability</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Original Planned Date</span>
                  <span className="text-sm font-black text-slate-900 mt-1 block">{job.poDate || job.date || '—'}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">First planned baseline commitment</p>
                </div>
                <div className="p-4 bg-indigo-50/60 rounded-xl border border-indigo-100">
                  <span className="text-indigo-600 block font-bold uppercase tracking-wider text-[10px]">Current Expected Date</span>
                  <span className="text-sm font-black text-indigo-950 mt-1 block">{job.deliveryDate || (job.stageDueDate ? job.stageDueDate.slice(0, 10) : '—')}</span>
                  <p className="text-[11px] text-indigo-600 mt-0.5">Active delivery target date</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-400 block font-bold uppercase tracking-wider text-[10px]">Actual Completed Date</span>
                  <span className="text-sm font-black text-slate-900 mt-1 block">{job.actualEndAt ? job.actualEndAt.slice(0, 10) : '—'}</span>
                  <p className="text-[11px] text-slate-400 mt-0.5">{job.actualEndAt ? 'Final release date' : 'Active job'}</p>
                </div>
              </div>

              {job.assignmentExplanation && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-amber-900">Delay Reason / Note:</span>
                  <p className="text-amber-800">{job.assignmentExplanation}</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DEPARTMENT WORK */}
          {activeTab === 'dept' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Department Work Progress</h3>
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Holding Department:</span>
                  <span className="font-bold text-slate-900 uppercase">{job.targetDepartment || 'Marketing'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Active Worker / Lead:</span>
                  <span className="font-bold text-indigo-700">{job.responsibleEnggName || 'Not Assigned'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Workflow Stage:</span>
                  <span className="font-bold text-slate-800">{job.currentStage || 'INCOMING'}</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-3">Handover & Activity History</h3>
              {historyLoading ? (
                <div className="py-8 text-center text-slate-400 text-xs">Loading history events...</div>
              ) : historyEvents.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">No formal handover history recorded yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {historyEvents.map((h, idx) => (
                    <div key={h.id || idx} className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-bold text-indigo-900">{h.reason || h.handover_type || 'Handover Action'}</span>
                        <span className="text-[11px] text-slate-400">
                          {h.handover_at ? new Date(h.handover_at).toLocaleString() : ''}
                        </span>
                      </div>
                      <p className="text-slate-700">Performed By: <span className="font-bold text-slate-900">{h.performed_by || 'Marketing User'}</span></p>
                      {h.notes && <p className="text-slate-500 text-[11px] italic">Note: "{h.notes}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 7: MARKETING TASKS */}
          {activeTab === 'tasks' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Marketing Tasks for this Job</h3>
                  <p className="text-xs text-slate-500">Tasks linked to this job record and readiness requirements.</p>
                </div>
                <button
                  onClick={() => setTaskModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all"
                >
                  <Plus size={14} />
                  <span>Add Task</span>
                </button>
              </div>

              {tasksLoading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading tasks...</div>
              ) : jobTasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-700">No tasks created for this job yet.</p>
                  <p className="text-[11px]">Click "Add Task" to track work required for this job.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {jobTasks.map((t) => (
                    <div key={t.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 transition-colors">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-xs">{t.title}</span>
                          {t.is_mandatory_for_readiness && (
                            <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-black uppercase border border-amber-300">
                              Readiness Blocker
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            t.status === 'Completed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                            t.status === 'Blocked' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                            'bg-blue-50 text-blue-800 border-blue-200'
                          }`}>
                            {t.status}
                          </span>
                        </div>
                        {t.description && <p className="text-[11px] text-slate-500">{t.description}</p>}
                        <div className="text-[10px] text-slate-400 flex items-center gap-3">
                          <span>Target: <b className="text-slate-700">{t.target_date}</b></span>
                          <span>Est: <b className="text-slate-700">{t.estimated_effort} {t.effort_unit}</b></span>
                          <span>Act: <b className="text-emerald-700">{t.actual_effort || 0} {t.effort_unit}</b></span>
                          <span>Assigned: <b className="text-slate-700">{t.assigned_to_name}</b></span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Column: Personalized "My Work" Side Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 sticky top-6">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">My Assignment</span>
              <h3 className="text-sm font-black text-slate-900 mt-0.5">My Work & Handover</h3>
            </div>

            {/* Current Holding Badge */}
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1 text-xs">
              <span className="text-[10px] font-bold text-indigo-800 uppercase">Current Status</span>
              <p className="font-black text-indigo-950 text-sm">
                {job.handoverStatus || (isCompleted ? 'Completed' : 'In Marketing')}
              </p>
              <p className="text-[11px] text-indigo-700">
                Department: <strong>{job.targetDepartment || 'Marketing'}</strong>
              </p>
            </div>

            {/* Submitter Accountability Strip */}
            {handoverInfo && handoverInfo.submittedBy ? (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs space-y-1">
                <span className="text-[10px] font-bold text-emerald-800 uppercase">Handover Confirmed</span>
                <p className="text-slate-800">
                  By: <strong className="text-emerald-950">{handoverInfo.submittedBy}</strong>
                </p>
                <p className="text-[11px] text-slate-600">On: {handoverInfo.submittedAt}</p>
                <p className="text-[11px] text-slate-600">Target: {handoverInfo.toDept}</p>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              {canEdit && (
                <button
                  onClick={() => navigate(`/jobs/edit/${job.id}`)}
                  className="w-full py-2.5 px-4 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all"
                >
                  Update My Details
                </button>
              )}

              {!isCompleted && (
                <button
                  onClick={() => setHandoverModalOpen(true)}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5"
                >
                  <Send size={13} />
                  <span>Handover to Design →</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Simple Handover Modal */}
      {handoverModalOpen && (
        <SimpleHandoverModal
          job={job}
          isOpen={handoverModalOpen}
          onClose={() => setHandoverModalOpen(false)}
          onSuccess={(updated) => {
            setJob(prev => ({ ...prev, ...updated }));
            fetchJob();
            fetchHistory();
          }}
        />
      )}

      {/* Marketing Task Modal */}
      {taskModalOpen && (
        <MarketingTaskModal
          isOpen={taskModalOpen}
          onClose={() => setTaskModalOpen(false)}
          onSaved={() => {
            fetchJobTasks();
            fetchJob();
          }}
          initialJobId={job.id}
          currentUser={user}
        />
      )}
    </div>
  );
}
