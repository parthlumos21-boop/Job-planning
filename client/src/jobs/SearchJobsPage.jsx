import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import SearchJobsSection from '../components/SearchJobsSection';
import DepartmentHandoverModal from './DepartmentHandoverModal';

const DEPT_NAMES_MAP = {
  marketing: 'Marketing',
  design: 'Design - Electrical',
  mechanical: 'Design - Mechanical',
  purchase: 'Procurement',
  production: 'Production & QC & Dispatch',
  dispatch: 'Production & QC & Dispatch',
  qc: 'Production & QC & Dispatch'
};

export default function SearchJobsPage() {
  const { user } = useAuth();
  const isAdmin =
    user?.role === 'admin' ||
    user?.role === 'executive' ||
    ['keval v shah', 'keval', 'kevalvshah', 'admin', 'admin2'].includes((user?.username || '').toLowerCase());

  const primaryDept = user?.departments?.[0] || '';
  const [selectedDept, setSelectedDept] = useState(isAdmin ? 'all' : primaryDept);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeHandoverJob, setActiveHandoverJob] = useState(null);

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const deptParam =
        isAdmin && selectedDept !== 'all'
          ? `?department=${selectedDept}`
          : !isAdmin && primaryDept
          ? `?department=${primaryDept}`
          : '';
      const res = await api.get(`/jobs${deptParam}`);
      const rawJobs = res.data?.jobs || (Array.isArray(res.data) ? res.data : []);
      setJobs(rawJobs);
    } catch (err) {
      console.error('Failed to fetch search jobs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [selectedDept]);

  const userDeptDisplay = isAdmin
    ? ''
    : DEPT_NAMES_MAP[primaryDept] || (primaryDept ? primaryDept.toUpperCase() : '');

  return (
    <div className="space-y-6 pb-12">
      <SearchJobsSection
        jobs={jobs}
        loading={loading}
        onRefresh={fetchJobs}
        isAdmin={isAdmin}
        selectedDept={selectedDept}
        onDeptChange={(newDept) => setSelectedDept(newDept)}
        userDeptName={userDeptDisplay}
        onHandoverClick={(job) => setActiveHandoverJob(job)}
      />

      {activeHandoverJob && (
        <DepartmentHandoverModal
          job={activeHandoverJob}
          isOpen={Boolean(activeHandoverJob)}
          onClose={() => setActiveHandoverJob(null)}
          onHandoverSuccess={() => {
            setActiveHandoverJob(null);
            fetchJobs();
          }}
        />
      )}
    </div>
  );
}
