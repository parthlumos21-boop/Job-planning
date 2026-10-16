import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { FileText, Loader2, Search, ChevronLeft, ChevronRight, X, ExternalLink, CheckCircle2, Clock, AlertCircle, ArrowRightLeft } from 'lucide-react';
import ExcelTable from '../components/ExcelTable';
import { DEPARTMENT_PROGRESS } from './jobProgress';
import DepartmentHandoverModal from './DepartmentHandoverModal';
import { cleanJobNo, isMarketingUser } from '../config/marketingFormConfig';

export default function JobList({ title }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchNameQuery = searchParams.get('client');
  const searchJobNoQuery = searchParams.get('search');

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const jobsPerPage = 10;

  const isKeval = user?.username?.toLowerCase() === 'keval v shah';

  useEffect(() => {
    fetchJobs();
    // eslint-disable-next-line
  }, [location.search, searchNameQuery, searchJobNoQuery]);

  useEffect(() => {
    if (selectedJob && jobs.length > 0) {
      const updatedJob = jobs.find(j => (j.id || j._id) === (selectedJob.id || selectedJob._id));
      if (updatedJob && JSON.stringify(updatedJob) !== JSON.stringify(selectedJob)) {
        setSelectedJob(updatedJob);
      }
    }
  }, [jobs]);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      if (searchNameQuery) queryParams.set('client', searchNameQuery);
      if (searchJobNoQuery) queryParams.set('search', searchJobNoQuery);
      
      const endpoint = `/jobs?${queryParams.toString()}`;
      
      const res = await api.get(endpoint);
      setJobs(Array.isArray(res.data) ? res.data : (res.data.jobs || []));
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleJobUpdated = (jobId, department, field, value) => {
    setJobs(prevJobs => prevJobs.map(job => {
      if ((job.id || job._id) !== jobId) return job;
      const isCore = department === 'marketing';
      if (isCore) {
        return { ...job, [field]: value };
      }
      return {
        ...job,
        allDepartmentsData: {
          ...(job.allDepartmentsData || {}),
          [department]: {
            ...((job.allDepartmentsData || {})[department] || {}),
            [field]: value
          }
        },
        fields: {
          ...(job.fields || {}),
          [department]: {
            ...((job.fields || {})[department] || {}),
            [field]: value
          }
        }
      };
    }));
  };

  const filteredJobs = jobs.filter(job => {
    if (!search) return true;
    const lowerSearch = search.toLowerCase();
    return (
      (job.jobNo || '').toLowerCase().includes(lowerSearch) ||
      (job.projectName || '').toLowerCase().includes(lowerSearch) ||
      (job.panelName || '').toLowerCase().includes(lowerSearch) ||
      (job.clientName || '').toLowerCase().includes(lowerSearch)
    );
  });

  const indexOfLastJob = currentPage * jobsPerPage;
  const indexOfFirstJob = indexOfLastJob - jobsPerPage;
  const currentJobs = filteredJobs.slice(indexOfFirstJob, indexOfLastJob);
  const totalPages = Math.ceil(filteredJobs.length / jobsPerPage);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );
  }

  return (
    <div className="mt-2 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search by Job No, Client, etc..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
            />
          </div>

        </div>
      </div>

      <div className="overflow-x-auto">
        <ExcelTable 
          jobs={currentJobs} 
          user={user} 
          hideActions={true} 
          onJobUpdated={handleJobUpdated}
          onRowClick={(job) => setSelectedJob(job)}
        />
      </div>

      {filteredJobs.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="mx-auto mb-2" size={48} />
          <p>No jobs found.</p>
        </div>
      )}

      {/* Pagination Controls */}
      {filteredJobs.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
          <div>
            Showing {indexOfFirstJob + 1} to {Math.min(indexOfLastJob, filteredJobs.length)} of {filteredJobs.length} entries
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {selectedJob && (
        <div className="mt-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/80 transition-all">
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-slate-100 gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-semibold text-xs border border-blue-200/60">
                  Job {cleanJobNo(selectedJob.jobNo)}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {selectedJob.projectName || 'Project Details'}
                </h3>
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Panel: <span className="font-medium text-slate-700">{selectedJob.panelName || 'N/A'}</span>
                {selectedJob.clientName && (
                  <> • Client: <span className="font-medium text-slate-700">{selectedJob.clientName}</span></>
                )}
                {selectedJob.qty && (
                  <> • Qty: <span className="font-medium text-slate-700">{selectedJob.qty}</span></>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHandoverModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all"
              >
                <ArrowRightLeft size={14} />
                <span>Planning Control Center</span>
              </button>
              <Link
                to={`/jobs/${selectedJob.id || selectedJob._id || selectedJob.externalId}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                <ExternalLink size={14} />
                <span>{isMarketingUser(user) ? 'My Job Details' : 'View Full Job'}</span>
              </Link>
              <button
                onClick={() => setSelectedJob(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Pure Department Workflow Status */}
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Department Workflow Status
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {DEPARTMENT_PROGRESS.map((dept) => {
                const rawStatus = (selectedJob.departmentStatus || {})[dept.key] || 'pending';
                const status = String(rawStatus).toLowerCase();
                const isCompleted = status === 'completed' || status === 'done';
                const isInProgress = status === 'in progress' || status === 'in-progress' || status === 'running';

                return (
                  <div
                    key={dept.key}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-all ${
                      isCompleted
                        ? 'bg-emerald-50/50 border-emerald-200/80 shadow-xs'
                        : isInProgress
                        ? 'bg-amber-50/50 border-amber-200/80 shadow-xs'
                        : 'bg-slate-50/60 border-slate-200/60'
                    }`}
                  >
                    <div className="text-xs font-semibold text-slate-700 leading-snug">
                      {dept.name}
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      {isCompleted ? (
                        <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
                      ) : isInProgress ? (
                        <Clock size={14} className="text-amber-600 shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="text-slate-400 shrink-0" />
                      )}
                      <span
                        className={`text-[11px] font-semibold capitalize ${
                          isCompleted
                            ? 'text-emerald-700'
                            : isInProgress
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Universal Handover Modal */}
      {showHandoverModal && selectedJob && (
        <DepartmentHandoverModal
          job={selectedJob}
          isOpen={showHandoverModal}
          onClose={() => setShowHandoverModal(false)}
          onHandoverSuccess={(updatedJob) => {
            if (updatedJob) {
              setSelectedJob(updatedJob);
              setJobs(prev => prev.map(j => ((j.id || j.externalId) === (updatedJob.id || updatedJob.externalId) ? { ...j, ...updatedJob } : j)));
            }
          }}
        />
      )}
    </div>
  );
}
