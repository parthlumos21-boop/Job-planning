import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LiveTimelineChart from '../components/LiveTimelineChart';
import JobHistoryDrawer from '../components/JobHistoryDrawer';
import JobProgressModal from '../components/JobProgressModal';
import DepartmentTimelineViewer from '../components/timeline/DepartmentTimelineViewer';
import OperationalSummaryCard from '../components/timeline/OperationalSummaryCard';
import LiveJobsTable from '../components/timeline/LiveJobsTable';
import { ALL_DEPARTMENT_USER_OPTIONS } from '../jobs/departmentUserOptions';
import {
  Play, Pause, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  BarChart3, RefreshCw, Activity, X, Loader2, Search, Filter,
  ShieldCheck, ArrowUpRight, ArrowDownRight, Layers, Users,
  AlertOctagon, CheckCheck, Gauge, ArrowRightLeft, UserCheck,
  Calendar, Flame, Eye, Sparkles, Bell, ExternalLink, Home
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

    // LIFO Ordering: Last added / highest ID jobs first
    return [...list].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
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
      {/* 0. BREADCRUMB & HEADER (EXACT IMAGE 1 MATCH)                             */}
      {/* ========================================================================= */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <Home size={14} className="text-blue-600" />
          <Link to="/" className="text-blue-600 hover:underline">Home</Link>
          <span className="text-slate-400">›</span>
          <span className="text-slate-800 font-semibold">Active Jobs &amp; Planning</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Active Jobs &amp; Planning Control Center
            </h1>
            <p className="text-xs text-slate-500 mt-0.5 font-medium">
              Monitor active jobs, worker assignments, elapsed time and department handovers.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>Real-Time Sync: Connected</span>
            </div>

            <button
              onClick={() => fetchAllData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 rounded-[7px] text-xs font-bold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh all data"
            >
              <RefreshCw size={13} className={`text-blue-600 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: DYNAMIC LIVE OPERATIONAL TIMELINE & OPERATIONAL SUMMARY        */}
      {/* ========================================================================= */}
      {isAdmin ? (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-stretch">
          {/* Left: Dynamic Live Operational Timeline (3 of 4 columns on desktop) */}
          <div className="xl:col-span-3 min-w-0">
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

          {/* Right: Operational Summary Card (1 of 4 columns on desktop) */}
          <div className="xl:col-span-1 min-w-0">
            <OperationalSummaryCard jobs={jobs} />
          </div>
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-sm">
          Dynamic timeline tracking is restricted to Executive and Administrative roles.
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION 3: LIVE JOB ACTIVITY & HANDOVER TABLE (EXACT IMAGE 2 MATCH)       */}
      {/* ========================================================================= */}
      <LiveJobsTable
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelectJob={(j) => setSelectedJobId(j.id)}
        onOpenHandover={(j) => openHandoverModal(j)}
        onOpenProgress={(j) => {
          setProgressModalJob(j);
          setProgressModalOpen(true);
        }}
        onOpenTimeline={(j) => {
          setTimelineDrawerJob(j);
          setTimelineDrawerOpen(true);
        }}
        onOpenHistory={(jId) => {
          setHistoryJobId(jId);
          setHistoryDrawerOpen(true);
        }}
        onStartJob={(jId) => handleStart(jId)}
        onPauseJob={(jId) => openPauseModal(jId)}
        onResumeJob={(jId) => handleResume(jId)}
        actionLoading={actionLoading}
        currentTimeMs={currentTimeMs}
      />

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
