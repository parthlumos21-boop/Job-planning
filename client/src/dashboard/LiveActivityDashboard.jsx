import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import {
  History, Activity, Search, RefreshCw, Layers, Clock,
  CheckCircle2, AlertCircle, FileText, Send, UserCheck,
  ArrowRightLeft, PlusCircle, ShieldCheck
} from 'lucide-react';

export const normalizeDepartment = (deptStr) => {
  const s = String(deptStr || '').trim().toLowerCase();
  if (!s) return 'planning';
  if (s.includes('mech')) return 'mechanical';
  if (s.includes('elect') || (s.includes('design') && !s.includes('mech'))) return 'design';
  if (s.includes('purch') || s.includes('proc')) return 'purchase';
  if (s.includes('prod') || s.includes('qc') || s.includes('disp')) return 'production';
  if (s.includes('market')) return 'marketing';
  if (s.includes('plan')) return 'planning';
  return s;
};

const DEPT_CONFIG = {
  planning: { label: 'Planning', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  production: { label: 'Production', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  design: { label: 'Design', badge: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  mechanical: { label: 'Mechanical', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  purchase: { label: 'Purchase', badge: 'bg-purple-50 text-purple-700 border-purple-200' },
  marketing: { label: 'Marketing', badge: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const ACTION_ICONS = {
  JOB_CREATED: <PlusCircle size={14} className="text-emerald-600" />,
  TASK_CREATED: <Activity size={14} className="text-indigo-600" />,
  TASK_COMPLETED: <CheckCircle2 size={14} className="text-emerald-600" />,
  TASK_UPDATED: <Activity size={14} className="text-blue-600" />,
  PLANNING_STARTED: <Activity size={14} className="text-indigo-600" />,
  PLANNING_COMPLETED: <CheckCircle2 size={14} className="text-emerald-600" />,
  PLANNING_OWNER_ASSIGNED: <UserCheck size={14} className="text-blue-600" />,
  PLANNING_OWNER_REASSIGNED: <ArrowRightLeft size={14} className="text-purple-600" />,
  JOB_RELEASED_TO_NEXT_DEPARTMENT: <Send size={14} className="text-teal-600" />,
  CLARIFICATION_REQUESTED: <AlertCircle size={14} className="text-rose-600" />,
  CORRECTION_SUBMITTED: <CheckCircle2 size={14} className="text-emerald-600" />
};

export default function LiveActivityDashboard() {
  const [activeTab, setActiveTab] = useState('stream'); // 'stream' | 'logs'
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [sseConnected, setSseConnected] = useState(false);

  // Fetch all department activities (PostgreSQL department_activities)
  const fetchData = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/jobs/activities/all?limit=500');
      setActivities(res.data?.activities || []);
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

  // Filtered Department Activities with robust normalization
  const filteredActivities = useMemo(() => {
    return activities.filter(act => {
      if (selectedDept !== 'all') {
        const norm = normalizeDepartment(act.department);
        if (norm !== selectedDept) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const who = (act.performedBy || act.performed_by || act.updated_by || '').toLowerCase();
        const notesStr = typeof act.notes === 'string' ? act.notes.toLowerCase() : '';
        const match =
          (act.jobNo || '').toLowerCase().includes(q) ||
          (act.panelName || '').toLowerCase().includes(q) ||
          (act.clientName || '').toLowerCase().includes(q) ||
          who.includes(q) ||
          (act.action || '').toLowerCase().includes(q) ||
          notesStr.includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [activities, selectedDept, search]);

  // KPI Calculations
  const stats = useMemo(() => {
    const activeUsers = new Set();
    const deptCounts = {};

    activities.forEach(a => {
      const p = a.performedBy || a.performed_by || a.updated_by;
      if (p && p !== 'System') activeUsers.add(p);
      const norm = normalizeDepartment(a.department);
      deptCounts[norm] = (deptCounts[norm] || 0) + 1;
    });

    const topDeptKey = Object.entries(deptCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'planning';
    const topDeptLabel = DEPT_CONFIG[topDeptKey]?.label || topDeptKey.toUpperCase();

    return {
      totalActivities: activities.length,
      topDept: topDeptLabel,
      activeUsersCount: activeUsers.size || 1
    };
  }, [activities]);

  const DEPT_FILTER_BUTTONS = [
    { key: 'all', label: 'All Departments' },
    { key: 'planning', label: 'Planning' },
    { key: 'production', label: 'Production' },
    { key: 'design', label: 'Design' },
    { key: 'mechanical', label: 'Mechanical' },
    { key: 'purchase', label: 'Purchase' },
    { key: 'marketing', label: 'Marketing' },
  ];

  return (
    <div className="space-y-6 pb-16 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-slate-900 rounded-2xl px-6 py-5 text-white shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-center gap-3.5">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 text-white shadow-md shadow-indigo-500/20">
            <History size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">
                Live Activity & Logs
              </h1>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Keval V Shah Oversight
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time audit log of department events stored in PostgreSQL (pgAdmin 4 verified)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <span className={`w-2 h-2 rounded-full ${sseConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-slate-300 font-medium">
              {sseConnected ? 'Live Real-Time' : 'Polling (15s)'}
            </span>
          </div>

          <button
            onClick={fetchData}
            disabled={refreshing}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
            title="Refresh logs"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-indigo-400' : ''} />
          </button>
        </div>
      </div>

      {/* 2. STATS KPI CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Recorded Events</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalActivities}</div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <Activity size={22} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Most Active Department</div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{stats.topDept}</div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600">
            <Layers size={22} />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Contributors</div>
            <div className="text-2xl font-black text-slate-900 mt-1">{stats.activeUsersCount}</div>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
            <ShieldCheck size={22} />
          </div>
        </div>
      </div>

      {/* 3. DUAL-TAB CONTROL STRIP & DEPARTMENT FILTERS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3.5">
        
        {/* Top Control: Tabs & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('stream')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'stream'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Activity size={14} />
              <span>Department Activity ({filteredActivities.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'logs'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <FileText size={14} />
              <span>Logs ({filteredActivities.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[260px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Job #, Panel, Client, or User..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:border-indigo-500 focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* Department Filter Strip (Applies to both views) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">Department:</span>
          {DEPT_FILTER_BUTTONS.map(dept => {
            const isSelected = selectedDept === dept.key;
            return (
              <button
                key={dept.key}
                onClick={() => setSelectedDept(dept.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-500/20'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {dept.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {loading ? (
        <div className="p-16 text-center text-xs text-slate-500 flex flex-col items-center gap-2 bg-white rounded-2xl border border-slate-200">
          <RefreshCw size={24} className="animate-spin text-indigo-600" />
          <span className="font-semibold">Loading Live Activity & Logs...</span>
        </div>
      ) : activeTab === 'stream' ? (
        
        /* TAB 1: DEPARTMENT-WISE ACTIVITY STREAM */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Department-Wise Activity Feed</h2>
              <p className="text-xs text-slate-500">Live timeline of job actions created across all departments</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
              {filteredActivities.length} Events
            </span>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400">
              No activity logs recorded matching your department and search parameters.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredActivities.map((act, idx) => {
                const normDept = normalizeDepartment(act.department);
                const deptMeta = DEPT_CONFIG[normDept] || { label: normDept.toUpperCase(), badge: 'bg-slate-100 text-slate-700 border-slate-200' };
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
                          {act.clientName && (
                            <span className="text-slate-400 text-[11px]">({act.clientName})</span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${deptMeta.badge}`}>
                            {deptMeta.label}
                          </span>
                        </div>

                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1">
                          <Clock size={11} />
                          {act.timestamp ? new Date(act.timestamp).toLocaleString() : '—'}
                        </span>
                      </div>

                      {/* Action & Who */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-extrabold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                          {(act.action || 'ACTIVITY').replace(/_/g, ' ')}
                        </span>
                        <span className="text-slate-600">
                          <strong>User:</strong> <span className="font-bold text-slate-900">{who}</span>
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
      ) : (
        
        /* TAB 2: SYSTEM & JOB LOGS (TABULAR AUDIT LOG) */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">Comprehensive System & Job Logs</h2>
              <p className="text-xs text-slate-500">Persistent PostgreSQL audit log table (department_activities)</p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
              {filteredActivities.length} Rows
            </span>
          </div>

          {filteredActivities.length === 0 ? (
            <div className="p-16 text-center text-xs text-slate-400">
              No log records match your filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Job & Panel</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Details / Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredActivities.map((act, idx) => {
                    const normDept = normalizeDepartment(act.department);
                    const deptMeta = DEPT_CONFIG[normDept] || { label: normDept.toUpperCase(), badge: 'bg-slate-100 text-slate-700 border-slate-200' };
                    const who = act.performedBy || act.performed_by || act.updated_by || 'Admin';
                    const summary = act.notes || act.category || (act.newValue ? JSON.stringify(act.newValue) : '—');

                    return (
                      <tr key={act.id || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-[11px] text-slate-500 font-mono">
                          {act.timestamp ? new Date(act.timestamp).toLocaleString() : '—'}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${deptMeta.badge}`}>
                            {deptMeta.label}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            {(act.action || 'ACTIVITY').replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <Link
                            to={`/jobs/${act.jobId}`}
                            className="font-bold text-indigo-600 hover:text-indigo-800"
                          >
                            #{act.jobNo}
                          </Link>
                          <span className="text-slate-400 text-[11px] ml-1">
                            {act.panelName ? `(${act.panelName})` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">
                          {who}
                        </td>
                        <td className="py-3 px-4 max-w-md truncate text-slate-600 text-[11px]" title={summary}>
                          {summary}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
