import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import SearchJobsSection from '../components/SearchJobsSection';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(async (currentSearch = searchQuery, dept = selectedDept) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (currentSearch && currentSearch.trim()) {
        params.set('search', currentSearch.trim());
      }
      if (isAdmin && dept && dept !== 'all') {
        params.set('department', dept);
      } else if (!isAdmin && primaryDept) {
        params.set('department', primaryDept);
      }

      const queryString = params.toString();
      const endpoint = queryString ? `/jobs?${queryString}` : '/jobs';
      const res = await api.get(endpoint);
      const rawJobs = res.data?.jobs || (Array.isArray(res.data) ? res.data : []);
      setJobs(rawJobs);
    } catch (err) {
      console.error('Failed to fetch search jobs:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, primaryDept, searchQuery, selectedDept]);

  useEffect(() => {
    fetchJobs(searchQuery, selectedDept);
  }, [selectedDept, searchQuery, fetchJobs]);

  const userDeptDisplay = isAdmin
    ? ''
    : DEPT_NAMES_MAP[primaryDept] || (primaryDept ? primaryDept.toUpperCase() : '');

  return (
    <div className="space-y-6 pb-12">
      <SearchJobsSection
        jobs={jobs}
        loading={loading}
        onRefresh={() => fetchJobs(searchQuery, selectedDept)}
        isAdmin={isAdmin}
        selectedDept={selectedDept}
        onDeptChange={(newDept) => setSelectedDept(newDept)}
        userDeptName={userDeptDisplay}
        searchQuery={searchQuery}
        onSearchChange={(q) => setSearchQuery(q)}
      />
    </div>
  );
}
