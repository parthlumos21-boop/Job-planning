import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import DynamicFormulaRulesManager from '../components/DynamicFormulaRulesManager';
import SearchableJobSelect from '../jobs/SearchableJobSelect';
import { ArrowLeft, Settings2, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export default function FormulaRulesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    fetchJobsList();
  }, []);

  const fetchJobsList = async () => {
    try {
      setLoadingJobs(true);
      const res = await api.get('/jobs');
      const jobsData = Array.isArray(res.data) ? res.data : (res.data?.jobs || []);
      setJobs(jobsData);
    } catch (err) {
      console.error('Failed to load jobs list for formula simulation:', err);
    } finally {
      setLoadingJobs(false);
    }
  };

  const handleSelectJob = (jobOrId) => {
    const jId = jobOrId?.id || jobOrId;
    setSelectedJobId(jId);
    const found = jobs.find(j => String(j.id) === String(jId) || String(j.external_id) === String(jId));
    setSelectedJob(found || null);
  };

  const handleClearJob = () => {
    setSelectedJobId('');
    setSelectedJob(null);
  };

  return (
    <div 
      className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8"
      style={{
        backgroundColor: 'color-mix(in oklab, #ffffff 60%, transparent)'
      }}
    >
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Row 1: Back to Admin Oversight Button & Status Indicator */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => navigate('/admin-oversight')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-[4px] bg-white border border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer"
            title="Back to Admin Oversight"
          >
            <ArrowLeft size={15} className="text-slate-600" />
          </button>

          <div className="flex items-center gap-2">
            {!selectedJob && (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-800 px-2.5 py-1 rounded-[3px] text-xs font-semibold">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>Global Master Rules (Applies to all New Jobs)</span>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Breadcrumbs & Page Title */}
        <div className="pb-3 border-b border-slate-200">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5 mb-1">
            <span>Administration</span>
            <span className="text-slate-400">&gt;</span>
            <span>Job Planning</span>
            <span className="text-slate-400">&gt;</span>
            <span className="text-blue-700 font-bold">Formula Rules</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings2 size={19} className="text-blue-700" />
            <span>Day-Wise Dynamic Planning Rules Manager</span>
          </h1>
        </div>

        {/* Top-Level Job Mode Selector (Exact replica from NewJobForm.jsx) */}
        <div className="bg-white rounded-[9px] shadow-2xs border border-slate-200 overflow-visible relative z-30 mb-3">
        <div className="px-3.5 py-1.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <span>Job Mode: Create New or Select Existing</span>
          </h3>
          {selectedJobId && (
            <button
              type="button"
              onClick={handleClearJob}
              className="text-[11px] text-[#0000AA] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
            >
              + Switch to Global Master Rules (All Jobs)
            </button>
          )}
        </div>
        <div className="p-2.5 bg-slate-50/30 overflow-visible">
          <SearchableJobSelect
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelectJob={(job) => handleSelectJob(job)}
            onClear={handleClearJob}
            loading={loadingJobs}
          />
        </div>
      </div>

      {/* Main Full-Page Form Container (Clean elevated white container) */}
      <div>
        <DynamicFormulaRulesManager
          user={user}
          selectedJob={selectedJob}
          onClearSelectedJob={handleClearJob}
        />
      </div>
      </div>
    </div>
  );
}
