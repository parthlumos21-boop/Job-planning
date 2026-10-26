import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, AlertCircle } from 'lucide-react';
import JobTimelineHeader from './JobTimelineHeader';
import JobTimelineSummaryGrid from './JobTimelineSummaryGrid';
import DepartmentMilestoneTable from './DepartmentMilestoneTable';
import DelayEventModal from './DelayEventModal';
import ExtensionRequestModal from './ExtensionRequestModal';
import TimelineAuditTabs from './TimelineAuditTabs';

export default function DepartmentTimelineViewer({ jobId, user, onTimelineUpdated, onClose }) {
  const [timeline, setTimeline] = useState(null);
  const [delayReasons, setDelayReasons] = useState([]);
  const [delayEvents, setDelayEvents] = useState([]);
  const [scheduleRevisions, setScheduleRevisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals state
  const [activeDelayModal, setActiveDelayModal] = useState(null);
  const [activeExtensionModal, setActiveExtensionModal] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [reviewingId, setReviewingId] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase()?.includes('keval');

  useEffect(() => {
    if (jobId) {
      fetchTimelineData(true);
    }
  }, [jobId]);

  const fetchTimelineData = async (recalculate = false) => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const authHeader = { headers: { Authorization: `Bearer ${token}` } };

      if (recalculate) {
        await axios.post(`/api/planning/jobs/${jobId}/initialize-timeline`, {}, authHeader).catch(() => null);
      }

      const [tlRes, reasonsRes, eventsRes, revsRes] = await Promise.all([
        axios.get(`/api/planning/jobs/${jobId}/timeline${recalculate ? '?recalc=true' : ''}`, authHeader),
        axios.get('/api/planning/delay-reasons', authHeader).catch(() => ({ data: [] })),
        axios.get(`/api/planning/jobs/${jobId}/delay-events`, authHeader).catch(() => ({ data: [] })),
        axios.get(`/api/planning/jobs/${jobId}/revisions`, authHeader).catch(() => ({ data: [] }))
      ]);

      setTimeline(tlRes.data);
      setDelayReasons(reasonsRes.data || []);
      setDelayEvents(eventsRes.data || []);
      setScheduleRevisions(revsRes.data || []);
    } catch (err) {
      console.error('Error loading timeline data:', err);
      setError('Could not load department timeline data from server.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogDelayEvent = async ({ scheduleId, delayReasonId, delayDays, delayRemarks, responsiblePerson }) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/planning/schedules/${scheduleId}/delay-events`,
        {
          delay_reason_id: delayReasonId,
          delay_days: delayDays,
          remarks: delayRemarks,
          responsible_person: responsiblePerson
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveDelayModal(null);
      await fetchTimelineData();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to record delay event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestExtension = async ({ scheduleId, requestedDate, reasonCategory, reasonText }) => {
    try {
      setSubmitting(true);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/planning/schedules/${scheduleId}/request-extension`,
        {
          requested_date: requestedDate,
          reason_category: reasonCategory,
          reason_text: reasonText
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActiveExtensionModal(null);
      alert('Extension request submitted successfully for administrative review!');
      await fetchTimelineData();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to request extension');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveExtension = async (extensionId) => {
    try {
      setReviewingId(extensionId);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/planning/extensions/${extensionId}/approve`,
        { admin_comment: 'Approved via Timeline Governance' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchTimelineData();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to approve extension');
    } finally {
      setReviewingId(null);
    }
  };

  const handleRejectExtension = async (extensionId) => {
    const reason = prompt('Please enter rejection reason:');
    if (!reason) return;
    try {
      setReviewingId(extensionId);
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/planning/extensions/${extensionId}/reject`,
        { admin_comment: reason },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchTimelineData();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to reject extension');
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-xs text-slate-500 bg-white border border-slate-300 rounded-[3px]">
        <Loader2 size={16} className="animate-spin text-blue-600" />
        <span>Loading department timeline &amp; delay records...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-[3px] flex items-center gap-2">
        <AlertCircle size={15} className="text-rose-600 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  const schedules = timeline?.schedules || [];
  const pendingExtensions = timeline?.pending_extensions || [];

  return (
    <div className="space-y-4 font-sans text-slate-800">
      {/* 1. Header & Actions Toolbar */}
      <JobTimelineHeader
        jobNo={timeline?.job_no || jobId}
        jobId={jobId}
        onRefresh={() => fetchTimelineData(true)}
        refreshing={loading}
        onClose={onClose}
      />

      {/* 2. Job Summary Grid Panel */}
      <JobTimelineSummaryGrid
        timeline={timeline}
        schedules={schedules}
      />

      {/* 3. Main Milestone Breakdown Table */}
      <DepartmentMilestoneTable
        schedules={schedules}
        onOpenDelayModal={(sched) => setActiveDelayModal(sched)}
        onOpenExtensionModal={(sched) => setActiveExtensionModal(sched)}
        isAdmin={isAdmin}
      />

      {/* 4. Audit & Revisions History Tabs */}
      <TimelineAuditTabs
        delayEvents={delayEvents}
        scheduleRevisions={scheduleRevisions}
        pendingExtensions={pendingExtensions}
        isAdmin={isAdmin}
        onApproveExtension={handleApproveExtension}
        onRejectExtension={handleRejectExtension}
        reviewingId={reviewingId}
      />

      {/* 5. Modals */}
      <DelayEventModal
        activeDelayModal={activeDelayModal}
        delayReasons={delayReasons}
        currentUser={user}
        onClose={() => setActiveDelayModal(null)}
        onSubmit={handleLogDelayEvent}
        submitting={submitting}
      />

      <ExtensionRequestModal
        activeExtensionModal={activeExtensionModal}
        onClose={() => setActiveExtensionModal(null)}
        onSubmit={handleRequestExtension}
        submitting={submitting}
      />
    </div>
  );
}
