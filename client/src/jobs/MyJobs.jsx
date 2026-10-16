import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { Link } from 'react-router-dom';
import { Briefcase, Search, RefreshCw, Loader2 } from 'lucide-react';
import ExcelTable from '../components/ExcelTable';

export default function MyJobs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');

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

      return true;
    });
  }, [myJobs, search]);

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

        <div className="flex flex-wrap items-center gap-2">
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
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white border border-blue-600 shadow-sm whitespace-nowrap cursor-default"
          >
            All My Jobs
          </button>
        </div>
      </div>

      {/* Direct Full-Width Job Register Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <Loader2 size={24} className="animate-spin text-blue-600" />
            <span>Loading register view...</span>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            No jobs found matching your criteria in Register.
          </div>
        ) : (
          <ExcelTable jobs={filteredJobs} user={user} onJobUpdated={fetchJobs} hideActions={false} />
        )}
      </div>
    </div>
  );
}
