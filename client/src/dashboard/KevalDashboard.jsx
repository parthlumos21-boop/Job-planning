import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LiveTimelineChart from '../components/LiveTimelineChart';
import JobHistoryDrawer from '../components/JobHistoryDrawer';
import JobProgressModal from '../components/JobProgressModal';
import DepartmentTimelineViewer from '../components/timeline/DepartmentTimelineViewer';
import { ALL_DEPARTMENT_USER_OPTIONS } from '../jobs/departmentUserOptions';
import {
  Play, Pause, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  BarChart3, RefreshCw, Activity, X, Loader2, Search, Filter,
  ShieldCheck, ArrowUpRight, ArrowDownRight, Layers, Users,
  AlertOctagon, CheckCheck, Gauge, ArrowRightLeft, UserCheck,
  Calendar, Flame, Eye, Sparkles, Bell, ExternalLink
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from 'recharts';

const PAUSE_REASONS = [
  'Material unavailable',
  'Waiting for approval',
  'Machine breakdown',
  'Technical issue',
  'Employee unavailable',
  'Customer dependency',
  'Power outage',
  'Other'
];

const WORKER_POSITIONS = [
  'Senior Assembly Fitter',
  'Electrical Design Lead',
  'Panel Wireman',
  'Mechanical Fabrication Lead',
  'Testing & QC Engineer',
  'Procurement Specialist',
  'Marketing & Sales Exec',
  'Production Supervisor',
  'Wiring Technician',
  'Busbar Specialist',
  'Automation Engineer',
  'Project Engineer'
];

const HANDOVER_REASONS = [
  'Shift Change',
  'Specialized Task / Wiring',
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

export default function KevalDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'executive';

  const [jobs, setJobs] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [plannedVsActual, setPlannedVsActual] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [bottlenecks, setBottlenecks] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [flowVelocity, setFlowVelocity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [activeBottomTab, setActiveBottomTab] = useState('all');
  const [activeKpiFilter, setActiveKpiFilter] = useState('all');

  // Selected Job for Live Timeline Chart
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [timelineOverviewData, setTimelineOverviewData] = useState([]);
  const [employeesList, setEmployeesList] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // History & Progress Modals State
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

  // Real-time Toast Notifications
  const [toasts, setToasts] = useState([]);

  // 1-second interval ticker for local smooth elapsed time
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());
  const serverOffsetRef = useRef(0);

  const addToast = (type, title, message, jobId = null) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [
      { id, type, title, message, jobId, timestamp: new Date().toLocaleTimeString() },
      ...prev.slice(0, 4)
    ]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchTimeline = async (jobId) => {
    if (!jobId) return;
    try {
      setTimelineLoading(true);
      const res = await api.get(`/job-monitoring/timeline/${jobId}`);
      setTimelineData(res.data);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const fetchAllData = async (preserveSelected = true) => {
    try {
      setRefreshing(true);
      const [
        runningRes,
        kpisRes,
        pvaRes,
        workloadRes,
        bottlenecksRes,
        rankingsRes,
        flowRes,
        timelineOverviewRes,
        usersRes
      ] = await Promise.all([
        api.get('/job-monitoring/running'),
        api.get('/job-analytics/kpis'),
        api.get('/job-analytics/planned-vs-actual'),
        api.get('/job-analytics/workload'),
        api.get('/job-analytics/bottlenecks').catch(() => ({ data: [] })),
        api.get('/job-analytics/performance-rankings').catch(() => ({ data: [] })),
        api.get('/job-analytics/flow-velocity').catch(() => ({ data: [] })),
        api.get('/job-monitoring/timeline-overview').catch(() => ({ data: { jobs: [] } })),
        api.get('/users').catch(() => ({ data: [] }))
      ]);

      const data = runningRes.data;
      if (data.serverTime) {
        const serverMs = new Date(data.serverTime).getTime();
        serverOffsetRef.current = serverMs - Date.now();
      }

      const fetchedJobs = data.jobs || [];
      setJobs(fetchedJobs);
      setKpis(kpisRes.data || null);
      setPlannedVsActual(pvaRes.data || []);
      setWorkload(workloadRes.data || []);
      setBottlenecks(bottlenecksRes.data || []);
      setRankings(rankingsRes.data || []);
      setFlowVelocity(flowRes.data || []);
      setTimelineOverviewData(timelineOverviewRes.data?.jobs || []);

      if (usersRes.data?.length) {
        setEmployeesList(usersRes.data);
      }

      // Auto-select active job for timeline chart if none selected
      if (fetchedJobs.length > 0) {
        setSelectedJobId((prevId) => {
          if (preserveSelected && prevId && fetchedJobs.some((j) => j.id === prevId)) {
            return prevId;
          }
          // Prioritize running / in-progress job
          const runningJob = fetchedJobs.find((j) => j.status === 'Running' || j.status === 'In Progress');
          return runningJob ? runningJob.id : fetchedJobs[0].id;
        });
      }
    } catch (err) {
      console.error('Failed to fetch live monitoring data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load and SSE stream setup
  useEffect(() => {
    fetchAllData(false);

    // Setup SSE connection
    let eventSource = null;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const sseUrl = `/api/job-monitoring/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
          setSseConnected(true);
        };

      eventSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          const ev = payload.event;
          if (ev === 'JOB_STATUS_CHANGED' || ev === 'job_started' || ev === 'job_paused' || ev === 'job_resumed' || ev === 'job_completed') {
            fetchAllData(true);
            const status = payload.status || 'Updated';
            const jNo = payload.jobNo || `#${payload.jobId || payload.job_id}`;
            const desc = payload.pause_reason ? `${jNo} is ${status} (${payload.pause_reason})` : `${jNo} is now ${status}`;
            addToast('status', `Job Status: ${status}`, desc, payload.jobId || payload.job_id);
          } else if (ev === 'JOB_HANDOVER' || ev === 'job_handed_over') {
            fetchAllData(true);
            const jNo = payload.jobNo || `#${payload.jobId || payload.job_id}`;
            addToast(
              'handover',
              'Worker Handover Executed',
              `${jNo}: Transferred from ${payload.fromWorker} to ${payload.toWorker} (${payload.toPosition})`,
              payload.jobId || payload.job_id
            );
          } else if (ev === 'JOB_PROGRESS_UPDATED' || ev === 'job_progress_updated') {
            fetchAllData(true);
            const jNo = payload.jobNo || `#${payload.jobId || payload.job_id}`;
            addToast(
              'progress',
              'Progress Updated',
              `${jNo}: Completion now ${payload.progressPercentage ?? payload.progress_percentage}%`,
              payload.jobId || payload.job_id
            );
          }
        } catch (err) {
          // ignore heartbeat
        }
      };

      eventSource.onerror = () => {
        setSseConnected(false);
      };
      } catch (err) {
        setSseConnected(false);
      }
    }

    // Fallback polling interval every 12s
    const pollInterval = setInterval(() => {
      fetchAllData(true);
    }, 12000);

    return () => {
      if (eventSource) eventSource.close();
      clearInterval(pollInterval);
    };
  }, []);

  // Fetch timeline whenever selectedJobId changes
  useEffect(() => {
    if (selectedJobId) {
      fetchTimeline(selectedJobId);
    }
  }, [selectedJobId]);

  // Compute live elapsed time for any job using server-synchronized time
  const getJobElapsedSeconds = (job) => {
    const status = job.status;
    if (status === 'Completed') {
      return job.actualDurationSeconds || job.elapsedSeconds || 0;
    }
    if (!job.actualStartAt) return 0;

    const startMs = new Date(job.actualStartAt).getTime();
    const pausedSeconds = job.totalPausedSeconds || 0;

    if (status === 'Paused') {
      const pauseMs = job.pauseStartedAt
        ? new Date(job.pauseStartedAt).getTime()
        : (currentTimeMs + serverOffsetRef.current);
      const rawElapsed = Math.max(0, Math.floor((pauseMs - startMs) / 1000));
      return Math.max(0, rawElapsed - pausedSeconds);
    }

    if (status === 'Running' || status === 'In Progress') {
      const nowMs = currentTimeMs + serverOffsetRef.current;
      const rawElapsed = Math.max(0, Math.floor((nowMs - startMs) / 1000));
      return Math.max(0, rawElapsed - pausedSeconds);
    }

    return 0;
  };

  // Execution Handlers
  const handleStart = async (jobId) => {
    setActionLoading(`start-${jobId}`);
    try {
      await api.post(`/jobs/${jobId}/start`);
      addToast('success', 'Job Started', `Execution started for Job #${jobId}`, jobId);
      await fetchAllData(true);
      if (selectedJobId === jobId) fetchTimeline(jobId);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to start job');
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

  const handleConfirmPause = async () => {
    if (!targetJobId) return;
    if (pauseReason === 'Other' && (!pauseNotes || pauseNotes.trim().length < 5)) {
      alert("Please provide a detailed explanation when selecting 'Other' (minimum 5 characters)");
      return;
    }

    setActionLoading(`pause-${targetJobId}`);
    try {
      await api.post(`/jobs/${targetJobId}/pause`, {
        category: pauseReason,
        reason: pauseReason,
        detailed_reason: pauseNotes,
        notes: pauseNotes,
        expected_resume_at: expectedResumeAt ? new Date(expectedResumeAt).toISOString() : undefined
      });
      addToast('pause', 'Job Paused', `Job #${targetJobId} placed On Hold (${pauseReason})`, targetJobId);
      setPauseModalOpen(false);
      await fetchAllData(true);
      if (selectedJobId === targetJobId) fetchTimeline(targetJobId);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to pause job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResume = async (jobId) => {
    setActionLoading(`resume-${jobId}`);
    try {
      await api.post(`/jobs/${jobId}/resume`, {});
      addToast('success', 'Job Resumed', `Execution resumed for Job #${jobId}`, jobId);
      await fetchAllData(true);
      if (selectedJobId === jobId) fetchTimeline(jobId);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to resume job');
    } finally {
      setActionLoading(null);
    }
  };

  const handleComplete = async (jobId) => {
    if (!window.confirm(`Are you sure you want to finalize and complete job #${jobId}?`)) return;
    setActionLoading(`complete-${jobId}`);
    try {
      await api.post(`/jobs/${jobId}/complete`, { notes: 'Completed from Admin Live Monitor' });
      addToast('complete', 'Job Completed', `Job #${jobId} finalized and marked Completed!`, jobId);
      await fetchAllData(true);
      if (selectedJobId === jobId) fetchTimeline(jobId);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to complete job');
    } finally {
      setActionLoading(null);
    }
  };

  // Handover Modal handlers
  const openHandoverModal = (job) => {
    setHandoverJob(job);
    const initialWorker = employeesList[0] || null;
    setToWorker(initialWorker ? initialWorker.name : (ALL_DEPARTMENT_USER_OPTIONS[0] || 'Janak'));
    setToWorkerId(initialWorker ? initialWorker.id : 1);
    setToPosition(WORKER_POSITIONS[0]);
    setHandoverReason(HANDOVER_REASONS[0]);
    setHandoverNotes('');
    setHandoverWorkSummary('');
    setKeepRunningOnHandover(job.status === 'Running');
    setHandoverModalOpen(true);
  };

  const handleConfirmHandover = async () => {
    if (!handoverJob) return;
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
      addToast(
        'handover',
        'Handover Successful',
        `Job ${handoverJob.jobNo} assigned to ${toWorker} (${toPosition})`,
        handoverJob.id
      );
      setHandoverModalOpen(false);
      await fetchAllData(true);
      if (selectedJobId === handoverJob.id) fetchTimeline(handoverJob.id);
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to execute handover');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtered jobs according to search & 12 KPI card filters
  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
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

      // 2. Department Filter (from bottom tabs or structured filter panel)
      const targetDept = activeBottomTab !== 'all' ? activeBottomTab : filterDept;
      if (targetDept !== 'all') {
        const jStage = String(j.currentStage || '').toLowerCase();
        const jDept = String(j.department || '').toLowerCase();
        const jDeptKey = String(j.departmentKey || '').toLowerCase();
        const matched = jStage.includes(targetDept) || jDept.includes(targetDept) || jDeptKey.includes(targetDept);
        if (!matched) return false;
      }

      // 3. Status Filter (from structured filter panel)
      if (filterStatus !== 'all') {
        const jStatus = (j.status || 'Draft').toLowerCase();
        if (filterStatus === 'running' && !(jStatus === 'running' || jStatus === 'in progress')) return false;
        if (filterStatus === 'paused' && jStatus !== 'paused') return false;
        if (filterStatus === 'completed' && jStatus !== 'completed') return false;
        if (filterStatus === 'draft' && !(jStatus === 'draft' || jStatus === 'scheduled')) return false;
      }

      // 4. Priority Filter (from structured filter panel)
      if (filterPriority !== 'all') {
        const jPriority = String(j.priority || 'Medium').toLowerCase();
        if (jPriority !== filterPriority.toLowerCase()) return false;
      }

      // 5. Clickable 12 KPI Card Filter
      const status = (j.status || 'Draft').toLowerCase();
      const elapsed = getJobElapsedSeconds(j);
      const est = j.estimatedDurationSeconds || 28800;

      switch (activeKpiFilter) {
        case 'running':
          return status === 'running' || status === 'in progress';
        case 'waiting':
          return status === 'draft' || status === 'scheduled';
        case 'paused':
          return status === 'paused';
        case 'blocked':
          return status === 'blocked';
        case 'overdue':
          return !!j.isOverdue;
        case 'completed_today':
          return status === 'completed';
        case 'at_risk':
          return (elapsed > 0.85 * est && status !== 'completed') || !!j.isOverdue;
        case 'variance':
          return j.varianceSeconds > 0;
        case 'active_workers':
          return (status === 'running' || status === 'in progress') && !!j.currentWorkerName;
        case 'all':
        default:
          return true;
      }
    });
  }, [jobs, searchTerm, filterDept, filterStatus, filterPriority, activeBottomTab, activeKpiFilter, currentTimeMs]);

  // Centered pagination state for Live Jobs table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / pageSize));

  // Reset page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterDept, filterStatus, filterPriority, activeBottomTab, activeKpiFilter]);

  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredJobs.slice(start, start + pageSize);
  }, [filteredJobs, currentPage, pageSize]);

  // Selected Job Object
  const currentSelectedJob = useMemo(() => {
    return jobs.find((j) => j.id === selectedJobId) || jobs[0] || null;
  }, [jobs, selectedJobId]);

  if (loading && jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="animate-spin text-blue-600" size={40} />
        <p className="text-slate-600 font-medium">Loading Unified Real-Time Operational Command Center...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 max-w-7xl mx-auto">
      {/* ========================================================================= */}
      {/* 0. HEADER BANNER                                                          */}
      {/* ========================================================================= */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2.5 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <ShieldCheck size={26} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">
                  Real-Time Operational Monitoring Command Center
                </h1>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold tracking-wide">
                  ADMIN ONLY
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-0.5">
                Centralized execution hub, live continuous timeline tracking, worker handovers & visual analytics
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/80 px-3.5 py-1.5 rounded-lg border border-slate-700 text-xs">
            <span className={`h-2.5 w-2.5 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300 font-medium">
              {sseConnected ? 'Live SSE Stream' : 'Auto Polling'}
            </span>
          </div>

          <button
            onClick={() => fetchAllData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: DYNAMIC LIVE OPERATIONAL TIMELINE CHART (ADMIN / EXEC ONLY)    */}
      {/* ========================================================================= */}
      {isAdmin ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <Clock size={16} className="text-blue-600" />
              <span>Dynamic Live Operational Timeline Chart (Admin View)</span>
            </h2>
            <span className="text-xs text-slate-500">
              Real-time multi-job Gantt matrix with 1-second live cursor
            </span>
          </div>

          <LiveTimelineChart
            jobs={timelineOverviewData.length > 0 ? timelineOverviewData : jobs}
            loading={refreshing}
            selectedJobId={selectedJobId}
            onSelectJob={(j) => setSelectedJobId(j.id)}
            onOpenHistory={(jId) => {
              setHistoryJobId(jId);
              setHistoryDrawerOpen(true);
            }}
            onOpenProgress={(j) => {
              setProgressModalJob(j);
              setProgressModalOpen(true);
            }}
            onOpenHandover={(j) => openHandoverModal(j)}
            onRefresh={() => fetchAllData(true)}
          />
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 text-blue-900 text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={18} className="text-blue-600 shrink-0" />
            <span>
              Logged in as <strong>{user?.username || 'Staff'}</strong> ({user?.role || 'User'}). Operational Timeline Gantt Chart is restricted to Administrators. Below are your assigned jobs.
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: LIVE JOB ACTIVITY & HANDOVER TABLE                             */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Table Controls */}
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-gradient-to-r from-slate-50 via-white to-slate-50/60">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Live Active Jobs & Planning Control Center</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-100/80 text-blue-800 text-xs font-bold border border-blue-200/60">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              1-second live ticking timers, worker accountability badges & inline shift handover modal
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-lg">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Real-Time Sync</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar (Inside Table Container - Exact UI Match) */}
        <div className="px-6 py-3 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-end gap-3 text-xs">
          {/* Search Job */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Search Job</label>
            <input
              type="text"
              placeholder="Search Job No, Panel or Customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-[34px] px-3 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 shadow-2xs font-medium"
            />
          </div>

          {/* Department */}
          <div className="w-[180px]">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Department</label>
            <select
              value={filterDept}
              onChange={(e) => {
                setFilterDept(e.target.value);
                setActiveBottomTab('all');
              }}
              className="w-full h-[34px] px-2.5 bg-white border border-slate-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500/20 shadow-2xs font-medium cursor-pointer"
            >
              <option value="all">All Departments</option>
              <option value="marketing">Marketing</option>
              <option value="design">Electrical Design</option>
              <option value="mechanical">Mechanical Design</option>
              <option value="purchase">Procurement</option>
              <option value="production">Production</option>
              <option value="qc">Quality Control (QC)</option>
              <option value="dispatch">Dispatch</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterDept('all');
                setFilterStatus('all');
                setFilterPriority('all');
                setActiveBottomTab('all');
                setActiveKpiFilter('all');
              }}
              className="h-[34px] px-3.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-300 rounded-lg cursor-pointer shadow-2xs transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              className="h-[34px] px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg cursor-pointer shadow-2xs transition-colors"
            >
              Filter
            </button>
          </div>

          {(searchTerm || filterDept !== 'all' || activeBottomTab !== 'all' || activeKpiFilter !== 'all') && (
            <div className="w-full flex items-center justify-between pt-1">
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Filters Active ({filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'})
              </span>
            </div>
          )}
        </div>

        {/* Department Tabs Navigation (Top Side - Between Search Filter & Table Contents) */}
        <div className="border-b border-slate-200/80 bg-white px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
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
                  className={`h-8 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold shadow-2xs border border-blue-600'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-2xs'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3.5 px-4 w-[240px]">Job ID & Panel</th>
                <th className="py-3.5 px-3 w-[100px]">Priority</th>
                <th className="py-3.5 px-3 w-[120px]">Status</th>
                <th className="py-3.5 px-4 w-[180px]">Current Worker & Position</th>
                <th className="py-3.5 px-3 w-[160px]">Prev / Next Assignee</th>
                <th className="py-3.5 px-4 font-mono w-[140px]">Live Elapsed Time</th>
                <th className="py-3.5 px-4 w-[140px]">Progress / Budget</th>
                <th className="py-3.5 px-4 text-center w-[170px]">Handover</th>
                <th className="py-3.5 px-4 text-right w-[160px]">Execution Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal bg-white">
              {paginatedJobs.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock size={24} className="text-slate-300" />
                      <p className="font-medium text-slate-500">No jobs currently matching your active filter.</p>
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
                      {/* 1. Job ID & Panel */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedJobId(j.id)}
                            className="font-bold text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md inline-flex items-center gap-1 cursor-pointer transition-colors"
                            title="Focus in Timeline Chart"
                          >
                            <span>#{j.jobNo}</span>
                            <Eye size={12} className="opacity-70" />
                          </button>
                        </div>
                        <div className="text-slate-900 font-bold text-xs mt-1.5 leading-snug">
                          {j.panelName || 'Industrial Panel'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {j.clientName || 'General Client'}
                        </div>
                      </td>

                      {/* 2. Priority */}
                      <td className="py-3.5 px-3 align-top">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1 ${
                            j.priority === 'Urgent'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : j.priority === 'High'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200/60'
                          }`}
                        >
                          {j.priority === 'Urgent' && <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-ping" />}
                          {j.priority || 'Normal'}
                        </span>
                      </td>

                      {/* 3. Status */}
                      <td className="py-3.5 px-3 align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                            isRunning
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isPaused
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : isCompleted
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />}
                          {isPaused && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                          {isCompleted && <CheckCircle2 size={12} className="text-blue-600" />}
                          {isDraft && <Clock size={12} className="text-slate-500" />}
                          <span>{j.status}</span>
                        </span>
                      </td>

                      {/* 4. Current Worker & Position */}
                      <td className="py-3.5 px-4 align-top">
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                          <UserCheck size={14} className="text-blue-600 shrink-0" />
                          <span className="truncate max-w-[150px]">{j.currentWorkerName || j.assignedEngineer || 'Unassigned'}</span>
                        </div>
                        <div className="inline-flex items-center text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-2 py-0.5 rounded-md mt-1">
                          {j.currentWorkerPosition || 'Engineer'}
                        </div>
                      </td>

                      {/* 5. Prev / Next Assignee */}
                      <td className="py-3.5 px-3 align-top">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <span className="text-slate-400 font-medium">Prev:</span>
                          <span className="font-medium text-slate-600">{j.previousWorkerName || '—'}</span>
                        </div>
                        <div className="text-[11px] text-slate-700 font-semibold mt-1 flex items-center gap-1">
                          <span className="text-slate-400 font-medium">Next:</span>
                          <span className={j.nextWorkerName && j.nextWorkerName !== 'Not yet assigned' ? 'text-indigo-700' : 'text-slate-400'}>
                            {j.nextWorkerName || 'Not yet assigned'}
                          </span>
                        </div>
                      </td>

                      {/* 6. Live Elapsed Time */}
                      <td className="py-3.5 px-4 align-top font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className={isRunning ? 'text-emerald-600 animate-spin-slow' : 'text-slate-400'} />
                          <span className={`text-sm font-extrabold tracking-tight ${isRunning ? 'text-emerald-700' : isPaused ? 'text-amber-700' : 'text-slate-800'}`}>
                            {formatTime(elapsedSeconds)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans mt-0.5">
                          Est: {(estSeconds / 3600).toFixed(1)}h
                        </div>
                      </td>

                      {/* 7. Progress / Budget */}
                      <td className="py-3.5 px-4 align-top min-w-[130px]">
                        <div className="flex justify-between items-center text-[11px] font-bold mb-1">
                          <span className={isOverrun ? 'text-rose-600' : 'text-slate-700'}>
                            {budgetPercent}% used
                          </span>
                          {isOverrun && <span className="text-[10px] text-rose-500 font-bold px-1.5 py-0.2 rounded bg-rose-50 border border-rose-200">OVERRUN</span>}
                        </div>
                        <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOverrun ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, budgetPercent)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-slate-400 font-medium mt-1">
                          {j.progressPercentage ?? 0}% completed
                        </div>
                      </td>

                      {/* 8. Handover & Quick Actions */}
                      <td className="py-3.5 px-4 align-top text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openHandoverModal(j)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300/80 shadow-2xs transition-all cursor-pointer"
                            title="Transfer work to another engineer or shift"
                          >
                            <ArrowRightLeft size={13} />
                            <span>Handover</span>
                          </button>
                          <button
                            onClick={() => {
                              setProgressModalJob(j);
                              setProgressModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-bold border border-indigo-300/80 shadow-2xs transition-all cursor-pointer"
                            title="Record progress percentage and units"
                          >
                            <Activity size={13} />
                            <span>Progress</span>
                          </button>
                          <button
                            onClick={() => {
                              setTimelineDrawerJob(j);
                              setTimelineDrawerOpen(true);
                            }}
                            className="inline-flex items-center p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 shadow-2xs transition-all cursor-pointer"
                            title="View Day-Wise Formula Milestones & Delay Tracking"
                          >
                            <Calendar size={13} />
                          </button>
                          <button
                            onClick={() => {
                              setHistoryJobId(j.id);
                              setHistoryDrawerOpen(true);
                            }}
                            className="inline-flex items-center p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-2xs transition-all cursor-pointer"
                            title="View chronological audit history"
                          >
                            <Clock size={13} />
                          </button>
                        </div>
                      </td>

                      {/* 9. Execution Controls */}
                      <td className="py-3.5 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isDraft && (
                            <button
                              onClick={() => handleStart(j.id)}
                              disabled={actionLoading === `start-${j.id}`}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                            >
                              <Play size={12} fill="currentColor" />
                              <span>Start</span>
                            </button>
                          )}

                          {isRunning && (
                            <>
                              <button
                                onClick={() => openPauseModal(j.id)}
                                disabled={actionLoading === `pause-${j.id}`}
                                className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Pause size={12} fill="currentColor" />
                                <span>Pause</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                <span>Finish</span>
                              </button>
                            </>
                          )}

                          {isPaused && (
                            <>
                              <button
                                onClick={() => handleResume(j.id)}
                                disabled={actionLoading === `resume-${j.id}`}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Play size={12} fill="currentColor" />
                                <span>Resume</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                <span>Finish</span>
                              </button>
                            </>
                          )}

                          {isCompleted && (
                            <span className="text-[11px] text-slate-400 font-semibold px-2 py-1 bg-slate-50 border border-slate-200 rounded-md">Archived</span>
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

        {/* Centered Table Pagination with Clickable Page Numbers (First, 1, 2, 3..., Next) */}
        {filteredJobs.length > 0 && (
          <div className="py-3 px-6 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            {/* First Page Button */}
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="h-8 px-2.5 sm:px-3 rounded-[3px] bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Navigate to First Page"
            >
              First
            </button>

            {/* Clickable Page Numbers (1, 2, 3...) */}
            <div className="flex items-center gap-1 mx-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`h-8 w-8 rounded-[3px] text-xs font-bold transition-all cursor-pointer border flex items-center justify-center ${
                    currentPage === pageNum
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 border-slate-300 shadow-2xs'
                  }`}
                  title={`Page ${pageNum}`}
                >
                  {pageNum}
                </button>
              ))}
            </div>

            {/* Next Page Button */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="h-8 px-2.5 rounded-[3px] bg-white border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              title="Next Page"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: REAL-TIME TOAST NOTIFICATIONS (OVERLAY)                        */}
      {/* ========================================================================= */}
      <div className="fixed bottom-6 right-6 z-50 space-y-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => {
              if (t.jobId) setSelectedJobId(t.jobId);
            }}
            className="pointer-events-auto bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 flex items-start gap-3 cursor-pointer hover:border-blue-500 transition-all transform hover:-translate-y-0.5"
          >
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 mt-0.5">
              <Bell size={16} />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-white">{t.title}</span>
                <span className="text-[10px] text-slate-400">{t.timestamp}</span>
              </div>
              <p className="text-xs text-slate-300 mt-1">{t.message}</p>
              {t.jobId && (
                <span className="text-[10px] text-blue-400 font-semibold mt-1 inline-flex items-center gap-1">
                  <span>View in timeline</span>
                  <ExternalLink size={10} />
                </span>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              className="text-slate-400 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* ========================================================================= */}
      {/* PAUSE MODAL                                                               */}
      {/* ========================================================================= */}
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
                  <p className="text-xs text-slate-500">Record reason & stop live execution timer</p>
                </div>
              </div>
              <button
                onClick={() => setPauseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-between">
                <span>Paused by: <strong>{user?.username || 'Current User'}</strong></span>
                <span className="text-[10px] text-amber-600 font-mono">Server UTC Time</span>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Select Reason Category *
                </label>
                <select
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500 font-medium"
                >
                  {PAUSE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  {pauseReason === 'Other' ? (
                    <span className="text-rose-700 font-bold">Detailed Explanation (Mandatory for 'Other') *</span>
                  ) : (
                    <span>Additional Notes / Explanation (Optional)</span>
                  )}
                </label>
                <textarea
                  value={pauseNotes}
                  onChange={(e) => setPauseNotes(e.target.value)}
                  placeholder={pauseReason === 'Other' ? "Please explain the specific reason for pausing (min 5 characters)..." : "e.g. Awaiting revision for busbar drawing from Keyur Shah..."}
                  rows={3}
                  className={`w-full p-2.5 bg-slate-50 border rounded-lg text-slate-800 focus:outline-none text-xs ${
                    pauseReason === 'Other' && !pauseNotes.trim()
                      ? 'border-rose-300 focus:border-rose-500'
                      : 'border-slate-200 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1.5">
                  Expected Resume Time (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={expectedResumeAt}
                  onChange={(e) => setExpectedResumeAt(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-amber-500 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setPauseModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmPause}
                disabled={actionLoading === `pause-${targetJobId}`}
                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Pause size={14} />
                <span>Confirm Pause</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* HANDOVER MODAL                                                            */}
      {/* ========================================================================= */}
      {handoverModalOpen && handoverJob && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
                  <ArrowRightLeft size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Worker Shift Handover</h3>
                  <p className="text-xs text-slate-500">
                    Job {handoverJob.jobNo} — {handoverJob.panelName || 'Panel'}
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

            {/* Current Assignment Summary */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs flex justify-between items-center">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Current Assigned Worker</span>
                <span className="font-bold text-slate-900">
                  {handoverJob.currentWorkerName || handoverJob.assignedEngineer || 'Unassigned'}
                </span>
                <span className="text-slate-500 block text-[11px]">
                  {handoverJob.currentWorkerPosition || 'Operations Lead'}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Session Active Time</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatTime(getJobElapsedSeconds(handoverJob))}
                </span>
              </div>
            </div>

            {/* Handover Form */}
            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Transfer To Worker *
                  </label>
                  <select
                    value={toWorker}
                    onChange={(e) => {
                      const name = e.target.value;
                      setToWorker(name);
                      const found = employeesList.find((emp) => emp.name === name);
                      if (found) setToWorkerId(found.id);
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                  >
                    {employeesList.length > 0
                      ? employeesList.map((emp) => (
                          <option key={emp.id || emp.name} value={emp.name}>
                            {emp.name} {emp.departments?.length ? `(${emp.departments.join(', ')})` : ''}
                          </option>
                        ))
                      : ALL_DEPARTMENT_USER_OPTIONS.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    New Worker Position / Role *
                  </label>
                  <select
                    value={toPosition}
                    onChange={(e) => setToPosition(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                  >
                    {WORKER_POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Reason for Handover *
                </label>
                <select
                  value={handoverReason}
                  onChange={(e) => setHandoverReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                >
                  {HANDOVER_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Work Completed Summary
                </label>
                <input
                  type="text"
                  value={handoverWorkSummary}
                  onChange={(e) => setHandoverWorkSummary(e.target.value)}
                  placeholder="e.g. Busbar bending complete, ready for control wiring..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Handover Notes / Instructions for Next Assignee
                </label>
                <textarea
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  placeholder="Key instructions, pending parts, or inspection points..."
                  rows={2}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              {/* Execution State Toggle */}
              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={keepRunningOnHandover}
                    onChange={(e) => setKeepRunningOnHandover(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-slate-800 text-xs">
                    Keep job running with new worker immediately
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 ml-6">
                  If unchecked, job status will switch to Paused awaiting the new worker to resume.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setHandoverModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmHandover}
                disabled={actionLoading === `handover-${handoverJob.id}`}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <ArrowRightLeft size={14} />
                <span>Confirm Handover</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide-Out History Drawer */}
      <JobHistoryDrawer
        jobId={historyJobId}
        isOpen={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
        onOpenHandover={(job) => {
          setHistoryDrawerOpen(false);
          openHandoverModal(job);
        }}
        onOpenProgress={(job) => {
          setHistoryDrawerOpen(false);
          setProgressModalJob(job);
          setProgressModalOpen(true);
        }}
      />

      {/* Job Progress Update Modal */}
      <JobProgressModal
        job={progressModalJob}
        isOpen={progressModalOpen}
        onClose={() => setProgressModalOpen(false)}
        onSuccess={() => {
          fetchAllData(true);
          addToast('success', 'Progress Saved', `Progress saved for ${progressModalJob?.jobNo || '#' + progressModalJob?.id}`, progressModalJob?.id);
        }}
      />

      {/* Slide-Out Day-Wise Formula Timeline Drawer */}
      {timelineDrawerOpen && timelineDrawerJob && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-2xs transition-opacity"
            onClick={() => setTimelineDrawerOpen(false)}
          />
          {/* Drawer Panel - Sized so close button and headers are unclipped */}
          <div className="relative z-10 w-full max-w-3xl sm:max-w-3xl md:max-w-4xl bg-[#f5f6f8] h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-300 animate-in slide-in-from-right duration-200 rounded-l-xl">
            {/* Drawer Header Bar */}
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
                title="Close Drawer"
              >
                <X size={14} />
                <span>Close</span>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 bg-[#f5f6f8]">
              <div className="bg-white border border-slate-300 rounded-[6px] p-4 shadow-2xs">
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
