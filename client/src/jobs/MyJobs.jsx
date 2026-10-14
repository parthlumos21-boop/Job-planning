import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import {
  Briefcase, Search, Filter, RefreshCw, ArrowRightLeft,
  CheckCircle2, Clock, AlertCircle, Eye, Edit3, User, ChevronRight, Loader2
} from 'lucide-react';
import DepartmentHandoverModal from './DepartmentHandoverModal';
import { WORKFLOW_CONFIG } from '../config/workflowConfig';

export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [activeHandoverJob, setActiveHandoverJob] = useState(null);

  const fetchJobs = async () => {
    try {
      setRefreshing(true);
      const res = await api.get('/jobs');
      const all = Array.isArray(res.data) ? res.data : (res.data.jobs || []);
      setJobs(all);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const userNameLower = (user?.name || user?.username || '').toLowerCase();
  const userDepts = useMemo(() => new Set((user?.departments || []).map(d => d.toLowerCase())), [user]);
  const isAdmin = user?.role === 'admin' || user?.role === 'executive';

  // Filter jobs for current user with guaranteed deduplication
  const myJobs = useMemo(() => {
    const matched = jobs.filter(j => {
      if (isAdmin) return true; // Admins have full access
      
      const isResp = (j.responsibleEnggName || '').toLowerCase() === userNameLower || j.assignedEngineerId === user?.id;
      const isPlanOwner = (j.planningOwnerName || '').toLowerCase() === userNameLower || j.planningOwnerId === user?.id;
      const isWorker = j.currentWorkerId === user?.id;
      const isCreator = (j.createdBy || '').toLowerCase() === (user?.username || '').toLowerCase();
      
      const visibleDepts = (j.visibleToDepartments || []).map(d => d.toLowerCase());
      const inDept = visibleDepts.some(d => userDepts.has(d)) || userDepts.has((j.targetDepartment || '').toLowerCase());

      return isResp || isPlanOwner || isWorker || isCreator || inDept;
    });

    // Guaranteed deduplication by jobNo / id
    const seen = new Set();
    return matched.filter(j => {
      const key = j.jobNo ? String(j.jobNo).trim() : `id-${j.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [jobs, userNameLower, user?.id, userDepts, isAdmin]);

  // Apply search & status filter
  const filteredJobs = useMemo(() => {
    return myJobs.filter(j => {
      if (search) {
        const q = search.toLowerCase();
        const match =
          (j.jobNo || '').toLowerCase().includes(q) ||
          (j.panelName || '').toLowerCase().includes(q) ||
          (j.clientName || '').toLowerCase().includes(q) ||
          (j.responsibleEnggName || '').toLowerCase().includes(q);
        if (!match) return false;
      }

      if (statusFilter !== 'all') {
        const st = (j.handoverStatus || 'Draft').toLowerCase();
        if (statusFilter === 'pending' && !st.includes('submitted') && !st.includes('pending')) return false;
        if (statusFilter === 'accepted' && st !== 'accepted') return false;
        if (statusFilter === 'returned' && !st.includes('returned')) return false;
        if (statusFilter === 'completed' && !st.includes('completed') && !st.includes('forwarded')) return false;
      }

      return true;
    });
  }, [myJobs, search, statusFilter]);

  const handleHandoverSuccess = (updatedJob) => {
    if (!updatedJob) return;
    setJobs(prev => prev.map(j => (j.id === updatedJob.id ? { ...j, ...updatedJob } : j)));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Top Header & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Briefcase size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">My Active Jobs & Queue</h1>
              <p className="text-xs text-slate-500">
                Jobs where you are assigned as Responsible Engineer, Planning Owner, or working within your department.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            disabled={refreshing}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            <span>Refresh</span>
          </button>

          <Link
            to="/jobs/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all"
          >
            <span>+ New Job</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total My Jobs</span>
          <div className="text-2xl font-black text-slate-900 mt-1">{myJobs.length}</div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-amber-200 shadow-sm bg-gradient-to-br from-amber-50/40 to-white">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Pending Handover</span>
          <div className="text-2xl font-black text-amber-700 mt-1">
            {myJobs.filter(j => (j.handoverStatus || '').toLowerCase().includes('submitted')).length}
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-rose-200 shadow-sm bg-gradient-to-br from-rose-50/40 to-white">
          <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600">Returned for Correction</span>
          <div className="text-2xl font-black text-rose-700 mt-1">
            {myJobs.filter(j => (j.handoverStatus || '').toLowerCase().includes('returned')).length}
          </div>
        </div>
        <div className="p-4 bg-white rounded-2xl border border-emerald-200 shadow-sm bg-gradient-to-br from-emerald-50/40 to-white">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">Accepted / In Progress</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">
            {myJobs.filter(j => (j.handoverStatus || '').toLowerCase() === 'accepted').length}
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search job no, panel, client..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto">
          {[
            { id: 'all', label: 'All My Jobs' },
            { id: 'pending', label: 'Pending Review' },
            { id: 'returned', label: 'Returned' },
            { id: 'accepted', label: 'Accepted' },
            { id: 'completed', label: 'Completed' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-blue-600" />
            <span>Loading your assigned jobs...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No jobs found matching your criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Job ID & Panel</th>
                  <th className="py-3.5 px-4">Client & Project</th>
                  <th className="py-3.5 px-4">Responsible Engg</th>
                  <th className="py-3.5 px-4">Planning Owner</th>
                  <th className="py-3.5 px-4">Stage / Handover</th>
                  <th className="py-3.5 px-4 text-center">Handover Action</th>
                  <th className="py-3.5 px-4 text-right">View / Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredJobs.map(job => {
                  const status = job.handoverStatus || 'Draft';
                  return (
                    <tr key={job.id} className="hover:bg-blue-50/30 transition-colors">
                      {/* Job ID & Panel */}
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <Link to={`/jobs/${job.id}`} className="hover:text-blue-600">
                          #{job.jobNo}
                        </Link>
                        <div className="text-[11px] font-normal text-slate-500 truncate max-w-[200px]">
                          {job.panelName}
                        </div>
                      </td>

                      {/* Client & Project */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{job.clientName || 'General Client'}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{job.projectName || '—'}</div>
                      </td>

                      {/* Responsible Engineer */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 font-medium text-slate-800">
                          <User size={11} className="text-slate-400" />
                          {job.responsibleEnggName || 'Unassigned'}
                        </span>
                      </td>

                      {/* Planning Owner */}
                      <td className="py-3 px-4">
                        {job.planningOwnerName ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold border border-blue-200">
                            {job.planningOwnerName}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </td>

                      {/* Stage & Handover Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                          WORKFLOW_CONFIG.statusBadges[status] || 'bg-slate-100 text-slate-700 border-slate-300'
                        }`}>
                          {status}
                        </span>
                        {job.handoverReturnReason && status === 'Returned for Correction' && (
                          <div className="text-[10px] text-rose-600 mt-1 truncate max-w-[160px]" title={job.handoverReturnReason}>
                            Reason: {job.handoverReturnReason}
                          </div>
                        )}
                      </td>

                      {/* Inline Handover Action Button */}
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setActiveHandoverJob(job)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95"
                        >
                          <ArrowRightLeft size={13} />
                          <span>Handover</span>
                        </button>
                      </td>

                      {/* View / Edit Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to={`/jobs/${job.id}`}
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="View Details"
                          >
                            <Eye size={15} />
                          </Link>
                          <Link
                            to={`/jobs/edit/${job.id}`}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                            title="Edit Job"
                          >
                            <Edit3 size={15} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Universal Handover Modal */}
      {activeHandoverJob && (
        <DepartmentHandoverModal
          job={activeHandoverJob}
          isOpen={Boolean(activeHandoverJob)}
          onClose={() => setActiveHandoverJob(null)}
          onHandoverSuccess={handleHandoverSuccess}
        />
      )}
    </div>
  );
}
