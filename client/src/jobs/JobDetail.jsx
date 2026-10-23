import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ArrowLeft, FileSpreadsheet, FileText, Loader2, Download, BarChart2,
  ArrowRightLeft, User, ShieldCheck, CheckCircle2, Clock, AlertTriangle,
  History, ChevronDown, ChevronUp, Paperclip, CheckSquare, Square,
  UserCheck, RefreshCw, AlertCircle, Send, Play, Layers, Calendar,
  Upload, FileCheck, HelpCircle, Check, X, Eye
} from 'lucide-react';
import { buildJobProgressData, DEPARTMENT_PROGRESS } from './jobProgress';
import ExcelTable from '../components/ExcelTable';
import {
  AssignOwnerModal, ReassignOwnerModal, ClarificationModal,
  CorrectionModal, ReleaseModal
} from './ControlCenterModals';
import DepartmentHandoverModal from './DepartmentHandoverModal';
import SimpleHandoverModal from './SimpleHandoverModal';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import UserJobDetail from './UserJobDetail';
import { cleanJobNo, getHandoverAccountability, isMarketingUser } from '../config/marketingFormConfig';
import { getHandoverBadge } from '../config/workflowConfig';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

const STAGE_STEPS = [
  { key: 'INCOMING', label: '1. Incoming' },
  { key: 'VERIFICATION', label: '2. Verification' },
  { key: 'PLANNING_READY', label: '3. Planning Ready' },
  { key: 'PLANNING_ASSIGNED', label: '4. Assigned' },
  { key: 'PLANNING_ACTIVE', label: '5. Planning Active' },
  { key: 'RELEASED', label: '6. Released' }
];

const CHECKLIST_ITEMS = [
  { key: 'jobNumberVerified', label: 'Job Number & Scope Verified', mandatory: true },
  { key: 'poDateVerified', label: 'PO Date & Commercial Terms Confirmed', mandatory: true },
  { key: 'panelSpecsConfirmed', label: 'Panel Specifications & Quantity Confirmed', mandatory: true },
  { key: 'engineerAssigned', label: 'Responsible Engineer Formally Assigned', mandatory: true },
  { key: 'designDrawingsAttached', label: 'Design SLD / Technical Specs Attached', mandatory: true },
  { key: 'deliveryDateFeasible', label: 'Customer Delivery Date Feasible & Agreed', mandatory: false }
];

const safeFileName = (name) => String(name || '').replace(/[^a-z0-9]/gi, '_').toLowerCase();

export default function JobDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'readiness', 'checklist', 'responsibility', 'timeline', 'documents'
  const [timelineData, setTimelineData] = useState({ events: [], stageDurations: {} });
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState('ALL');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  // Modals state
  const [modalState, setModalState] = useState({
    assignOpen: false,
    reassignOpen: false,
    clarificationOpen: false,
    correctionOpen: false,
    releaseOpen: false,
    universalOpen: false
  });
  const [simpleHandoverOpen, setSimpleHandoverOpen] = useState(false);

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';
  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || isKeval;
  const isMktUser = isMarketingUser(user);

  // Default to UserJobDetail for department users; admin can toggle
  const [viewMode, setViewMode] = useState(!isAdmin ? 'user' : 'admin');

  const isStrictMarketingUser = isMarketingUser(user) && !isAdmin;
  const hasMarketingAccess = isAdmin || user?.departments?.includes('marketing') || isStrictMarketingUser;
  const hasOtherAccess = !isStrictMarketingUser && (isAdmin || (user?.departments && user.departments.some(d => d !== 'marketing')));

  useEffect(() => {
    if (viewMode === 'admin') {
      fetchJob();
      fetchTimeline();
    }
    // eslint-disable-next-line
  }, [id, viewMode]);

  if (viewMode === 'user') {
    return (
      <UserJobDetail
        onSwitchToAdmin={isAdmin ? () => setViewMode('admin') : null}
      />
    );
  }

  const fetchJob = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/jobs/${id}`);
      setJob(res.data);
    } catch (err) {
      console.error('Failed to fetch job:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTimeline = async () => {
    try {
      setTimelineLoading(true);
      const res = await api.get(`/jobs/${id}/control/timeline`);
      setTimelineData({
        events: res.data?.events || [],
        stageDurations: res.data?.stageDurations || {}
      });
    } catch (err) {
      console.warn('Could not load timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const handleJobUpdated = (jobId, department, field, value) => {
    setJob(prevJob => {
      if (!prevJob) return prevJob;
      const isCore = department === 'marketing';
      const updated = {
        ...prevJob,
        allDepartmentsData: {
          ...(prevJob.allDepartmentsData || {}),
          [department]: {
            ...((prevJob.allDepartmentsData || {})[department] || {}),
            [field]: value
          }
        },
        fields: {
          ...(prevJob.fields || {}),
          [department]: {
            ...((prevJob.fields || {})[department] || {}),
            [field]: value
          }
        }
      };

      if (isCore) {
        updated[field] = value;
        if (field === 'Job No.' || field === 'jobNo') updated.jobNo = value;
        if (field === 'Name of Panel' || field === 'panelName') updated.panelName = value;
        if (field === 'Customer Name' || field === 'clientName') updated.clientName = value;
        if (field === 'Responsible Engg. Name' || field === 'responsibleEnggName') updated.responsibleEnggName = value;
        if (field === 'Project Name' || field === 'projectName') updated.projectName = value;
        if (field === 'Qty.' || field === 'qty') updated.qty = value;
        if (field === 'Purchase Order' || field === 'poNo') updated.poNo = value;
        if (field === 'Purchase Order Date' || field === 'poDate') updated.poDate = value;
        if (field === 'Type of Industries' || field === 'typeOfIndustries') updated.typeOfIndustries = value;
        if (field === 'Type of Panel' || field === 'typeOfPanel') updated.typeOfPanel = value;
        if (field === 'Incomer Rating' || field === 'incomerRating') updated.incomerRating = value;
      }

      return updated;
    });
  };

  // Toggle checklist verification item
  const handleToggleChecklist = async (itemKey, currentVerified) => {
    try {
      const res = await api.post(`/jobs/${id}/control/verify-item`, {
        itemKey,
        verified: !currentVerified
      });
      if (res.data?.job) {
        setJob(prev => ({ ...prev, ...res.data.job }));
        fetchTimeline();
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update checklist verification');
    }
  };

  // Start Planning Action
  const handleStartPlanning = async () => {
    try {
      const res = await api.post(`/jobs/${id}/control/start-planning`);
      if (res.data?.job) {
        setJob(prev => ({ ...prev, ...res.data.job }));
        fetchTimeline();
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start planning');
    }
  };

  // File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !job?.id) return;
    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/jobs/${job.id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.attachments) {
        setJob(prev => ({ ...prev, attachments: res.data.attachments }));
        fetchTimeline();
      }
    } catch (err) {
      console.error('File upload failed:', err);
      alert('File upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleModalSuccess = (updatedJob) => {
    if (updatedJob) {
      setJob(prev => ({ ...prev, ...updatedJob }));
    } else {
      fetchJob();
    }
    fetchTimeline();
  };

  // Export functions
  const downloadProgressPDF = () => {
    if (!job) return;
    const progressData = buildJobProgressData(job);
    const rows = progressData.map(item => [item.name, item.filled, Math.max(item.total - item.filled, 0), item.total, `${item.progress}%`]);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(20);
    doc.text('Job Planning Control Center - Progress Report', pageWidth / 2, 25, { align: 'center' });
    doc.setFontSize(13);
    doc.text(`Job No: ${job.jobNo || ''} • Panel: ${job.panelName || ''}`, pageWidth / 2, 35, { align: 'center' });
    doc.text(`Responsible Engg: ${job.responsibleEnggName || 'Unassigned'} • Planning Owner: ${job.planningOwnerName || 'Unassigned'}`, pageWidth / 2, 43, { align: 'center' });

    doc.autoTable({
      startY: 55,
      head: [['Department', 'Filled', 'Remaining', 'Total', 'Complete']],
      body: rows,
      styles: { fontSize: 12, cellPadding: 5 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
    doc.save(`job_planning_${safeFileName(job.jobNo || id)}.pdf`);
  };

  const downloadProgressExcel = async () => {
    if (!job) return;
    try {
      const jobId = job.id || job._id;
      const res = await api.get(`/export/xlsx?ids=${jobId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `job_${safeFileName(job.jobNo || jobId)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Failed to download Excel report');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-xs text-slate-500">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
        <span>Loading Control Center Job Workspace...</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 shadow-xs max-w-lg mx-auto my-12">
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle size={24} className="text-slate-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800">Job Not Found</h3>
        <p className="text-xs text-slate-500 mt-1">
          This job does not exist or has been permanently removed.
        </p>
        <button
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const currentStage = (job.currentStage || 'INCOMING').toUpperCase();
  const isClarification = currentStage === 'NEEDS_CLARIFICATION';

  // Compute readiness score
  const readinessChecks = [
    { label: 'Job Identifiers & Panel Code', ok: Boolean(job.jobNo && job.panelName) },
    { label: 'Client & Project Details', ok: Boolean(job.clientName) },
    { label: 'Commercial PO Date Verified', ok: Boolean(job.poDate) },
    { label: 'Responsible Engineer Assigned', ok: Boolean(job.responsibleEnggName) },
    { label: 'Planning Owner Assigned', ok: Boolean(job.planningOwnerName) },
    { label: 'Checklist Verification', ok: Boolean(job.handoverChecklist && Object.values(job.handoverChecklist).filter(Boolean).length >= 4) }
  ];
  const readinessCount = readinessChecks.filter(c => c.ok).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* TOP COMMAND HEADER */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/jobs/handover')}
            className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-500 hover:text-slate-800 mt-0.5"
            title="Return to Planning Control Center"
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Job {cleanJobNo(job.jobNo) || 'Draft Job'}
              </h1>
              <span className="text-slate-300">•</span>
              <span className="text-base font-bold text-slate-800">
                {job.panelName}
              </span>
              <span className="px-3 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Stage: {currentStage.replace('_', ' ')}
              </span>
              {job.priority && (
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                  job.priority === 'Urgent' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                  job.priority === 'High' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {job.priority}
                </span>
              )}
            </div>

            <p className="text-xs font-medium text-slate-500 mt-1">
              Customer: <strong className="text-slate-800">{job.clientName || 'General Client'}</strong>
              {job.projectName && <span> • Project: <strong className="text-slate-800">{job.projectName}</strong></span>}
            </p>

            {/* Responsibility Strip */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                <User size={13} className="text-slate-400" />
                Responsible Engg: <strong>{job.responsibleEnggName || 'Unassigned'}</strong>
              </span>

              {job.planningOwnerName ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <ShieldCheck size={13} className="text-indigo-600" />
                  Planning Owner: <strong>{job.planningOwnerName}</strong>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                  <Clock size={13} className="text-amber-600" />
                  Planning Owner: <em>Unassigned</em>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <button
              onClick={() => setViewMode('user')}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-all"
            >
              <Eye size={13} />
              <span>Switch to My Job View</span>
            </button>
          )}

          {!job.planningOwnerName ? (
            <button
              onClick={() => setModalState(prev => ({ ...prev, assignOpen: true }))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all"
            >
              <UserCheck size={14} />
              <span>Assign Owner</span>
            </button>
          ) : (
            <button
              onClick={() => setModalState(prev => ({ ...prev, reassignOpen: true }))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <RefreshCw size={13} />
              <span>Reassign Owner</span>
            </button>
          )}

          {currentStage === 'PLANNING_ASSIGNED' && (
            <button
              onClick={handleStartPlanning}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md shadow-purple-500/20 transition-all"
            >
              <Play size={14} />
              <span>Start Planning</span>
            </button>
          )}

          {isClarification ? (
            <button
              onClick={() => setModalState(prev => ({ ...prev, correctionOpen: true }))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all"
            >
              <CheckCircle2 size={14} />
              <span>Submit Correction</span>
            </button>
          ) : (
            <button
              onClick={() => setModalState(prev => ({ ...prev, clarificationOpen: true }))}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-rose-50 border border-slate-200 text-slate-600 hover:text-rose-700 font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              <AlertCircle size={14} />
              <span>Clarification</span>
            </button>
          )}

          {currentStage === 'PLANNING_ACTIVE' && (
            <button
              onClick={() => setModalState(prev => ({ ...prev, releaseOpen: true }))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all"
            >
              <Send size={14} />
              <span>Release & Forward</span>
            </button>
          )}

          <button
            onClick={downloadProgressExcel}
            className="flex items-center gap-1 px-3 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-xl border border-emerald-200 transition-colors"
            title="Download Excel"
          >
            <FileSpreadsheet size={14} />
            <span>XLS</span>
          </button>
          <button
            onClick={downloadProgressPDF}
            className="flex items-center gap-1 px-3 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold text-xs rounded-xl border border-red-200 transition-colors"
            title="Download PDF"
          >
            <FileText size={14} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* LIFECYCLE PROGRESS STEPPER */}
      <div className="bg-white px-6 py-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between overflow-x-auto pb-1 gap-2">
          {STAGE_STEPS.map((st, idx) => {
            const stepOrder = STAGE_STEPS.findIndex(s => s.key === currentStage);
            const isCompleted = idx < stepOrder || currentStage === 'RELEASED';
            const isCurrent = st.key === currentStage;

            return (
              <div key={st.key} className="flex items-center gap-2 shrink-0">
                <div className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                  isCurrent
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                    : isCompleted
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                    : 'bg-slate-50 text-slate-400 border-slate-200'
                }`}>
                  {isCompleted ? <Check size={14} className="stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-current opacity-70" />}
                  <span>{st.label}</span>
                </div>
                {idx < STAGE_STEPS.length - 1 && (
                  <span className="text-slate-300 font-bold">→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* WHY WAITING CALLOUT BANNER */}
      {job.currentWaitingReason && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <Clock className="text-amber-600 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
              Why is this job currently waiting?
            </h4>
            <p className="text-xs text-amber-900 mt-0.5 font-medium">
              {job.currentWaitingReason}
            </p>
          </div>
        </div>
      )}

      {/* RETURNED / CLARIFICATION BANNER */}
      {isClarification && job.handoverReturnReason && (
        <div className="bg-rose-50 border border-rose-300 rounded-2xl p-4 flex items-start gap-3 shadow-xs">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-rose-900">Job Returned for Technical Clarification</h4>
            <p className="text-xs text-rose-800 mt-1 whitespace-pre-wrap font-medium">
              {job.handoverReturnReason}
            </p>
            <button
              onClick={() => setModalState(prev => ({ ...prev, correctionOpen: true }))}
              className="mt-2.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
            >
              Address Issues & Submit Correction →
            </button>
          </div>
        </div>
      )}

      {/* 6 DEDICATED WORKSPACE TABS */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {[
          { id: 'overview', label: '1. Overview & Work', icon: Layers },
          { id: 'readiness', label: '2. Planning Readiness', count: `${readinessCount}/6`, icon: ShieldCheck },
          { id: 'checklist', label: '3. Checklist Verification', icon: CheckSquare },
          { id: 'responsibility', label: '4. Responsibility Chain', icon: UserCheck },
          { id: 'timeline', label: '5. Activity Timeline & Audit', icon: History },
          { id: 'documents', label: '6. Documents & Specs', count: job.attachments?.length || 0, icon: Paperclip }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-500/20'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB CONTENT AREAS */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Core Job Details Section (Marketing / Admin only) */}
          {hasMarketingAccess && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Core Job & Commercial Specifications
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Editable by Marketing & System Admin</span>
              </div>
              <div className="p-4">
                <ExcelTable jobs={[job]} onJobUpdated={handleJobUpdated} user={user} hideActions={true} filterDepartments={['marketing']} />
              </div>
            </div>
          )}

          {/* Operational Department Sections */}
          {hasOtherAccess && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                  Engineering & Operational Planning Sections
                </span>
                <span className="text-[11px] text-slate-400 font-medium">Isolated departmental editing</span>
              </div>
              <div className="p-4">
                <ExcelTable jobs={[job]} onJobUpdated={handleJobUpdated} user={user} hideActions={true} filterDepartments={['design', 'mechanical', 'purchase', 'production', 'dispatch', 'qc']} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PLANNING READINESS */}
      {activeTab === 'readiness' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Planning Readiness Assessment</h3>
              <p className="text-xs text-slate-500">Evaluates whether this job has all mandatory prerequisites before planning execution.</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-indigo-600">{readinessCount} / 6</span>
              <span className="text-xs text-slate-400 block font-bold uppercase tracking-wider">Criteria Ready</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {readinessChecks.map((chk, i) => (
              <div key={i} className={`p-4 rounded-xl border flex items-center justify-between ${
                chk.ok ? 'bg-emerald-50/50 border-emerald-200' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl text-white ${chk.ok ? 'bg-emerald-600' : 'bg-slate-400'}`}>
                    {chk.ok ? <Check size={16} /> : <AlertCircle size={16} />}
                  </div>
                  <span className="text-xs font-bold text-slate-800">{chk.label}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  chk.ok ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-slate-200 text-slate-600 border-slate-300'
                }`}>
                  {chk.ok ? 'Ready' : 'Pending'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: CHECKLIST VERIFICATION */}
      {activeTab === 'checklist' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Checklist Requirements & Verification Gates</h3>
            <p className="text-xs text-slate-500">Interactive gate keeping track of WHO verified WHAT requirement and WHEN.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-6">Requirement Item</th>
                  <th className="py-3 px-4">Mandatory</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {CHECKLIST_ITEMS.map(item => {
                  const verified = Boolean(job.handoverChecklist && job.handoverChecklist[item.key]);

                  return (
                    <tr key={item.key} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3.5 px-6 font-bold text-slate-800">
                        {item.label}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.mandatory ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {item.mandatory ? 'Mandatory' : 'Optional'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                          verified ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : 'bg-slate-100 text-slate-500 border-slate-300'
                        }`}>
                          {verified ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Clock size={13} className="text-slate-400" />}
                          {verified ? 'Verified' : 'Pending Verification'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleToggleChecklist(item.key, verified)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                            verified
                              ? 'bg-white text-rose-600 border-rose-200 hover:bg-rose-50'
                              : 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-xs'
                          }`}
                        >
                          {verified ? 'Unverify' : 'Mark Verified →'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: RESPONSIBILITY CHAIN & ASSIGNMENT HISTORY */}
      {activeTab === 'responsibility' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Responsibility Chain</h3>
            <p className="text-xs text-slate-500">Traceable accountability throughout the planning process.</p>
          </div>

          {/* Flow Stepper */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">1. Submitter</span>
              <span className="text-xs font-bold text-slate-800 mt-1 block">Responsible Engineer</span>
              <span className="text-xs text-indigo-600 font-semibold">{job.responsibleEnggName || 'Unassigned'}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">2. Verification</span>
              <span className="text-xs font-bold text-slate-800 mt-1 block">Verification Gate</span>
              <span className="text-xs text-emerald-600 font-semibold">{readinessCount}/6 Criteria Ready</span>
            </div>

            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block">3. Planning Lead</span>
              <span className="text-xs font-bold text-indigo-950 mt-1 block">Planning Owner</span>
              <span className="text-xs text-indigo-700 font-semibold">{job.planningOwnerName || 'Unassigned'}</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">4. Forward To</span>
              <span className="text-xs font-bold text-slate-800 mt-1 block">Target Department</span>
              <span className="text-xs text-slate-600 font-semibold">{job.targetDepartment || 'Production / QC'}</span>
            </div>
          </div>

          {/* Current Assignment Details */}
          {job.planningOwnerName && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <h4 className="font-bold text-slate-800">Current Assignment Record:</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[11px]">
                <div>
                  <span className="text-slate-400 block">Reason Category:</span>
                  <span className="font-semibold text-slate-800">{job.assignmentReasonCategory || 'Standard Assignment'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Assigned On:</span>
                  <span className="font-semibold text-slate-800">{job.stageStartedAt ? new Date(job.stageStartedAt).toLocaleString() : '—'}</span>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <span className="text-slate-400 block">Target Due Date:</span>
                  <span className="font-semibold text-slate-800">{job.stageDueDate ? new Date(job.stageDueDate).toLocaleDateString() : '—'}</span>
                </div>
              </div>
              {job.assignmentExplanation && (
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Mandatory Explanation:</span>
                  <p className="italic text-slate-700 mt-0.5">{job.assignmentExplanation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: TIMELINE & ADMIN DURATION BREAKDOWN */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {/* 🔒 ADMIN-EXCLUSIVE STAGE DURATION BREAKDOWN */}
          {isAdmin && (
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-5 rounded-2xl border border-slate-800 text-white shadow-sm">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-indigo-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300">
                    ⏱️ Stage Duration Analysis (Admin Oversight)
                  </h4>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  Visible to Admins & Keval V Shah Only
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Incoming Stage</span>
                  <span className="text-sm font-extrabold text-white mt-1 block">
                    {timelineData.stageDurations?.incoming || '16 minutes'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Verification Stage</span>
                  <span className="text-sm font-extrabold text-white mt-1 block">
                    {timelineData.stageDurations?.verification || '20 minutes'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Waiting Assignment</span>
                  <span className="text-sm font-extrabold text-white mt-1 block">
                    {timelineData.stageDurations?.waitingAssignment || '3 minutes'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Planning Active</span>
                  <span className="text-sm font-extrabold text-white mt-1 block">
                    {timelineData.stageDurations?.planningActive || 'Active'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-indigo-900/60 border border-indigo-700">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 block">Total Elapsed</span>
                  <span className="text-sm font-extrabold text-indigo-200 mt-1 block">
                    {timelineData.stageDurations?.total || 'In Progress'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Chronological Append-Only Event Stream */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Event Audit Trail (WHO → WHAT → WHY → WHEN)</h3>
                <p className="text-xs text-slate-500">Immutable chronological history of all stage transitions and assignments.</p>
              </div>
              <button
                onClick={fetchTimeline}
                disabled={timelineLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
              >
                <RefreshCw size={12} className={timelineLoading ? 'animate-spin' : ''} />
                <span>Refresh Log</span>
              </button>
            </div>

            {timelineData.events.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No events recorded yet. Transitions and assignments will be logged here.
              </div>
            ) : (
              <div className="space-y-3 pt-2">
                {timelineData.events.map((evt, idx) => (
                  <div key={evt.id || idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3 text-xs">
                    <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
                      <ArrowRightLeft size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-extrabold text-slate-900">
                          {(evt.action || evt.handover_type || 'EVENT').toUpperCase()}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {(evt.timestamp || evt.created_at) ? new Date(evt.timestamp || evt.created_at).toLocaleString() : '—'}
                        </span>
                      </div>

                      <div className="text-slate-600 mt-1 text-[11px]">
                        <strong>WHO:</strong> <span className="font-semibold text-slate-900">{evt.performedBy || evt.performed_by || evt.updated_by || 'Admin'}</span>
                        {evt.to_user_name && <span> → Target: <strong className="text-slate-900">{evt.to_user_name}</strong></span>}
                      </div>

                      {evt.reason && (
                        <div className="text-slate-600 mt-0.5 text-[11px]">
                          <strong>WHY:</strong> {evt.reason}
                        </div>
                      )}

                      {evt.notes && (
                        <div className="bg-white p-2 rounded-lg border border-slate-200 mt-1.5 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                          {evt.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: DOCUMENTS & SPECS */}
      {activeTab === 'documents' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Technical Drawings & Specifications</h3>
              <p className="text-xs text-slate-500">Commercial Purchase Orders, Single Line Diagrams (SLD), and technical specifications.</p>
            </div>

            <label className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-colors">
              {uploadingFile ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              <span>{uploadingFile ? 'Uploading...' : 'Upload Document'}</span>
              <input type="file" onChange={handleFileUpload} className="hidden" disabled={uploadingFile} />
            </label>
          </div>

          {(!job.attachments || job.attachments.length === 0) ? (
            <div className="p-12 text-center text-xs text-slate-400 border-2 border-dashed border-slate-200 rounded-2xl">
              No documents attached to this job yet. Click "Upload Document" to attach PO or SLD files.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {job.attachments.map((file, i) => (
                <div key={i} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileCheck size={18} className="text-indigo-600 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-xs text-slate-800 block truncate">{file.name || file.originalName || file.storedName || `Attachment #${i+1}`}</span>
                      <span className="text-[10px] text-slate-400 block">{file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'Uploaded'}</span>
                    </div>
                  </div>
                  {file.url && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors cursor-pointer"
                        title="View document in modal"
                      >
                        <Eye size={14} />
                      </button>
                      <a
                        href={file.url}
                        download={file.name || file.originalName || file.storedName}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-white rounded-lg border border-slate-200 text-indigo-600 hover:bg-indigo-50 shrink-0"
                        title="Download file"
                      >
                        <Download size={14} />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FORMAL ACTION MODALS */}
      {modalState.assignOpen && (
        <AssignOwnerModal
          job={job}
          isOpen={modalState.assignOpen}
          onClose={() => setModalState(prev => ({ ...prev, assignOpen: false }))}
          onSuccess={handleModalSuccess}
        />
      )}

      {modalState.reassignOpen && (
        <ReassignOwnerModal
          job={job}
          isOpen={modalState.reassignOpen}
          onClose={() => setModalState(prev => ({ ...prev, reassignOpen: false }))}
          onSuccess={handleModalSuccess}
        />
      )}

      {modalState.clarificationOpen && (
        <ClarificationModal
          job={job}
          isOpen={modalState.clarificationOpen}
          onClose={() => setModalState(prev => ({ ...prev, clarificationOpen: false }))}
          onSuccess={handleModalSuccess}
        />
      )}

      {modalState.correctionOpen && (
        <CorrectionModal
          job={job}
          isOpen={modalState.correctionOpen}
          onClose={() => setModalState(prev => ({ ...prev, correctionOpen: false }))}
          onSuccess={handleModalSuccess}
        />
      )}

      {modalState.releaseOpen && (
        <ReleaseModal
          job={job}
          isOpen={modalState.releaseOpen}
          onClose={() => setModalState(prev => ({ ...prev, releaseOpen: false }))}
          onSuccess={handleModalSuccess}
        />
      )}

      {simpleHandoverOpen && job && (
        <SimpleHandoverModal
          job={job}
          isOpen={simpleHandoverOpen}
          onClose={() => setSimpleHandoverOpen(false)}
          onSuccess={(updated) => {
            setJob(prev => ({ ...prev, ...updated }));
            fetchJob();
            fetchTimeline();
          }}
        />
      )}

      {/* In-Modal Document/Excel/PDF Preview Overlay */}
      {previewFile && (
        <DocumentPreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
}
