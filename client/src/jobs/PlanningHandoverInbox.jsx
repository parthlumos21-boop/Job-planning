import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  ArrowRightLeft, Search, Filter, RefreshCw, CheckCircle2,
  Clock, AlertCircle, Eye, Edit3, User, ChevronRight, Loader2, Send,
  ShieldCheck, AlertTriangle, Layers, Calendar, ArrowUpRight,
  LayoutGrid, Table as TableIcon, UserCheck, Play, CheckCheck, RotateCcw,
  Tag, Sparkles, Building2, HelpCircle
} from 'lucide-react';
import {
  AssignOwnerModal, ReassignOwnerModal, ClarificationModal,
  CorrectionModal, ReleaseModal
} from './ControlCenterModals';
import DepartmentHandoverModal from './DepartmentHandoverModal';
import { WORKFLOW_CONFIG } from '../config/workflowConfig';

const STAGE_CONFIG = {
  INCOMING: {
    label: 'Incoming',
    badge: 'bg-slate-100 text-slate-700 border-slate-300',
    color: 'border-slate-400 text-slate-700',
    description: 'Submitted from marketing/previous dept; awaiting initial verification'
  },
  VERIFICATION: {
    label: 'Verification',
    badge: 'bg-amber-50 text-amber-700 border-amber-300',
    color: 'border-amber-400 text-amber-700',
    description: 'Checklist requirements and drawings actively being reviewed'
  },
  PLANNING_READY: {
    label: 'Planning Ready',
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-300',
    color: 'border-indigo-400 text-indigo-700',
    description: 'All mandatory requirements verified; ready for owner assignment'
  },
  PLANNING_ASSIGNED: {
    label: 'Planning Assigned',
    badge: 'bg-blue-50 text-blue-700 border-blue-300',
    color: 'border-blue-400 text-blue-700',
    description: 'Planning owner assigned; awaiting execution start'
  },
  PLANNING_ACTIVE: {
    label: 'Planning Active',
    badge: 'bg-purple-50 text-purple-700 border-purple-300',
    color: 'border-purple-400 text-purple-700',
    description: 'Planning lead actively preparing drawings and engineering documentation'
  },
  NEEDS_CLARIFICATION: {
    label: 'Needs Clarification',
    badge: 'bg-rose-50 text-rose-700 border-rose-300',
    color: 'border-rose-400 text-rose-700',
    description: 'Missing inputs, scope mismatch or customer clarifications needed'
  },
  RELEASED: {
    label: 'Released',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    color: 'border-emerald-400 text-emerald-700',
    description: 'Planning complete; forwarded to next execution department'
  }
};

const STAGES = [
  'INCOMING', 'VERIFICATION', 'PLANNING_READY', 'PLANNING_ASSIGNED',
  'PLANNING_ACTIVE', 'NEEDS_CLARIFICATION', 'RELEASED'
];

export default function PlanningHandoverInbox() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [activeStageFilter, setActiveStageFilter] = useState('ALL');
  const [myActionFilter, setMyActionFilter] = useState(null); // 'waiting_for_me', 'assigned_to_me', 'returned_to_me', 'due_today', 'overdue'
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedRespEngg, setSelectedRespEngg] = useState('all');
  const [selectedOwner, setSelectedOwner] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [startingJobId, setStartingJobId] = useState(null);
  const [attentionFilter, setAttentionFilter] = useState('all'); // 'missing_info', 'unassigned', 'overdue', 'returned', 'ready'
  const [viewMode, setViewMode] = useState('cards'); // 'cards' | 'table'

  // Modals state
  const [modalState, setModalState] = useState({
    assignOpen: false,
    reassignOpen: false,
    clarificationOpen: false,
    correctionOpen: false,
    releaseOpen: false,
    universalOpen: false,
    targetJob: null
  });

  const fetchJobsAndSummary = async () => {
    try {
      setRefreshing(true);
      const [jobsRes, summaryRes] = await Promise.allSettled([
        api.get('/jobs'),
        api.get('/jobs/control-center/summary')
      ]);

      if (jobsRes.status === 'fulfilled') {
        const all = Array.isArray(jobsRes.value.data) ? jobsRes.value.data : (jobsRes.value.data.jobs || []);
        setJobs(all);
      }
      if (summaryRes.status === 'fulfilled' && summaryRes.value.data) {
        setSummaryData(summaryRes.value.data);
      }
    } catch (err) {
      console.error('Failed to load Control Center data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobsAndSummary();

    // Real-Time SSE
    let evtSource = null;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        evtSource = new EventSource(`/api/job-monitoring/stream?token=${encodeURIComponent(token)}`);
        evtSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.event_type && (
              payload.event_type.startsWith('HANDOVER_') ||
              payload.event_type.startsWith('STAGE_') ||
              payload.event_type.startsWith('JOB_') ||
              payload.event_type.startsWith('PLANNING_')
            )) {
              fetchJobsAndSummary();
            }
          } catch (e) {
            // ignore parsing error
          }
        };
        evtSource.onerror = () => {
          if (evtSource && evtSource.readyState === EventSource.CLOSED) {
            evtSource.close();
          }
        };
      } catch (err) {
        console.warn('SSE not connected:', err);
      }
    }

    return () => {
      if (evtSource) evtSource.close();
    };
  }, []);

  // Compute Stage Counts fallback
  const stageCounts = useMemo(() => {
    if (summaryData?.stageCounts) return summaryData.stageCounts;
    const counts = { INCOMING: 0, VERIFICATION: 0, PLANNING_READY: 0, PLANNING_ASSIGNED: 0, PLANNING_ACTIVE: 0, NEEDS_CLARIFICATION: 0, RELEASED: 0, total: jobs.length };
    jobs.forEach(j => {
      const st = (j.currentStage || 'INCOMING').toUpperCase();
      if (counts[st] !== undefined) counts[st]++;
      else counts.INCOMING++;
    });
    return counts;
  }, [jobs, summaryData]);

  // Compute My Action Counts fallback
  const myActionCounts = useMemo(() => {
    if (summaryData?.myActions) return summaryData.myActions;
    const currentName = user?.name || user?.username || '';
    let waiting = 0, assigned = 0, returned = 0, dueToday = 0, overdue = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    jobs.forEach(j => {
      const isOwner = j.planningOwnerName && j.planningOwnerName.toLowerCase() === currentName.toLowerCase();
      const isResp = j.responsibleEnggName && j.responsibleEnggName.toLowerCase() === currentName.toLowerCase();
      const st = (j.currentStage || 'INCOMING').toUpperCase();

      if (isOwner) assigned++;
      if (isResp && st === 'NEEDS_CLARIFICATION') returned++;
      if (isOwner && (st === 'PLANNING_ASSIGNED' || st === 'PLANNING_ACTIVE')) waiting++;
      if (!j.planningOwnerName && (st === 'INCOMING' || st === 'VERIFICATION')) waiting++;

      if (j.stageDueDate) {
        const dueDate = j.stageDueDate.split('T')[0];
        if (dueDate === todayStr) dueToday++;
        else if (dueDate < todayStr && st !== 'RELEASED') overdue++;
      }
    });

    return { waitingForMe: waiting, assignedToMe: assigned, returnedToMe: returned, dueToday, overdue };
  }, [jobs, summaryData, user]);

  // Filter options lists
  const engineers = useMemo(() => {
    const set = new Set();
    jobs.forEach(j => { if (j.responsibleEnggName) set.add(j.responsibleEnggName); });
    return Array.from(set).sort();
  }, [jobs]);

  const planningOwners = useMemo(() => {
    const set = new Set();
    jobs.forEach(j => { if (j.planningOwnerName) set.add(j.planningOwnerName); });
    return Array.from(set).sort();
  }, [jobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    const currentName = (user?.name || user?.username || '').toLowerCase();
    const todayStr = new Date().toISOString().split('T')[0];

    return jobs.filter(j => {
      const stage = (j.currentStage || 'INCOMING').toUpperCase();

      // Stage Filter
      if (activeStageFilter !== 'ALL' && stage !== activeStageFilter) return false;

      // My Action Filter
      if (myActionFilter === 'waiting_for_me') {
        const isOwner = j.planningOwnerName && j.planningOwnerName.toLowerCase() === currentName;
        const isWaiting = (isOwner && (stage === 'PLANNING_ASSIGNED' || stage === 'PLANNING_ACTIVE')) ||
          (!j.planningOwnerName && (stage === 'INCOMING' || stage === 'VERIFICATION'));
        if (!isWaiting) return false;
      } else if (myActionFilter === 'assigned_to_me') {
        if (!j.planningOwnerName || j.planningOwnerName.toLowerCase() !== currentName) return false;
      } else if (myActionFilter === 'returned_to_me') {
        const isResp = j.responsibleEnggName && j.responsibleEnggName.toLowerCase() === currentName;
        if (!isResp || stage !== 'NEEDS_CLARIFICATION') return false;
      } else if (myActionFilter === 'due_today') {
        if (!j.stageDueDate || j.stageDueDate.split('T')[0] !== todayStr) return false;
      } else if (myActionFilter === 'overdue') {
        if (!j.stageDueDate || j.stageDueDate.split('T')[0] >= todayStr || stage === 'RELEASED') return false;
      }

      // Attention Filters
      if (attentionFilter === 'missing_info') {
        const hasMissing = stage === 'NEEDS_CLARIFICATION' || !j.clientName || !j.poDate;
        if (!hasMissing) return false;
      } else if (attentionFilter === 'unassigned') {
        if (j.planningOwnerName) return false;
      } else if (attentionFilter === 'overdue') {
        if (!j.stageDueDate || j.stageDueDate.split('T')[0] >= todayStr || stage === 'RELEASED') return false;
      } else if (attentionFilter === 'returned') {
        if (stage !== 'NEEDS_CLARIFICATION') return false;
      } else if (attentionFilter === 'ready') {
        if (stage !== 'PLANNING_READY') return false;
      }

      // Dropdown Filters
      if (selectedRespEngg !== 'all' && j.responsibleEnggName !== selectedRespEngg) return false;
      if (selectedOwner !== 'all' && j.planningOwnerName !== selectedOwner) return false;
      if (selectedPriority !== 'all' && (j.priority || 'Normal') !== selectedPriority) return false;

      // Full Text Search
      if (search) {
        const q = search.toLowerCase();
        const match =
          (j.jobNo || '').toLowerCase().includes(q) ||
          (j.panelName || '').toLowerCase().includes(q) ||
          (j.clientName || '').toLowerCase().includes(q) ||
          (j.projectName || '').toLowerCase().includes(q) ||
          (j.responsibleEnggName || '').toLowerCase().includes(q) ||
          (j.planningOwnerName || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [
    jobs, activeStageFilter, myActionFilter, attentionFilter,
    selectedRespEngg, selectedOwner, selectedPriority, search, user
  ]);

  // Actions
  const handleStartPlanning = async (job) => {
    try {
      setStartingJobId(job.id);
      const res = await api.post(`/jobs/${job.id}/control/start-planning`, {
        note: 'Planning work initiated'
      });
      if (res.data?.job) {
        handleJobSuccess(res.data.job);
      }
    } catch (err) {
      console.error('Failed to start planning milestone:', err);
      alert(err.response?.data?.detail || 'Failed to start planning milestone');
    } finally {
      setStartingJobId(null);
    }
  };

  const handleJobSuccess = (updatedJob) => {
    if (!updatedJob) return;
    setJobs(prev => prev.map(j => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j)));
    fetchJobsAndSummary();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">

      {/* TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 backdrop-blur-md p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white shadow-lg shadow-indigo-500/25">
            <Layers size={24} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              Job Planning Control Center
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobsAndSummary}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all active:scale-95"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-indigo-600' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* STAGE KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <button
          onClick={() => { setActiveStageFilter('ALL'); setMyActionFilter(null); }}
          className={`p-3 rounded-xl border text-left transition-all ${
            activeStageFilter === 'ALL' && !myActionFilter
              ? 'bg-slate-900 text-white border-slate-900 shadow-md'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">All Jobs</div>
          <div className="text-xl font-extrabold mt-0.5">{jobs.length}</div>
        </button>

        {STAGES.map(stageKey => {
          const cfg = STAGE_CONFIG[stageKey];
          const count = stageCounts[stageKey] || 0;
          const isActive = activeStageFilter === stageKey && !myActionFilter;

          return (
            <button
              key={stageKey}
              onClick={() => { setActiveStageFilter(stageKey); setMyActionFilter(null); }}
              className={`p-3 rounded-xl border text-left transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider truncate opacity-75">
                {cfg.label}
              </div>
              <div className="text-xl font-extrabold mt-0.5">{count}</div>
            </button>
          );
        })}
      </div>


      {/* SEARCH & MULTI-DIMENSIONAL FILTERS */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Job #, Panel, Client, Project, Engineer..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedRespEngg}
              onChange={e => setSelectedRespEngg(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Resp. Engineer: All</option>
              {engineers.map(eng => (
                <option key={eng} value={eng}>{eng}</option>
              ))}
            </select>

            <select
              value={selectedOwner}
              onChange={e => setSelectedOwner(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Planning Owner: All</option>
              {planningOwners.map(po => (
                <option key={po} value={po}>{po}</option>
              ))}
            </select>

            <select
              value={selectedPriority}
              onChange={e => setSelectedPriority(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value="all">Priority: All</option>
              <option value="Low">Low</option>
              <option value="Normal">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 bg-slate-100 rounded-xl border border-slate-200 ml-auto">
              <button
                onClick={() => setViewMode('cards')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'cards' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                title="Work Cards View"
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all ${viewMode === 'table' ? 'bg-white text-indigo-600 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                title="Table View"
              >
                <TableIcon size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Attention Bottleneck Quick Filters */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1">Attention:</span>
          {[
            { id: 'all', label: 'All Jobs' },
            { id: 'missing_info', label: 'Missing Information' },
            { id: 'unassigned', label: 'Unassigned Planning Owner' },
            { id: 'overdue', label: 'Overdue Jobs' },
            { id: 'returned', label: 'Returned for Clarification' },
            { id: 'ready', label: 'Ready to Start' },
          ].map(tag => (
            <button
              key={tag.id}
              onClick={() => setAttentionFilter(tag.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                attentionFilter === tag.id
                  ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </div>

      {/* JOB QUEUE DISPLAY */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-200">
          <Loader2 size={28} className="animate-spin text-indigo-600" />
          <span className="font-semibold">Loading Control Center Queue...</span>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="p-16 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          No jobs match current stage, filter, or search parameters.
        </div>
      ) : viewMode === 'cards' ? (
        /* WORK CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredJobs.map(job => {
            const stage = (job.currentStage || 'INCOMING').toUpperCase();
            const stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.INCOMING;
            const isClarification = stage === 'NEEDS_CLARIFICATION';

            return (
              <div
                key={job.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden"
              >
                {/* Card Top Strip */}
                <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/jobs/${job.id}`}
                        className="text-base font-extrabold text-slate-900 hover:text-indigo-600 transition-colors"
                      >
                        #{job.jobNo}
                      </Link>
                      <span className="text-slate-300">•</span>
                      <span className="font-bold text-slate-800 text-xs truncate max-w-[220px]">
                        {job.panelName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      <strong>Client:</strong> {job.clientName || 'General Client'} {job.projectName ? `• ${job.projectName}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${stageCfg.badge}`}>
                      {stageCfg.label}
                    </span>
                    {job.priority && (
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        job.priority === 'Urgent' ? 'text-rose-600' : job.priority === 'High' ? 'text-amber-600' : 'text-slate-400'
                      }`}>
                        Priority: {job.priority}
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Details Body */}
                <div className="p-5 flex-1 space-y-3 text-xs">
                  {/* Responsibility Strip */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                        Responsible Engineer
                      </span>
                      <span className="font-bold text-slate-800 flex items-center gap-1 truncate">
                        <User size={12} className="text-slate-400 shrink-0" />
                        {job.responsibleEnggName || 'Unassigned'}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-100">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 block mb-0.5">
                        Planning Owner
                      </span>
                      <span className="font-bold text-indigo-950 flex items-center gap-1 truncate">
                        <ShieldCheck size={12} className="text-indigo-600 shrink-0" />
                        {job.planningOwnerName || <em className="text-slate-400 font-normal">Not Assigned</em>}
                      </span>
                    </div>
                  </div>

                  {/* Current Action & Waiting Callout */}
                  <div className="space-y-1.5">
                    <div className="text-[11px]">
                      <span className="font-semibold text-slate-500">Current Action: </span>
                      <span className="font-bold text-slate-800">{job.currentAction || 'Awaiting Stage Action'}</span>
                    </div>

                    {job.currentWaitingReason && (
                      <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] flex items-start gap-2">
                        <Clock size={13} className="shrink-0 mt-0.5 text-amber-600" />
                        <div>
                          <strong className="block text-[10px] uppercase tracking-wider text-amber-700">Why Waiting:</strong>
                          <span>{job.currentWaitingReason}</span>
                        </div>
                      </div>
                    )}

                    {isClarification && job.handoverReturnReason && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-[11px] flex items-start gap-2">
                        <AlertCircle size={13} className="shrink-0 mt-0.5 text-rose-600" />
                        <div>
                          <strong className="block text-[10px] uppercase tracking-wider text-rose-700">Clarification Query:</strong>
                          <span className="whitespace-pre-wrap">{job.handoverReturnReason}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Readiness Indicators Strip */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">Readiness:</span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      job.jobNo ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}>
                      ✓ Job Info
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      job.clientName ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}>
                      ✓ Client Info
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      job.responsibleEnggName ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {job.responsibleEnggName ? '✓ Resp Engg' : '⚠ Missing Engg'}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                      job.poDate ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}>
                      {job.poDate ? '✓ PO Confirmed' : 'PO Pending'}
                    </span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <Link
                    to={`/jobs/${job.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800"
                  >
                    <span>Open Control Review</span>
                    <ChevronRight size={14} />
                  </Link>

                  <div className="flex items-center gap-1.5">
                    {/* Action Triggers based on stage */}
                    {!job.planningOwnerName ? (
                      <button
                        onClick={() => setModalState(prev => ({ ...prev, assignOpen: true, targetJob: job }))}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      >
                        Assign Owner →
                      </button>
                    ) : (
                      <button
                        onClick={() => setModalState(prev => ({ ...prev, reassignOpen: true, targetJob: job }))}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                        title="Reassign Planning Owner"
                      >
                        Reassign
                      </button>
                    )}

                    {stage === 'PLANNING_ASSIGNED' && (
                      <button
                        onClick={() => handleStartPlanning(job)}
                        disabled={startingJobId === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
                        title="Start planning milestone"
                      >
                        {startingJobId === job.id ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>Starting...</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} className="fill-white" />
                            <span>Start</span>
                          </>
                        )}
                      </button>
                    )}

                    {isClarification ? (
                      <button
                        onClick={() => setModalState(prev => ({ ...prev, correctionOpen: true, targetJob: job }))}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      >
                        Submit Correction
                      </button>
                    ) : (
                      <button
                        onClick={() => setModalState(prev => ({ ...prev, clarificationOpen: true, targetJob: job }))}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 rounded-xl text-xs font-semibold transition-colors"
                        title="Flag missing items or request clarification"
                      >
                        Clarify
                      </button>
                    )}

                    {stage === 'PLANNING_ACTIVE' && (
                      <button
                        onClick={() => setModalState(prev => ({ ...prev, releaseOpen: true, targetJob: job }))}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                      >
                        <Send size={12} />
                        <span>Release</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Job & Panel</th>
                  <th className="py-3.5 px-4">Client / Project</th>
                  <th className="py-3.5 px-4">Stage</th>
                  <th className="py-3.5 px-4">Responsible Engg</th>
                  <th className="py-3.5 px-4">Planning Owner</th>
                  <th className="py-3.5 px-4">Current Action</th>
                  <th className="py-3.5 px-4 text-center">Control Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredJobs.map(job => {
                  const stage = (job.currentStage || 'INCOMING').toUpperCase();
                  const stageCfg = STAGE_CONFIG[stage] || STAGE_CONFIG.INCOMING;

                  return (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <Link to={`/jobs/${job.id}`} className="font-extrabold text-slate-900 hover:text-indigo-600">
                          #{job.jobNo}
                        </Link>
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{job.panelName}</div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{job.clientName || 'General Client'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[160px]">{job.projectName || '—'}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${stageCfg.badge}`}>
                          {stageCfg.label}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{job.responsibleEnggName || 'Unassigned'}</span>
                      </td>

                      <td className="py-3 px-4">
                        {job.planningOwnerName ? (
                          <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            {job.planningOwnerName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Unassigned</span>
                        )}
                      </td>

                      <td className="py-3 px-4 max-w-[200px]">
                        <div className="font-medium text-slate-800 truncate">{job.currentAction || '—'}</div>
                        {job.currentWaitingReason && (
                          <div className="text-[10px] text-amber-700 truncate" title={job.currentWaitingReason}>
                            Waiting: {job.currentWaitingReason}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {!job.planningOwnerName ? (
                            <button
                              onClick={() => setModalState(prev => ({ ...prev, assignOpen: true, targetJob: job }))}
                              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                            >
                              Assign
                            </button>
                          ) : (
                            <button
                              onClick={() => setModalState(prev => ({ ...prev, reassignOpen: true, targetJob: job }))}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold"
                            >
                              Reassign
                            </button>
                          )}

                          {stage === 'PLANNING_ASSIGNED' && (
                            <button
                              onClick={() => handleStartPlanning(job)}
                              disabled={startingJobId === job.id}
                              className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer disabled:opacity-60"
                              title="Start planning milestone"
                            >
                              {startingJobId === job.id ? (
                                <Loader2 size={11} className="animate-spin" />
                              ) : (
                                <Play size={11} className="fill-white" />
                              )}
                              <span>Start</span>
                            </button>
                          )}

                          {stage === 'PLANNING_ACTIVE' && (
                            <button
                              onClick={() => setModalState(prev => ({ ...prev, releaseOpen: true, targetJob: job }))}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 shadow-xs cursor-pointer"
                              title="Release to next department"
                            >
                              <Send size={11} />
                              <span>Release</span>
                            </button>
                          )}

                          <Link
                            to={`/jobs/${job.id}`}
                            className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                            title="Open Detail"
                          >
                            <ArrowUpRight size={16} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTROL CENTER ACTION MODALS */}
      {modalState.assignOpen && (
        <AssignOwnerModal
          job={modalState.targetJob}
          isOpen={modalState.assignOpen}
          onClose={() => setModalState(prev => ({ ...prev, assignOpen: false, targetJob: null }))}
          onSuccess={handleJobSuccess}
        />
      )}

      {modalState.reassignOpen && (
        <ReassignOwnerModal
          job={modalState.targetJob}
          isOpen={modalState.reassignOpen}
          onClose={() => setModalState(prev => ({ ...prev, reassignOpen: false, targetJob: null }))}
          onSuccess={handleJobSuccess}
        />
      )}

      {modalState.clarificationOpen && (
        <ClarificationModal
          job={modalState.targetJob}
          isOpen={modalState.clarificationOpen}
          onClose={() => setModalState(prev => ({ ...prev, clarificationOpen: false, targetJob: null }))}
          onSuccess={handleJobSuccess}
        />
      )}

      {modalState.correctionOpen && (
        <CorrectionModal
          job={modalState.targetJob}
          isOpen={modalState.correctionOpen}
          onClose={() => setModalState(prev => ({ ...prev, correctionOpen: false, targetJob: null }))}
          onSuccess={handleJobSuccess}
        />
      )}

      {modalState.releaseOpen && (
        <ReleaseModal
          job={modalState.targetJob}
          isOpen={modalState.releaseOpen}
          onClose={() => setModalState(prev => ({ ...prev, releaseOpen: false, targetJob: null }))}
          onSuccess={handleJobSuccess}
        />
      )}

      {modalState.universalOpen && (
        <DepartmentHandoverModal
          job={modalState.targetJob}
          isOpen={modalState.universalOpen}
          onClose={() => setModalState(prev => ({ ...prev, universalOpen: false, targetJob: null }))}
          onHandoverSuccess={handleJobSuccess}
        />
      )}
    </div>
  );
}
