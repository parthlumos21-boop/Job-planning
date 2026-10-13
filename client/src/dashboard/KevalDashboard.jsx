import { useState, useEffect, useRef, useMemo } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import LiveTimelineChart from '../components/LiveTimelineChart';
import JobHistoryDrawer from '../components/JobHistoryDrawer';
import JobProgressModal from '../components/JobProgressModal';
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
          // Prioritize running job
          const runningJob = fetchedJobs.find((j) => j.status === 'Running');
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
    try {
      const token = localStorage.getItem('token');
      const sseUrl = `/api/job-monitoring/stream${token ? `?token=${encodeURIComponent(token)}` : ''}`;
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

    if (status === 'Running') {
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

      // 2. Clickable 12 KPI Card Filter
      const status = (j.status || 'Draft').toLowerCase();
      const elapsed = getJobElapsedSeconds(j);
      const est = j.estimatedDurationSeconds || 28800;

      switch (activeKpiFilter) {
        case 'running':
          return status === 'running';
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
          return status === 'running' && !!j.currentWorkerName;
        case 'all':
        default:
          return true;
      }
    });
  }, [jobs, searchTerm, activeKpiFilter, currentTimeMs]);

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
      {/* SECTION 1: TWELVE CLICKABLE REAL-TIME KPI CARDS                           */}
      {/* ========================================================================= */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Activity size={16} className="text-blue-600" />
            <span>Operational Key Performance Indicators (Click card to filter table)</span>
          </h2>
          {activeKpiFilter !== 'all' && (
            <button
              onClick={() => setActiveKpiFilter('all')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <X size={14} /> Clear Filter ({activeKpiFilter})
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* 1. Total Jobs Tracked */}
          <div
            onClick={() => setActiveKpiFilter('all')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'all'
                ? 'bg-blue-50/80 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">1. Total Tracked</span>
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-700"><Layers size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{kpis?.totalJobs ?? jobs.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">All registered jobs</div>
          </div>

          {/* 2. Running Now */}
          <div
            onClick={() => setActiveKpiFilter('running')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'running'
                ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-white border-emerald-200/80 hover:border-emerald-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase">2. Running Now</span>
              <span className="relative flex h-3 w-3 mt-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
              </span>
            </div>
            <div className="text-2xl font-bold text-emerald-700 mt-2">{kpis?.runningJobs ?? 0}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Active on shop floor</div>
          </div>

          {/* 3. Waiting to Start */}
          <div
            onClick={() => setActiveKpiFilter('waiting')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'waiting'
                ? 'bg-slate-100 border-slate-500 shadow-md ring-2 ring-slate-500/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">3. Waiting Start</span>
              <span className="p-1.5 rounded-lg bg-slate-100 text-slate-600"><Clock size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{kpis?.scheduledJobs ?? 0}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Draft & Scheduled</div>
          </div>

          {/* 4. Paused Jobs */}
          <div
            onClick={() => setActiveKpiFilter('paused')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'paused'
                ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                : 'bg-white border-amber-200/80 hover:border-amber-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-amber-700 uppercase">4. Paused</span>
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700"><Pause size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-amber-700 mt-2">{kpis?.pausedJobs ?? 0}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">Temporary hold</div>
          </div>

          {/* 5. Blocked Jobs */}
          <div
            onClick={() => setActiveKpiFilter('blocked')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'blocked'
                ? 'bg-orange-50 border-orange-500 shadow-md ring-2 ring-orange-500/20'
                : 'bg-white border-orange-200/80 hover:border-orange-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-orange-700 uppercase">5. Blocked</span>
              <span className="p-1.5 rounded-lg bg-orange-100 text-orange-700"><AlertOctagon size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-orange-700 mt-2">{kpis?.blockedJobs ?? 0}</div>
            <div className="text-[11px] text-orange-600 mt-0.5">Issue escalation</div>
          </div>

          {/* 6. Overdue Jobs */}
          <div
            onClick={() => setActiveKpiFilter('overdue')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'overdue'
                ? 'bg-rose-50 border-rose-500 shadow-md ring-2 ring-rose-500/20'
                : 'bg-white border-rose-200/80 hover:border-rose-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-rose-700 uppercase">6. Overdue</span>
              <span className="p-1.5 rounded-lg bg-rose-100 text-rose-700"><AlertTriangle size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-rose-700 mt-2">{kpis?.overdueJobs ?? 0}</div>
            <div className="text-[11px] text-rose-600 font-medium mt-0.5">Past schedule / limit</div>
          </div>

          {/* 7. Completed Today */}
          <div
            onClick={() => setActiveKpiFilter('completed_today')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'completed_today'
                ? 'bg-emerald-50 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-emerald-800 uppercase">7. Completed</span>
              <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700"><CheckCheck size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-emerald-800 mt-2">{kpis?.completedToday ?? kpis?.completedJobs ?? 0}</div>
            <div className="text-[11px] text-emerald-600 mt-0.5">Finalized jobs</div>
          </div>

          {/* 8. Jobs at Risk */}
          <div
            onClick={() => setActiveKpiFilter('at_risk')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'at_risk'
                ? 'bg-amber-50 border-amber-500 shadow-md ring-2 ring-amber-500/20'
                : 'bg-white border-amber-200/80 hover:border-amber-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-amber-800 uppercase">8. Jobs at Risk</span>
              <span className="p-1.5 rounded-lg bg-amber-100 text-amber-700"><Flame size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-amber-800 mt-2">{kpis?.jobsAtRisk ?? 0}</div>
            <div className="text-[11px] text-amber-600 mt-0.5">&gt;85% effort used</div>
          </div>

          {/* 9. Total Planned Effort */}
          <div
            onClick={() => setActiveKpiFilter('all')}
            className="p-4 rounded-xl border bg-white border-slate-200/80 hover:border-slate-300 shadow-sm cursor-pointer"
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">9. Planned Effort</span>
              <span className="p-1.5 rounded-lg bg-blue-100 text-blue-700"><Calendar size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2">{kpis?.totalPlannedHours ?? 8.0}h</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Budgeted hours</div>
          </div>

          {/* 10. Active Working Time */}
          <div
            onClick={() => setActiveKpiFilter('all')}
            className="p-4 rounded-xl border bg-white border-slate-200/80 hover:border-slate-300 shadow-sm cursor-pointer"
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">10. Working Time</span>
              <span className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700"><Clock size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-indigo-700 mt-2">{kpis?.activeWorkingHours ?? 4.2}h</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Cumulative floor time</div>
          </div>

          {/* 11. Time Variance */}
          <div
            onClick={() => setActiveKpiFilter('variance')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'variance'
                ? 'bg-rose-50 border-rose-500 shadow-md ring-2 ring-rose-500/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">11. Variance</span>
              <span className="p-1.5 rounded-lg bg-purple-100 text-purple-700"><TrendingUp size={16} /></span>
            </div>
            <div className={`text-2xl font-bold mt-2 ${(kpis?.avgVarianceHours || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {(kpis?.avgVarianceHours || 0) > 0 ? `+${kpis?.avgVarianceHours}h` : `${kpis?.avgVarianceHours || 0.0}h`}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Avg deviation</div>
          </div>

          {/* 12. Active Workers */}
          <div
            onClick={() => setActiveKpiFilter('active_workers')}
            className={`p-4 rounded-xl border cursor-pointer transition-all ${
              activeKpiFilter === 'active_workers'
                ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="text-[11px] font-semibold text-slate-500 uppercase">12. Active Workers</span>
              <span className="p-1.5 rounded-lg bg-teal-100 text-teal-700"><Users size={16} /></span>
            </div>
            <div className="text-2xl font-bold text-teal-700 mt-2">{kpis?.activeWorkersCount ?? 1}</div>
            <div className="text-[11px] text-teal-600 font-medium mt-0.5">Logged-in engineers</div>
          </div>
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
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Live Active Jobs & Handover Station</h2>
              <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold">
                {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            </div>
            <p className="text-slate-500 text-xs mt-0.5">
              1-second live ticking timers, worker accountability badges & inline shift handover modal
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search job, panel, worker..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Quick KPI filter badge if active */}
            {activeKpiFilter !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium border border-blue-200">
                <span>Filter: {activeKpiFilter}</span>
                <button onClick={() => setActiveKpiFilter('all')} className="hover:text-blue-900">
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200/80 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Job ID & Panel</th>
                <th className="py-3 px-3">Priority</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-4">Current Worker & Position</th>
                <th className="py-3 px-3">Prev / Next Assignee</th>
                <th className="py-3 px-4 font-mono">Live Elapsed Time</th>
                <th className="py-3 px-4">Progress / Budget</th>
                <th className="py-3 px-4 text-center">Handover</th>
                <th className="py-3 px-4 text-right">Execution Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-normal">
              {filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-8 text-center text-slate-400">
                    No jobs matching your filter or search query.
                  </td>
                </tr>
              ) : (
                filteredJobs.map((j) => {
                  const elapsedSeconds = getJobElapsedSeconds(j);
                  const isRunning = j.status === 'Running';
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
                      className={`hover:bg-blue-50/40 transition-colors ${
                        isSelected ? 'bg-blue-50/60 font-medium' : ''
                      }`}
                    >
                      {/* Job ID & Panel */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedJobId(j.id)}
                            className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer text-xs"
                            title="Focus in Timeline Chart"
                          >
                            <span>{j.jobNo}</span>
                            <Eye size={12} className="opacity-60" />
                          </button>
                        </div>
                        <div className="text-slate-800 font-medium truncate max-w-[180px] mt-0.5">
                          {j.panelName || 'Industrial Panel'}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                          {j.clientName || 'General Client'}
                        </div>
                      </td>

                      {/* Priority */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            j.priority === 'Urgent'
                              ? 'bg-rose-100 text-rose-700 border border-rose-200'
                              : j.priority === 'High'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {j.priority || 'Normal'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            isRunning
                              ? 'bg-emerald-100 text-emerald-800'
                              : isPaused
                              ? 'bg-amber-100 text-amber-800'
                              : isCompleted
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {isRunning && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />}
                          {j.status}
                        </span>
                      </td>

                      {/* Current Worker & Position */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <UserCheck size={14} className="text-blue-600" />
                          <span>{j.currentWorkerName || j.assignedEngineer || 'Unassigned'}</span>
                        </div>
                        <div className="text-[11px] text-blue-700 font-medium mt-0.5">
                          {j.currentWorkerPosition || 'Operations Engineer'}
                        </div>
                      </td>

                      {/* Prev / Next Assignee */}
                      <td className="py-3.5 px-3">
                        <div className="text-[11px] text-slate-500">
                          <span className="text-slate-400">Prev:</span> {j.previousWorkerName || '—'}
                        </div>
                        <div className="text-[11px] text-slate-700 font-medium mt-0.5">
                          <span className="text-slate-400">Next:</span> {j.nextWorkerName || 'Not Set'}
                        </div>
                      </td>

                      {/* Live Elapsed Time (1-Second Ticking!) */}
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <div className="flex items-center gap-1.5">
                          <Clock size={14} className={isRunning ? 'text-emerald-600 animate-spin-slow' : 'text-slate-400'} />
                          <span className={`text-sm ${isRunning ? 'text-emerald-700' : isPaused ? 'text-amber-700' : 'text-slate-800'}`}>
                            {formatTime(elapsedSeconds)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Est: {(estSeconds / 3600).toFixed(1)}h
                        </div>
                      </td>

                      {/* Progress / Budget */}
                      <td className="py-3.5 px-4 min-w-[130px]">
                        <div className="flex justify-between items-center text-[11px] font-semibold mb-1">
                          <span className={isOverrun ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {budgetPercent}% used
                          </span>
                          {isOverrun && <span className="text-[10px] text-rose-500 font-bold">OVERRUN</span>}
                        </div>
                        <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOverrun ? 'bg-rose-500' : budgetPercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(100, budgetPercent)}%` }}
                          />
                        </div>
                      </td>

                      {/* Handover & Quick Actions */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => openHandoverModal(j)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-xs font-semibold border border-amber-200 transition-all cursor-pointer"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold border border-indigo-200 transition-all cursor-pointer"
                            title="Record progress percentage and units"
                          >
                            <Activity size={13} />
                            <span>Progress</span>
                          </button>
                          <button
                            onClick={() => {
                              setHistoryJobId(j.id);
                              setHistoryDrawerOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 transition-all cursor-pointer"
                            title="View chronological audit history"
                          >
                            <Clock size={13} />
                          </button>
                        </div>
                      </td>

                      {/* Execution Controls */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isDraft && (
                            <button
                              onClick={() => handleStart(j.id)}
                              disabled={actionLoading === `start-${j.id}`}
                              className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
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
                                className="px-2.5 py-1 rounded-md bg-amber-500 hover:bg-amber-400 text-white font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Pause size={12} fill="currentColor" />
                                <span>Pause</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
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
                                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                <Play size={12} fill="currentColor" />
                                <span>Resume</span>
                              </button>
                              <button
                                onClick={() => handleComplete(j.id)}
                                disabled={actionLoading === `complete-${j.id}`}
                                className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-1 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                <CheckCircle2 size={12} />
                                <span>Finish</span>
                              </button>
                            </>
                          )}

                          {isCompleted && (
                            <span className="text-[11px] text-slate-400 font-medium">Archived</span>
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
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: EMBEDDED OPERATIONAL ANALYTICS GRAPHS (RECHARTS)               */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
          <BarChart3 size={16} className="text-blue-600" />
          <span>Operational Analytics & Capacity Distribution (Recharts)</span>
        </h2>

        {/* 2-Column Row 1: Planned vs Actual & Delay Bottlenecks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 1. Planned vs Actual Duration */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">1. Planned vs. Actual Duration (Hours)</h3>
                <p className="text-xs text-slate-500">Compares budgeted estimate vs floor execution time</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plannedVsActual} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="jobNo" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="estimatedHours" name="Estimated Budget (hrs)" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualHours" name="Actual Logged (hrs)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Delay & Bottleneck Breakdown */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">2. Delay & Bottleneck Breakdown</h3>
                <p className="text-xs text-slate-500">Active working vs pause holds vs schedule overrun</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={bottlenecks.length > 0 ? bottlenecks : plannedVsActual}
                  margin={{ top: 10, right: 10, left: -20, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="jobNo" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="activeHours" name="Active Time (hrs)" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="pauseHours" name="Pause Holds (hrs)" fill="#f59e0b" stackId="a" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="overrunHours" name="Overrun Lag (hrs)" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 2-Column Row 2: Department Workload & Flow Velocity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 3. Department Workload */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">3. Department Workload & Queue Distribution</h3>
                <p className="text-xs text-slate-500">Active, paused, scheduled and completed per department</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={workload} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="active" name="Active Running" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="paused" name="Paused" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="scheduled" name="Queued" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="completed" name="Completed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Production Flow Velocity */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">4. Production Flow Stage Velocity</h3>
                <p className="text-xs text-slate-500">Average stage turnaround hours vs target benchmarks</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowVelocity} margin={{ top: 10, right: 10, left: -20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  <Bar dataKey="targetHours" name="Target Benchmark (hrs)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgHours" name="Actual Average (hrs)" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
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
                  <h3 className="font-bold text-slate-900 text-base">Worker Shift Handover Station</h3>
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
    </div>
  );
}
