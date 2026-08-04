import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FileText, Loader2, BarChart2, Search, ChevronLeft, ChevronRight, X, Download } from 'lucide-react';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import ExcelTable from '../components/ExcelTable';
import JobChart from '../reports/JobChart';
import { buildJobProgressData, DEPARTMENT_PROGRESS } from './jobProgress';

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
  const chartRef = useRef(null);
  
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

  const handleDownloadChart = async () => {
    if (!chartRef.current) return;
    try {
      const url = await toPng(chartRef.current, { pixelRatio: 2, style: { background: 'white' } });
      const link = document.createElement('a');
      link.download = `Job_${selectedJob?.jobNo || 'Status'}_Chart.png`;
      link.href = url;
      link.click();
    } catch (err) {
      console.error('Failed to download chart', err);
    }
  };

  const handleDownloadChartPDF = async () => {
    if (!chartRef.current) return;
    try {
      const node = chartRef.current;
      const imgData = await toPng(node, { pixelRatio: 2, style: { background: 'white' } });
      const pdf = new jsPDF({
        orientation: node.offsetWidth > node.offsetHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [node.offsetWidth, node.offsetHeight]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, node.offsetWidth, node.offsetHeight);
      pdf.save(`Job_${selectedJob?.jobNo || 'Status'}_Chart.pdf`);
    } catch (err) {
      console.error('Failed to download chart as PDF', err);
      alert('Failed to download chart PDF');
    }
  };

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

      {selectedJob && isKeval && (
        <div className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Job: {selectedJob.jobNo}</h2>
              <p className="text-sm text-slate-500">{selectedJob.projectName} | Panel: {selectedJob.panelName}</p>
            </div>
            <div className="flex items-center space-x-2">
              {isKeval && (
                <>
                  <button
                    onClick={handleDownloadChart}
                    className="flex items-center space-x-1 px-3 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-xs rounded transition-colors"
                    title="Download as PNG"
                  >
                    <Download size={14} />
                    <span>PNG</span>
                  </button>
                  <button
                    onClick={handleDownloadChartPDF}
                    className="flex items-center space-x-1 px-3 py-1 bg-red-50 text-red-700 hover:bg-red-100 font-medium text-xs rounded transition-colors"
                    title="Download as PDF"
                  >
                    <FileText size={14} />
                    <span>PDF</span>
                  </button>
                </>
              )}
              <button
                onClick={() => setSelectedJob(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer ml-4 p-1"
                title="Close"
              >
                <X size={24} />
              </button>
            </div>
          </div>
          
          <div className="bg-white p-4">
            {isKeval && (
              <div ref={chartRef} className="bg-white">
                <JobChart data={buildJobProgressData(selectedJob)} />
              </div>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm text-left text-slate-500">
                <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                  <tr>
                    <th className="px-4 py-2">Department</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENT_PROGRESS.map(dept => (
                    <tr key={dept.key} className="border-b border-slate-100">
                      <td className="px-4 py-2 font-medium text-slate-900">{dept.name}</td>
                      <td className="px-4 py-2">
                        {(selectedJob.departmentStatus || {})[dept.key] || 'pending'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
