import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import JobHistoryDrawer from '../components/JobHistoryDrawer';
import JobProgressModal from '../components/JobProgressModal';
import DepartmentTimelineViewer from '../components/timeline/DepartmentTimelineViewer';
import { ALL_DEPARTMENT_USER_OPTIONS } from '../jobs/departmentUserOptions';
import {
  Play, Pause, CheckCircle2, Clock, AlertTriangle, RefreshCw,
  Activity, X, Search, Filter, ShieldCheck, Layers, Users,
  CheckCheck, ArrowRightLeft, UserCheck, Calendar, Eye,
  ExternalLink, ArrowLeft, ArrowUpRight, Home, ChevronDown
} from 'lucide-react';

const PAUSE_REASONS = [
  'Material unavailable',
  'Waiting for approval',
  'Machine breakdown',
  'Technical issue',
  'Shift change / Lunch break',
  'Engineering clarification',
  'Quality hold',
  'Other'
];

const WORKER_POSITIONS = [
  'Junior Engineer',
  'Senior Engineer',
  'Lead Technician',
  'Shift Supervisor',
  'Floor Operator',
  'Quality Inspector',
  'Marketing Executive',
  'Design Engineer',
  'Procurement Officer',
  'Dispatch Coordinator'
];

const HANDOVER_REASONS = [
  'Shift End / Routine Rotation',
  'Technical Skillset Alignment',
  'Emergency Reassignment',
  'Quality Inspection Pending',
  'Absence / Leave Coverage',
  'Workload Balancing',
  'Escalation / Expedited Delivery',
  'Other'
];

const BOTTOM_TABS = [
  { key: 'all', label: 'All Jobs' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'design', label: 'Electrical Design' },
  { key: 'mechanical', label: 'Mechanical Design' },
  { key: 'purchase', label: 'Procurement' },
  { key: 'production', label: 'Production' },
  { key: 'qc', label: 'Quality Control (QC)' },
  { key: 'dispatch', label: 'Dispatch' }
];

function formatTime(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || totalSeconds < 0) return '00:00:00';
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Reusable Solid Blue Pill Badge matching reference image (clean alphanumeric, no hash, no brackets)
function JobNumberPill({ jobNo, onClick }) {
  const cleanJobNo = String(jobNo || '').replace(/^#/, '').replace(/[\[\]]/g, '').trim();

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center px-3 py-1 rounded-[6px] bg-[#1E88E5] hover:bg-[#1976D2] active:scale-95 text-white text-[11px] font-bold tracking-wide shadow-2xs transition-all cursor-pointer whitespace-nowrap"
      title={`View details for Job ${cleanJobNo}`}
    >
      <span>{cleanJobNo}</span>
    </button>
  );
}

export default function AdminJobsTrackPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'executive';

  const [jobs, setJobs] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [activeBottomTab, setActiveBottomTab] = useState('all');

  // Per-column search filters
  const [columnFilters, setColumnFilters] = useState({
    jobNo: '',
    panelCustomer: '',
    priority: '',
    status: '',
    worker: '',
    assignee: '',
    elapsed: '',
    progress: '',
    handover: '',
  });

  const handleColumnFilterChange = (key, val) => {
    setColumnFilters((prev) => ({ ...prev, [key]: val }));
    setCurrentPage(1);
  };

  const clearAllColumnFilters = () => {
    setColumnFilters({
      jobNo: '',
      panelCustomer: '',
      priority: '',
      status: '',
      worker: '',
      assignee: '',
      elapsed: '',
      progress: '',
      handover: '',
    });
    setCurrentPage(1);
  };

  const hasActiveColumnFilters = Object.values(columnFilters).some((v) => Boolean(v && v.trim()));

  // Selected Job for History & Progress Modals
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyJobId, setHistoryJobId] = useState(null);
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [progressModalJob, setProgressModalJob] = useState(null);

  // Day-Wise Formula Timeline Drawer State
  const [timelineDrawerOpen, setTimelineDrawerOpen] = useState(false);
  const [timelineDrawerJob, setTimelineDrawerJob] = useState(null);

  // Pause Modal State
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [targetJobId, setTargetJobId] = useState(null);
  const [pauseReason, setPauseReason] = useState(PAUSE_REASONS[0]);
  const [pauseNotes, setPauseNotes] = useState('');
  const [expectedResumeAt, setExpectedResumeAt] = useState('');

  // Handover Modal State
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [handoverJob, setHandoverJob] = useState(null);
  const [toWorker, setToWorker] = useState('');
  const [toWorkerId, setToWorkerId] = useState(null);
  const [toPosition, setToPosition] = useState(WORKER_POSITIONS[0]);
  const [handoverReason, setHandoverReason] = useState(HANDOVER_REASONS[0]);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverWorkSummary, setHandoverWorkSummary] = useState('');
  const [keepRunningOnHandover, setKeepRunningOnHandover] = useState(true);

  // 1-second interval ticker for local smooth elapsed time
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const serverOffsetRef = useRef(0);

  // Fetch full jobs table data
  const fetchAllData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const [runningRes, usersRes] = await Promise.allSettled([
        api.get('/job-monitoring/running'),
        api.get('/users')
      ]);

      if (runningRes.status === 'fulfilled') {
        const payload = runningRes.value.data;
        const serverNowMs = payload.serverTime ? new Date(payload.serverTime).getTime() : Date.now();
        serverOffsetRef.current = serverNowMs - Date.now();
        setJobs(payload.jobs || []);
      }

      if (usersRes.status === 'fulfilled') {
        setEmployeesList(usersRes.value.data || []);
      }
    } catch (err) {
      console.error('Failed to load admin jobs track overview:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAllData();

    const ticker = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);

    const poller = setInterval(() => {
      fetchAllData(true);
    }, 15000);

    // SSE connection for real-time live sync
    let eventSource = null;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const sseUrl = `/api/job-monitoring/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(sseUrl);
        eventSource.onopen = () => setSseConnected(true);
        eventSource.onmessage = () => fetchAllData(true);
        eventSource.onerror = () => setSseConnected(false);
      } catch {
        setSseConnected(false);
      }
    }

    return () => {
      clearInterval(ticker);
      clearInterval(poller);
      if (eventSource) eventSource.close();
    };
  }, []);

  const getJobElapsedSeconds = (job) => {
    let base = job.actualDurationSeconds || 0;
    if ((job.status === 'Running' || job.status === 'In Progress') && job.activeRunStartedAt) {
      const started = new Date(job.activeRunStartedAt).getTime();
      const now = currentTimeMs + serverOffsetRef.current;
      const additional = Math.max(0, Math.floor((now - started) / 1000));
      base += additional;
    }
    return base;
  };

  // Execution actions
  const handleStart = async (jobId) => {
    setActionLoading(`start-${jobId}`);
    try {
      await api.post(`/job-monitoring/${jobId}/start`);
      await fetchAllData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start job execution');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (jobId) => {
    setActionLoading(`resume-${jobId}`);
    try {
      await api.post(`/job-monitoring/${jobId}/resume`);
      await fetchAllData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to resume job execution');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (jobId) => {
    if (!window.confirm('Are you sure you want to finalize this job execution?')) return;
    setActionLoading(`complete-${jobId}`);
    try {
      await api.post(`/job-monitoring/${jobId}/complete`);
      await fetchAllData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to complete job');
    } finally {
      setActionLoading(null);
    }
  };

  const openPauseModal = (jobId) => {
    setTargetJobId(jobId);
    setPauseReason(PAUSE_REASONS[0]);
    setPauseNotes('');
    setExpectedResumeAt('');
    setPauseModalOpen(true);
  };

  const handlePauseSubmit = async (e) => {
    e.preventDefault();
    if (!targetJobId) return;
    setActionLoading(`pause-${targetJobId}`);
    try {
      await api.post(`/job-monitoring/${targetJobId}/pause`, {
        reason: pauseReason,
        notes: pauseNotes,
        expectedResumeAt: expectedResumeAt ? new Date(expectedResumeAt).toISOString() : null
      });
      setPauseModalOpen(false);
      await fetchAllData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to pause job');
    } finally {
      setActionLoading(null);
    }
  };

  const openHandoverModal = (job) => {
    setHandoverJob(job);
    setToWorker('');
    setToWorkerId(null);
    setToPosition(job.currentWorkerPosition || WORKER_POSITIONS[0]);
    setHandoverReason(HANDOVER_REASONS[0]);
    setHandoverNotes('');
    setHandoverWorkSummary('');
    setKeepRunningOnHandover(job.status === 'Running' || job.status === 'In Progress');
    setHandoverModalOpen(true);
  };

  const handleExecuteHandover = async (e) => {
    e.preventDefault();
    if (!handoverJob || !toWorker) {
      alert('Please select the receiving worker');
      return;
    }
    setActionLoading(`handover-${handoverJob.id}`);
    try {
      await api.post(`/jobs/${handoverJob.id}/handover`, {
        to_worker_id: toWorkerId,
        to_worker_name: toWorker,
        to_worker_position: toPosition,
        reason: handoverReason,
        notes: handoverNotes,
        work_completed_summary: handoverWorkSummary,
        keepRunning: keepRunningOnHandover
      });
      setHandoverModalOpen(false);
      await fetchAllData(true);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to execute handover');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    const list = jobs.filter((j) => {
      // 1. Text Search Filter
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchesJobNo = String(j.jobNo || '').toLowerCase().includes(q);
        const matchesPanel = String(j.panelName || '').toLowerCase().includes(q);
        const matchesClient = String(j.clientName || '').toLowerCase().includes(q);
        const matchesEngg = String(j.assignedEngineer || '').toLowerCase().includes(q);
        const matchesWorker = String(j.currentWorkerName || '').toLowerCase().includes(q);
        const matchesPos = String(j.currentWorkerPosition || '').toLowerCase().includes(q);
        if (!matchesJobNo && !matchesPanel && !matchesClient && !matchesEngg && !matchesWorker && !matchesPos) {
          return false;
        }
      }

      // 2. Department Filter
      const targetDept = activeBottomTab !== 'all' ? activeBottomTab : filterDept;
      if (targetDept !== 'all') {
        const jStage = String(j.currentStage || '').toLowerCase();
        const jDept = String(j.department || '').toLowerCase();
        const jDeptKey = String(j.departmentKey || '').toLowerCase();
        const matched = jStage.includes(targetDept) || jDept.includes(targetDept) || jDeptKey.includes(targetDept);
        if (!matched) return false;
      }

      // 3. Per-column filters (case-insensitive)
      if (columnFilters.jobNo.trim()) {
        const val = columnFilters.jobNo.toLowerCase().trim();
        const jNo = String(j.jobNo || j.id || '').toLowerCase();
        if (!jNo.includes(val)) return false;
      }

      if (columnFilters.panelCustomer.trim()) {
        const val = columnFilters.panelCustomer.toLowerCase().trim();
        const pName = String(j.panelName || '').toLowerCase();
        const cName = String(j.clientName || '').toLowerCase();
        if (!pName.includes(val) && !cName.includes(val)) return false;
      }

      if (columnFilters.priority.trim()) {
        const val = columnFilters.priority.toLowerCase().trim();
        const prio = String(j.priority || 'medium').toLowerCase();
        if (!prio.includes(val)) return false;
      }

      if (columnFilters.status.trim()) {
        const val = columnFilters.status.toLowerCase().trim();
        const st = String(j.status || 'draft').toLowerCase();
        if (!st.includes(val)) return false;
      }

      if (columnFilters.worker.trim()) {
        const val = columnFilters.worker.toLowerCase().trim();
        const wName = String(j.currentWorkerName || j.assignedEngineer || '').toLowerCase();
        const wPos = String(j.currentWorkerPosition || '').toLowerCase();
        if (!wName.includes(val) && !wPos.includes(val)) return false;
      }

      if (columnFilters.assignee.trim()) {
        const val = columnFilters.assignee.toLowerCase().trim();
        const prev = String(j.previousWorkerName || '').toLowerCase();
        const next = String(j.nextPlannedWorkerName || '').toLowerCase();
        if (!prev.includes(val) && !next.includes(val)) return false;
      }

      if (columnFilters.elapsed.trim()) {
        const val = columnFilters.elapsed.toLowerCase().trim();
        const elapsedSec = getJobElapsedSeconds(j);
        const formatted = formatTime(elapsedSec).toLowerCase();
        const targetText = `${Math.round((Number(j.estimatedDurationSeconds || 28800)) / 3600)}h`.toLowerCase();
        if (!formatted.includes(val) && !targetText.includes(val)) return false;
      }

      if (columnFilters.progress.trim()) {
        const val = columnFilters.progress.toLowerCase().trim();
        const prog = String(j.progressPercent ?? 0).toLowerCase();
        const estSeconds = j.estimatedDurationSeconds || 28800;
        const budgetPercent = String(Math.min(100, Math.round((getJobElapsedSeconds(j) / estSeconds) * 100)));
        if (!prog.includes(val) && !budgetPercent.includes(val)) return false;
      }

      if (columnFilters.handover.trim()) {
        const val = columnFilters.handover.toLowerCase().trim();
        const hand = String(j.handoverStatus || j.handoverReason || '').toLowerCase();
        if (!hand.includes(val)) return false;
      }

      return true;
    });

    // LIFO Ordering: Most recently added / highest ID jobs first
    return [...list].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  }, [jobs, searchTerm, filterDept, activeBottomTab, columnFilters]);

  // Centered pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const totalPages = Math.ceil(filteredJobs.length / pageSize) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterDept, activeBottomTab, columnFilters]);

  // Visible page numbers for UserManagementPage-style pagination
  const visiblePageNumbers = useMemo(() => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
      } else if (currentPage >= totalPages - 3) {
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        for (let i = currentPage - 2; i <= currentPage + 2; i++) pages.push(i);
      }
    }
    return pages;
  }, [currentPage, totalPages]);

  const paginatedJobs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredJobs.slice(startIndex, startIndex + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  return (
    <div className="space-y-6 pb-20 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* 1. TOP BREADCRUMB & PAGE HEADER */}
      <div className="space-y-2">
        {/* Required Compact Breadcrumb: [Home Icon] Home > Active Jobs & Planning */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Link to="/" className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors">
            <Home size={14} className="text-slate-500" />
            <span>Home</span>
          </Link>
          <span className="text-slate-400 font-normal">&gt;</span>
          <span className="text-slate-800 font-bold">Active Jobs &amp; Planning</span>
        </div>

        {/* Page Title & Real-Time Sync Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Active Jobs &amp; Planning
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Full-page production execution table with 1-second live ticking timers, shift handover governance &amp; formula milestones
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => fetchAllData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>Sync Live</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. FULL LIVE ACTIVE JOBS & PLANNING CONTROL CENTER TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Table Header Controls */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-gradient-to-r from-slate-50 via-white to-slate-50/60">
          <div>
            <div className="flex items-center flex-wrap gap-2.5">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Live Active Jobs &amp; Planning Control Center</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100/80 text-blue-800 text-xs font-bold border border-blue-200/60">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
              {(filterDept !== 'all' || activeBottomTab !== 'all' || hasActiveColumnFilters) && (
                <span className="text-[10px] font-bold text-[#0000AA] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  Filters Active
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center flex-wrap sm:flex-nowrap gap-2 shrink-0">
            <Link
              to="/live-monitor"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-200 transition-colors shrink-0 whitespace-nowrap"
              title="Return to Live Monitor Overview"
            >
              <ArrowLeft size={12} />
              <span>Back to Monitor</span>
            </Link>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterDept('all');
                setActiveBottomTab('all');
                clearAllColumnFilters();
              }}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-full cursor-pointer shadow-2xs transition-colors shrink-0 whitespace-nowrap"
              title="Clear all active filters"
            >
              Clear
            </button>

            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              className="w-8 h-8 flex items-center justify-center bg-[#0000AA] hover:bg-[#000088] text-white rounded-full cursor-pointer shadow-2xs transition-colors shrink-0"
              title="Apply Filter"
            >
              <Filter size={13} />
            </button>
          </div>
        </div>

        {/* Main Content Area with GAP between Tabs and Table Containers */}
        <div className="p-5 space-y-3.5 bg-slate-50/40">
          {/* Department Tabs Navigation (Contained Tab Bar as per Reference Image) */}
          <div className="border border-slate-200 rounded-lg bg-slate-50/70 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
              <div className="flex items-stretch min-w-max divide-x divide-slate-200">
                {BOTTOM_TABS.map((tab) => {
                  const isActive = activeBottomTab === tab.key;
                  const count = tab.key === 'all'
                    ? jobs.length
                    : jobs.filter(j => {
                        const jStage = String(j.currentStage || '').toLowerCase();
                        const jDept = String(j.department || '').toLowerCase();
                        const jDeptKey = String(j.departmentKey || '').toLowerCase();
                        return jStage.includes(tab.key) || jDept.includes(tab.key) || jDeptKey.includes(tab.key);
                      }).length;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => {
                        setActiveBottomTab(tab.key);
                        if (tab.key !== 'all') {
                          setFilterDept('all');
                        }
                      }}
                      className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer relative ${
                        isActive
                          ? 'bg-white text-[#0000AA] font-bold border-t-2 border-t-[#0000AA] shadow-2xs'
                          : 'bg-slate-50/70 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border-t-2 border-t-transparent'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                          isActive ? 'bg-blue-50 text-[#0000AA] border border-blue-200' : 'bg-slate-200/70 text-slate-600'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Independent Table Container */}
          <div className="border border-slate-200 rounded-xl bg-white shadow-2xs overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left border-collapse text-xs min-w-[1100px]">
                <thead className="border-b border-slate-200 text-[10px]">
                  {/* Row 1: Column Header Names with /admin/users #0000AA theme */}
                  <tr className="bg-[#0000AA] text-white font-bold uppercase tracking-wider divide-x divide-white/20">
                    <th className="py-2.5 px-2.5 w-[110px] whitespace-nowrap">
                      <div className="flex items-center justify-between gap-1">
                        <span>Job Number</span>
                        <ChevronDown size={12} className="text-white/80 shrink-0" />
                      </div>
                    </th>
                    <th className="py-2.5 px-2.5 w-[170px] whitespace-nowrap">Panel &amp; Customer</th>
                    <th className="py-2.5 px-2 w-[80px] whitespace-nowrap">Priority</th>
                    <th className="py-2.5 px-2 w-[95px] whitespace-nowrap">Status</th>
                    <th className="py-2.5 px-2.5 w-[150px] whitespace-nowrap">Current Worker &amp; Position</th>
                    <th className="py-2.5 px-2 w-[130px] whitespace-nowrap">Prev / Next Assignee</th>
                    <th className="py-2.5 px-2.5 font-mono w-[110px] whitespace-nowrap">Live Elapsed Time</th>
                    <th className="py-2.5 px-2.5 w-[110px] whitespace-nowrap">Progress / Budget</th>
                    <th className="py-2.5 px-2 text-center w-[130px] whitespace-nowrap">Handover</th>
                    <th className="py-2.5 px-2.5 text-center w-[130px] whitespace-nowrap">Execution Controls</th>
                  </tr>

                  {/* Row 2: Per-Column Search Bars (Case-insensitive matching Reference Image) */}
                  <tr className="bg-slate-100/70 border-t border-slate-200 divide-x divide-slate-200 normal-case font-normal text-[11px]">
                    {/* Job Number Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.jobNo}
                        onChange={(e) => handleColumnFilterChange('jobNo', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Panel & Customer Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.panelCustomer}
                        onChange={(e) => handleColumnFilterChange('panelCustomer', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Priority Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.priority}
                        onChange={(e) => handleColumnFilterChange('priority', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Status Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.status}
                        onChange={(e) => handleColumnFilterChange('status', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Worker & Position Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.worker}
                        onChange={(e) => handleColumnFilterChange('worker', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Prev/Next Assignee Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.assignee}
                        onChange={(e) => handleColumnFilterChange('assignee', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Live Elapsed Time Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.elapsed}
                        onChange={(e) => handleColumnFilterChange('elapsed', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Progress / Budget Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.progress}
                        onChange={(e) => handleColumnFilterChange('progress', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Handover Search */}
                    <th className="p-1.5">
                      <input
                        type="text"
                        placeholder="Search here ..."
                        value={columnFilters.handover}
                        onChange={(e) => handleColumnFilterChange('handover', e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 rounded text-[11px] font-normal text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0000AA] focus:ring-1 focus:ring-[#0000AA]/20 shadow-2xs"
                      />
                    </th>
                    {/* Clear / Action Column Header */}
                    <th className="p-1.5 text-center">
                      {hasActiveColumnFilters ? (
                        <button
                          onClick={clearAllColumnFilters}
                          className="px-2 py-1 rounded text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors cursor-pointer"
                          title="Clear all column searches"
                        >
                          Clear
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-normal">—</span>
                      )}
                    </th>
                  </tr>
                </thead>
            <tbody className="divide-y divide-slate-100 font-normal bg-white">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan="10" className="py-8 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      <Clock size={20} className="text-slate-300" />
                      <p className="font-medium text-slate-500 text-xs">No jobs currently matching your active filter.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedJobs.map((j) => {
                  const elapsedSeconds = getJobElapsedSeconds(j);
                  const isRunning = j.status === 'Running' || j.status === 'In Progress';
                  const isPaused = j.status === 'Paused';
                  const isCompleted = j.status === 'Completed';
                  const isDraft = j.status === 'Draft' || j.status === 'Scheduled';
                  const isSelected = selectedJobId === j.id;

                  const estSeconds = j.estimatedDurationSeconds || 28800;
                  const budgetPercent = Math.min(100, Math.round((elapsedSeconds / estSeconds) * 100));
                  const isOverrun = elapsedSeconds > estSeconds;

                  return (
                    <tr
                      key={j.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-blue-50/50 ring-1 ring-inset ring-blue-200' : ''
                      }`}
                    >
                      {/* 1. Job Number (Solid Blue Pill matching reference image, without hash or brackets) */}
                      <td className="py-1.5 px-2.5 align-middle">
                        <JobNumberPill
                          jobNo={j.jobNo || j.id}
                          onClick={() => setSelectedJobId(j.id)}
                        />
                      </td>

                      {/* 2. Panel & Customer */}
                      <td className="py-1.5 px-2.5 align-middle max-w-[170px]">
                        <div className="text-slate-900 font-bold text-[11px] leading-snug truncate" title={j.panelName}>
                          {j.panelName || 'Industrial Panel'}
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5" title={j.clientName}>
                          {j.clientName || 'General Client'}
                        </div>
                      </td>

                      {/* 2. Priority */}
                      <td className="py-1.5 px-2 align-middle">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                            j.priority === 'Urgent'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : j.priority === 'High'
                              ? 'bg-orange-100 text-orange-800 border border-orange-200'
                              : j.priority === 'Low'
                              ? 'bg-slate-100 text-slate-700 border border-slate-200'
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}
                        >
                          {j.priority === 'Urgent' && <AlertTriangle size={9} />}
                          <span>{j.priority || 'Medium'}</span>
                        </span>
                      </td>

                      {/* 3. Status */}
                      <td className="py-1.5 px-2 align-middle">
                        <div className="flex items-center gap-1">
                          {isRunning && (
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                          )}
                          {isPaused && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                          {isCompleted && <span className="h-2 w-2 rounded-full bg-slate-400" />}
                          {isDraft && <span className="h-2 w-2 rounded-full bg-blue-400" />}
                          <span
                            className={`font-bold text-[11px] ${
                              isRunning
                                ? 'text-emerald-700'
                                : isPaused
                                ? 'text-amber-700'
                                : isCompleted
                                ? 'text-slate-600'
                                : 'text-slate-800'
                            }`}
                          >
                            {j.status || 'Draft'}
                          </span>
                        </div>
                        {j.pauseReason && (
                          <div className="text-[9px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded px-1 py-0.2 mt-0.5 inline-block truncate max-w-[90px]" title={j.pauseNotes}>
                            {j.pauseReason}
                          </div>
                        )}
                      </td>

                      {/* 4. Current Worker & Position */}
                      <td className="py-1.5 px-2.5 align-middle max-w-[150px]">
                        <div className="flex items-center gap-1">
                          <UserCheck size={12} className="text-slate-400 shrink-0" />
                          <span className="font-bold text-[11px] text-slate-900 truncate">
                            {j.currentWorkerName || j.assignedEngineer || 'Unassigned'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-medium pl-4 mt-0.5 truncate">
                          {j.currentWorkerPosition || 'Shop Floor Engineer'}
                        </div>
                      </td>

                      {/* 5. Prev / Next Assignee */}
                      <td className="py-1.5 px-2 align-middle text-[10px] max-w-[130px]">
                        <div className="text-slate-500 truncate">
                          <span className="text-slate-400 font-mono text-[9px]">Prev:</span> {j.previousWorkerName || '—'}
                        </div>
                        <div className="text-slate-700 font-medium mt-0.5 truncate">
                          <span className="text-slate-400 font-mono text-[9px]">Next:</span> {j.nextPlannedWorkerName || 'Queue'}
                        </div>
                      </td>

                      {/* 6. Live Elapsed Time */}
                      <td className="py-1.5 px-2.5 align-middle font-mono whitespace-nowrap">
                        <div className={`text-[11px] font-bold ${isRunning ? 'text-emerald-700' : 'text-slate-700'}`}>
                          {formatTime(elapsedSeconds)}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5">
                          Target: {Math.round(estSeconds / 3600)}h
                        </div>
                      </td>

                      {/* 7. Progress / Budget */}
                      <td className="py-1.5 px-2.5 align-middle">
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="font-bold text-slate-700">{j.progressPercent ?? 0}%</span>
                          <span className={`text-[9px] font-mono font-semibold ${isOverrun ? 'text-rose-600' : 'text-slate-500'}`}>
                            {budgetPercent}%
                          </span>
                        </div>
                        <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              isOverrun ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, j.progressPercent || budgetPercent || 0)}%` }}
                          />
                        </div>
                      </td>

                      {/* 8. Handover & Modals */}
                      <td className="py-1.5 px-2 align-middle text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openHandoverModal(j)}
                            disabled={isCompleted}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[5px] bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200/80 shadow-2xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Perform shift/department handover"
                          >
                            <ArrowRightLeft size={11} />
                            <span>Handover</span>
                          </button>
                          <button
                            onClick={() => {
                              setProgressModalJob(j);
                              setProgressModalOpen(true);
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[5px] bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[10px] font-bold border border-indigo-300/80 shadow-2xs transition-all cursor-pointer"
                            title="Record progress percentage and units"
                          >
                            <Activity size={11} />
                            <span>Progress</span>
                          </button>
                          <button
                            onClick={() => {
                              setTimelineDrawerJob(j);
                              setTimelineDrawerOpen(true);
                            }}
                            className="inline-flex items-center p-1 rounded-[5px] bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200 shadow-2xs transition-all cursor-pointer"
                            title="View Day-Wise Formula Milestones & Delay Tracking"
                          >
                            <Calendar size={11} />
                          </button>
                          <button
                            onClick={() => {
                              setHistoryJobId(j.id);
                              setHistoryDrawerOpen(true);
                            }}
                            className="inline-flex items-center p-1 rounded-[5px] bg-slate-50 hover:bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                            title="View chronological audit history"
                          >
                            <Clock size={11} />
                          </button>
                        </div>
                      </td>

                      {/* 9. Execution Controls */}
                      <td className="py-1.5 px-2.5 align-middle text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          {isDraft && (
                            <button
                              onClick={() => handleStart(j.id)}
                              disabled={actionLoading === `start-${j.id}`}
                              className="px-2 py-0.5 rounded-[5px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Play size={10} />
                              <span>Start</span>
                            </button>
                          )}

                          {isRunning && (
                            <>
                              <button
                                onClick={() => openPauseModal(j.id)}
                                disabled={actionLoading === `pause-${j.id}`}
                                className="px-2 py-0.5 rounded-[5px] bg-amber-500 hover:bg-amber-400 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Pause size={10} />
                                <span>Pause</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-2 py-0.5 rounded-[5px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={10} />
                                <span>Complete</span>
                              </button>
                            </>
                          )}

                          {isPaused && (
                            <>
                              <button
                                onClick={() => handleResume(j.id)}
                                disabled={actionLoading === `resume-${j.id}`}
                                className="px-2 py-0.5 rounded-[5px] bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Play size={10} />
                                <span>Resume</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-2 py-0.5 rounded-[5px] bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] flex items-center gap-0.5 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={10} />
                                <span>Finish</span>
                              </button>
                            </>
                          )}

                          {isCompleted && (
                            <span className="text-[10px] text-slate-400 font-semibold px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-[5px]">Archived</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls matching /admin/users theme */}
        {filteredJobs.length > 0 && (
          <div className="bg-white rounded-b-2xl border-t border-slate-200 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <span className="text-slate-500 font-medium">
              Showing <strong>{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredJobs.length)}</strong> of <strong>{filteredJobs.length}</strong> jobs • Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>

            <div className="flex items-center gap-1.5">
              {/* First Button */}
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-[7px] font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                First
              </button>

              {/* Numbered Page Buttons */}
              {visiblePageNumbers.map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`min-w-[32px] h-[32px] px-2 rounded-[7px] font-semibold text-xs transition-colors cursor-pointer ${
                    currentPage === pageNum
                      ? 'bg-[#0000AA] text-white shadow-2xs'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {pageNum}
                </button>
              ))}

              {/* Last Button */}
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1.5 rounded-[7px] font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Last
              </button>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      {/* PAUSE MODAL */}
      {pauseModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-700">
                  <Pause size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Pause Job Execution</h3>
                  <p className="text-xs text-slate-500">Record reason &amp; stop live execution timer</p>
                </div>
              </div>
              <button
                onClick={() => setPauseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handlePauseSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Pause Reason Category</label>
                <select
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                >
                  {PAUSE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Additional Detailed Remarks</label>
                <textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder="Explain why execution is paused..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setPauseModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading !== null}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                >
                  Confirm Pause
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHIFT & DEPARTMENT HANDOVER MODAL */}
      {handoverModalOpen && handoverJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Execution Shift Handover</h3>
                  <p className="text-xs text-slate-500">
                    Job #{handoverJob.jobNo} ({handoverJob.panelName || 'Panel'})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setHandoverModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleExecuteHandover} className="space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 gap-2 text-slate-700">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Worker</span>
                  <span className="font-bold text-slate-900">{handoverJob.currentWorkerName || handoverJob.assignedEngineer || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Position</span>
                  <span className="font-bold text-slate-900">{handoverJob.currentWorkerPosition || 'Shop Floor'}</span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Receiving Worker <span className="text-rose-500">*</span>
                </label>
                <select
                  value={toWorker}
                  onChange={(e) => {
                    const val = e.target.value;
                    setToWorker(val);
                    const found = employeesList.find((emp) => emp.name === val || emp.username === val);
                    if (found) setToWorkerId(found.id);
                  }}
                  required
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Select Receiving Worker --</option>
                  {(employeesList.length > 0 ? employeesList.map(e => e.name || e.username) : ALL_DEPARTMENT_USER_OPTIONS).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Handover Reason</label>
                <select
                  value={handoverReason}
                  onChange={(e) => setHandoverReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {HANDOVER_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setHandoverModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading !== null}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-md shadow-blue-500/20 cursor-pointer disabled:opacity-50"
                >
                  Assign Handover
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Audit History Drawer */}
      <JobHistoryDrawer
        jobId={historyJobId}
        isOpen={historyDrawerOpen}
        onClose={() => {
          setHistoryDrawerOpen(false);
          setHistoryJobId(null);
        }}
      />

      {/* Job Progress Modal */}
      <JobProgressModal
        job={progressModalJob}
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        onSuccess={() => fetchAllData(true)}
      />

      {/* Day-Wise Formula Timeline Drawer */}
      {timelineDrawerOpen && timelineDrawerJob && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setTimelineDrawerOpen(false)}
          />
          <div className="relative z-10 w-full max-w-3xl sm:max-w-3xl md:max-w-4xl bg-[#f5f6f8] h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-300 animate-in slide-in-from-right duration-200 rounded-l-xl">
            <div className="px-5 py-3 border-b border-slate-300 flex items-center justify-between bg-slate-100 sticky top-0 z-20 shrink-0">
              <div className="flex items-center gap-2 pr-2 truncate">
                <span className="p-1 rounded-[3px] bg-blue-100 text-blue-700 shrink-0">
                  <Calendar size={15} />
                </span>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate">
                  Timeline &amp; Delay Accountability — Job #{timelineDrawerJob.jobNo} ({timelineDrawerJob.panelName || 'Industrial Panel'})
                </span>
              </div>
              <button
                onClick={() => setTimelineDrawerOpen(false)}
                className="h-7 px-2.5 flex items-center gap-1 text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-300 rounded-[3px] text-xs font-bold transition-colors cursor-pointer shadow-2xs shrink-0"
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#f5f6f8]">
              <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm">
                <DepartmentTimelineViewer
                  jobId={timelineDrawerJob.id}
                  user={user}
                  onTimelineUpdated={() => fetchAllData(true)}
                  onClose={() => setTimelineDrawerOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
