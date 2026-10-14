import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  History, ArrowRightLeft, UserCheck, ShieldCheck, Activity,
  Search, RefreshCw, Filter, Layers, Clock, CheckCircle2,
  AlertCircle, Briefcase, ChevronRight, User, Send, Building2
} from 'lucide-react';

const DEPT_BADGES = {
  planning: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  production: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  design: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  mechanical: 'bg-blue-50 text-blue-700 border-blue-200',
  purchase: 'bg-purple-50 text-purple-700 border-purple-200',
  marketing: 'bg-rose-50 text-rose-700 border-rose-200',
  qa: 'bg-amber-50 text-amber-700 border-amber-200',
  dispatch: 'bg-teal-50 text-teal-700 border-teal-200'
};

const ACTION_ICONS = {
  PLANNING_STARTED: <Activity size={14} className="text-indigo-600" />,
  PLANNING_COMPLETED: <CheckCircle2 size={14} className="text-emerald-600" />,
  PLANNING_OWNER_ASSIGNED: <UserCheck size={14} className="text-blue-600" />,
  PLANNING_OWNER_REASSIGNED: <ArrowRightLeft size={14} className="text-purple-600" />,
  JOB_RELEASED_TO_NEXT_DEPARTMENT: <Send size={14} className="text-teal-600" />,
  CLARIFICATION_REQUESTED: <AlertCircle size={14} className="text-rose-600" />,
  CORRECTION_SUBMITTED: <CheckCircle2 size={14} className="text-emerald-600" />
};

export default function LiveActivityDashboard() {
  const [activeTab, setActiveTab] = useState('assignments'); // 'assignments' | 'stream'
  const [activities, setActivities] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedAction, setSelectedAction] = useState('all');
  const [sseConnected, setSseConnected] = useState(false);

  // Fetch all live activity and assignment logs
  const fetchData = async () => {
    try {
      setRefreshing(true);
      const [actRes, assignRes] = await Promise.all([
        api.get('/jobs/activities/all?limit=300').catch(() => ({ data: { activities: [] } })),
        api.get('/jobs/assignments/all?limit=300').catch(() => ({ data: { assignments: [] } }))
      ]);

      setActivities(actRes.data?.activities || []);
      setAssignments(assignRes.data?.assignments || []);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();

    // SSE connection for real-time live activity sync
    let eventSource = null;
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const sseUrl = `/api/job-monitoring/stream?token=${encodeURIComponent(token)}`;
        eventSource = new EventSource(sseUrl);
        eventSource.onopen = () => setSseConnected(true);
        eventSource.onmessage = () => {
          // Instantly refresh when any activity or handover event occurs
          fetchData();
        };
        eventSource.onerror = () => setSseConnected(false);
      } catch {
        setSseConnected(false);
      }
    }

    const interval = setInterval(fetchData, 15000);
    return () => {
      if (eventSource) eventSource.close();
      clearInterval(interval);
    };
  }, []);

  // Filtered Assignments (Who-to-Whom)
  const filteredAssignments = useMemo(() => {
    return assignments.filter(item => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (item.jobNo || '').toLowerCase().includes(q) ||
          (item.panelName || '').toLowerCase().includes(q) ||
          (item.fromWorker || '').toLowerCase().includes(q) ||
          (item.toWorker || '').toLowerCase().includes(q) ||
          (item.assignedBy || '').toLowerCase().includes(q) ||
          (item.reasonCategory || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [assignments, search]);

  // Filtered Department Activities
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      if (selectedDept !== 'all' && (act.department || '').toLowerCase() !== selectedDept.toLowerCase()) {
        return false;
      }
      if (selectedAction !== 'all' && (act.action || '').toLowerCase() !== selectedAction.toLowerCase()) {
        return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const match =
          (act.jobNo || '').toLowerCase().includes(q) ||
          (act.panelName || '').toLowerCase().includes(q) ||
          (act.clientName || '').toLowerCase().includes(q) ||
          (act.performedBy || act.performed_by || '').toLowerCase().includes(q) ||
          (act.action || '').toLowerCase().includes(q) ||
          (act.notes || '').toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [activities, selectedDept, selectedAction, search]);

  // KPI Calculations
  const stats = useMemo(() => {
    const activeEngineers = new Set();
    activities.forEach(a => {
      const p = a.performedBy || a.performed_by;
      if (p && p !== 'System' && p !== 'Admin') activeEngineers.add(p);
    });
    assignments.forEach(h => {
      if (h.toWorker && h.toWorker !== 'Unassigned') activeEngineers.add(h.toWorker);
      if (h.assignedBy) activeEngineers.add(h.assignedBy);
    });

    const deptCounts = {};
    activities.forEach(a => {
      const d = (a.department || 'planning').toLowerCase();
      deptCounts[d] = (deptCounts[d] || 0) + 1;
    });
    const topDept = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Planning';

    return {
      totalActivities: activities.length,
      totalAssignments: assignments.length,
      topDept: topDept.toUpperCase(),
      activeEngineersCount: activeEngineers.size || 1
    };
  }, [activities, assignments]);

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-slate-900 rounded-2xl px-6 py-5 text-white shadow-xl flex items-center justify-between border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-md shadow-indigo-500/20">
            <History size={24} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            Live Activity
          </h1>
        </div>
      </div>

      {/* 2. DUAL-TAB CONTROL STRIP */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'assignments'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <ArrowRightLeft size={14} />
              <span>Assigned Transfer ({filteredAssignments.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('stream')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'stream'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Activity size={14} />
              <span>Department Activity Stream ({filteredActivities.length})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Job #, Panel, or Person..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Filters if Stream Tab Active */}
        {activeTab === 'stream' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Department:</span>
            {['all', 'planning', 'production', 'design', 'mechanical', 'purchase', 'marketing'].map(dept => (
              <button
                key={dept}
                onClick={() => setSelectedDept(dept)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  selectedDept === dept
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {dept === 'all' ? 'All Departments' : dept.charAt(0).toUpperCase() + dept.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin text-indigo-600" />
          <span className="font-semibold">Loading Live Activity...</span>
        </div>
      ) : activeTab === 'assignments' ? (
        /* TAB 1: ASSIGNED TRANSFER */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Assigned Transfer</h2>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
              {filteredAssignments.length} Transfers
            </span>
          </div>

          {filteredAssignments.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400">
              No assigned transfer events found matching your filter.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredAssignments.map((item, idx) => (
                <div key={item.id || idx} className="p-5 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left: Job & Transfer Flow */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/jobs/${item.jobId}`}
                        className="font-black text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        #{item.jobNo}
                      </Link>
                      <span className="text-slate-300">•</span>
                      <span className="font-bold text-slate-900 text-xs">{item.panelName || 'Standard Panel'}</span>
                      {item.clientName && (
                        <span className="text-slate-400 text-[11px]">({item.clientName})</span>
                      )}
                    </div>

                    {/* From -> To Transfer Pill */}
                    <div className="inline-flex items-center gap-2 p-2 rounded-xl bg-slate-100/90 border border-slate-200/80 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <span className="text-[10px] uppercase font-bold text-slate-400">From:</span>
                        <span className="font-semibold text-slate-700">{item.fromWorker || 'Unassigned'}</span>
                      </div>
                      <ArrowRightLeft size={14} className="text-indigo-600 mx-1 shrink-0" />
                      <div className="flex items-center gap-1.5 text-indigo-950 font-bold bg-white px-2 py-0.5 rounded-lg border border-indigo-200/80 shadow-2xs">
                        <span className="text-[10px] uppercase text-indigo-500">Assigned To:</span>
                        <span className="text-indigo-700">{item.toWorker || 'Unassigned'}</span>
                      </div>
                    </div>

                    {/* Reason Category & Detailed Explanation */}
                    <div className="text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                          {item.reasonCategory || 'Assignment'}
                        </span>
                        {item.detailedExplanation && (
                          <span className="text-slate-700 text-[11px] font-medium italic">
                            "{item.detailedExplanation}"
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Assigned By & Date Stamp */}
                  <div className="flex flex-col items-start sm:items-end gap-1 shrink-0 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-[11px] text-slate-400 font-medium">Assigned by:</span>
                      <strong className="text-slate-900">{item.assignedBy || 'Admin'}</strong>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Clock size={12} />
                      <span>{item.timestamp ? new Date(item.timestamp).toLocaleString() : '—'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* TAB 2: ALL DEPARTMENT ACTIVITY STREAM */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Cross-Department Live Activity Feed</h2>
              <p className="text-xs text-slate-500">Real-time timestamped events across Planning, Production, Design, QA, and Procurement</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredActivities.length} Live Events
            </span>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400">
              No activity logs recorded matching your department and search parameters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredActivities.map((act, idx) => {
                const deptBadge = DEPT_BADGES[act.department?.toLowerCase()] || DEPT_BADGES.planning;
                const icon = ACTION_ICONS[act.action] || <Activity size={14} className="text-slate-600" />;
                const who = act.performedBy || act.performed_by || act.updated_by || 'Admin';

                return (
                  <div key={act.id || idx} className="p-4 hover:bg-slate-50/70 transition-colors flex items-start gap-3.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0 mt-0.5">
                      {icon}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/jobs/${act.jobId}`}
                            className="font-bold text-indigo-600 hover:text-indigo-800 text-xs"
                          >
                            #{act.jobNo}
                          </Link>
                          <span className="font-semibold text-slate-900">{act.panelName || 'Panel'}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${deptBadge}`}>
                            {act.department || 'Planning'}
                          </span>
                        </div>

                        <span className="text-[11px] text-slate-400 font-mono">
                          {act.timestamp ? new Date(act.timestamp).toLocaleString() : '—'}
                        </span>
                      </div>

                      {/* Action & Who */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                          {(act.action || 'ACTIVITY').replace(/_/g, ' ')}
                        </span>
                        <span className="text-slate-600">
                          <strong>WHO:</strong> <span className="font-bold text-slate-900">{who}</span>
                        </span>
                        {act.category && (
                          <span className="text-slate-500 font-medium">
                            • Reason: <strong>{act.category}</strong>
                          </span>
                        )}
                      </div>

                      {/* Notes / Details */}
                      {act.notes && (
                        <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/70 font-mono text-[11px] text-slate-700 whitespace-pre-wrap max-w-3xl">
                          {act.notes}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
