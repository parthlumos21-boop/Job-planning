import React, { useState, useEffect } from 'react';
import { 
  Calendar, Clock, AlertTriangle, CheckCircle2, ArrowRight, 
  Send, ShieldCheck, ChevronRight, RefreshCw, X, AlertCircle
} from 'lucide-react';
import axios from 'axios';

const DEPT_META = {
  marketing: { label: 'Marketing', color: 'from-blue-500 to-indigo-600', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  design: { label: 'Electrical Design', color: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  mechanical: { label: 'Mechanical Design', color: 'from-purple-500 to-indigo-600', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
  purchase: { label: 'Procurement / Purchase', color: 'from-cyan-500 to-blue-600', badge: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  production: { label: 'Production', color: 'from-emerald-500 to-teal-600', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  qc: { label: 'Quality Control (QC)', color: 'from-rose-500 to-pink-600', badge: 'bg-rose-100 text-rose-800 border-rose-200' },
  dispatch: { label: 'Dispatch', color: 'from-slate-600 to-slate-800', badge: 'bg-slate-100 text-slate-800 border-slate-200' }
};

export default function DynamicDepartmentTimeline({ jobId, user, onTimelineUpdated }) {
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Extension request modal state
  const [activeExtensionModal, setActiveExtensionModal] = useState(null);
  const [requestedDate, setRequestedDate] = useState('');
  const [reasonCategory, setReasonCategory] = useState('Customer Drawing Delay');
  const [reasonText, setReasonText] = useState('');
  const [submittingExtension, setSubmittingExtension] = useState(false);

  // Delay Event Logging Modal State
  const [activeDelayModal, setActiveDelayModal] = useState(null);
  const [delayReasons, setDelayReasons] = useState([]);
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [delayDays, setDelayDays] = useState(1);
  const [delayRemarks, setDelayRemarks] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [submittingDelay, setSubmittingDelay] = useState(false);

  // Audit datasets
  const [delayEvents, setDelayEvents] = useState([]);
  const [scheduleRevisions, setScheduleRevisions] = useState([]);
  const [activeTab, setActiveTab] = useState('milestones'); // 'milestones', 'delayEvents', 'revisions'

  // Admin review state
  const [reviewingId, setReviewingId] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'executive' || user?.username?.toLowerCase()?.includes('keval');

  useEffect(() => {
    if (jobId) {
      fetchTimeline();
    }
  }, [jobId]);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const [tlRes, reasonsRes, eventsRes, revsRes] = await Promise.all([
        axios.get(`/api/planning/jobs/${jobId}/timeline`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/planning/delay-reasons', { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`/api/planning/jobs/${jobId}/delay-events`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] })),
        axios.get(`/api/planning/jobs/${jobId}/revisions`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ data: [] }))
      ]);
      setTimeline(tlRes.data);
      setDelayReasons(reasonsRes.data || []);
      setDelayEvents(eventsRes.data || []);
      setScheduleRevisions(revsRes.data || []);
      if (reasonsRes.data?.length > 0 && !selectedReasonId) {
        setSelectedReasonId(reasonsRes.data[0].id);
      }
    } catch (err) {
      console.error('Error fetching timeline data:', err);
      setError('Could not load dynamic department timeline.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDelayModal = (sched) => {
    setActiveDelayModal(sched);
    setDelayDays(1);
    setDelayRemarks('');
    setResponsiblePerson(user?.name || user?.username || '');
    if (delayReasons.length > 0) {
      setSelectedReasonId(delayReasons[0].id);
    }
  };

  const handleLogDelayEvent = async (e) => {
    e.preventDefault();
    if (!activeDelayModal || !selectedReasonId || delayDays <= 0) return;

    try {
      setSubmittingDelay(true);
      const token = localStorage.getItem('token');
      await axios.post(`/api/planning/schedules/${activeDelayModal.id}/delay-events`, {
        delay_reason_id: parseInt(selectedReasonId),
        delay_days: parseInt(delayDays),
        delay_start_date: new Date().toISOString().split('T')[0],
        remarks: delayRemarks.trim(),
        responsible_person: responsiblePerson.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setActiveDelayModal(null);
      fetchTimeline();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to record delay event');
    } finally {
      setSubmittingDelay(false);
    }
  };

  const handleOpenExtension = (sched) => {
    setActiveExtensionModal(sched);
    // Default to approved target + 3 days
    if (sched.approved_target_date) {
      const d = new Date(sched.approved_target_date);
      d.setDate(d.getDate() + 3);
      setRequestedDate(d.toISOString().split('T')[0]);
    } else {
      setRequestedDate('');
    }
    setReasonCategory('Customer Drawing Delay');
    setReasonText('');
  };

  const handleSubmitExtension = async (e) => {
    e.preventDefault();
    if (!requestedDate || !reasonText.trim()) return;

    try {
      setSubmittingExtension(true);
      const token = localStorage.getItem('token');
      await axios.post('/api/planning/extension-requests', {
        job_id: jobId,
        department: activeExtensionModal.department,
        requested_deadline: requestedDate,
        reason_category: reasonCategory,
        reason_text: reasonText.trim()
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setActiveExtensionModal(null);
      fetchTimeline();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to submit extension request');
    } finally {
      setSubmittingExtension(false);
    }
  };

  const handleReviewExtension = async (requestId, action) => {
    try {
      setReviewingId(requestId);
      const token = localStorage.getItem('token');
      await axios.post(`/api/planning/extension-requests/${requestId}/review`, {
        action: action,
        review_remarks: action === 'APPROVE' ? 'Approved by Admin' : 'Rejected by Admin'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      fetchTimeline();
      if (onTimelineUpdated) onTimelineUpdated();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to review extension request');
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-2xl border border-slate-200 flex items-center justify-center gap-3 text-slate-500">
        <RefreshCw size={18} className="animate-spin text-indigo-600" />
        <span className="text-xs font-semibold">Calculating dynamic department timeline & working days...</span>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className="bg-red-50 p-6 rounded-2xl border border-red-200 text-red-700 text-xs flex items-center justify-between">
        <span>{error || 'No schedule available.'}</span>
        <button onClick={fetchTimeline} className="px-3 py-1.5 bg-red-100 hover:bg-red-200 rounded-lg font-bold">Retry</button>
      </div>
    );
  }

  const schedules = timeline.schedules || [];

  return (
    <div className="space-y-6">
      {/* Header Summary Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-sm border border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 border border-indigo-400/30">
                Dynamic Planning Engine
              </span>
              <span className="text-xs text-slate-400 font-medium">Job No: {timeline.job_no}</span>
            </div>
            <h3 className="text-lg font-black text-white mt-1">
              Department-Wise 4-Date Timeline & Delay Accountability
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Target dates computed in Indian manufacturing working days. Baselines are preserved for accurate audit tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchTimeline}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all border border-white/10 cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Refresh Calculation</span>
            </button>
          </div>
        </div>

        {/* Quick KPI Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800 text-xs">
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Departments Tracked</span>
            <span className="text-lg font-black text-white mt-0.5 block">{schedules.length} Stages</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Committed Customer Delivery</span>
            <span className="text-sm font-extrabold text-amber-300 mt-1 block">
              {timeline.delivery_date ? new Date(timeline.delivery_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Pending PO'}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Approved Extensions</span>
            <span className="text-sm font-extrabold text-indigo-300 mt-1 block">
              +{schedules.reduce((acc, s) => acc + (s.approved_extension_days || 0), 0)} Working Days
            </span>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/80 border border-slate-700">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Accountable Overdue Days</span>
            <span className={`text-sm font-black mt-1 block ${
              schedules.some(s => s.accountable_delay_days > 0) ? 'text-rose-400' : 'text-emerald-400'
            }`}>
              {schedules.reduce((acc, s) => acc + (s.accountable_delay_days || 0), 0)} Days Overdue
            </span>
          </div>
        </div>
      </div>

      {/* 4-Date Milestone Model Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Department Milestone Breakdown (4 Dates + 3 Delays)
            </h4>
            <p className="text-[11px] text-slate-500 font-medium">
              Comparing Original Target vs Admin Approved Target vs Real-World Actuals
            </p>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">On Time</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-200">Approved Ext</span>
            <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-200">Accountable Delay</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-600">
                <th className="py-3 px-4">Department</th>
                <th className="py-3 px-3">Duration</th>
                <th className="py-3 px-3 text-slate-500">1. Original Baseline</th>
                <th className="py-3 px-3 text-indigo-700">2. Approved Target</th>
                <th className="py-3 px-3 text-emerald-700">3. Actual Completion</th>
                <th className="py-3 px-3 text-center">Delay Analysis</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium">
              {schedules.map((sched) => {
                const meta = DEPT_META[sched.department] || { label: sched.department, badge: 'bg-slate-100 text-slate-700' };
                const isOverdue = sched.accountable_delay_days > 0;
                const hasExtension = sched.approved_extension_days > 0;
                const hasPendingRequest = !!sched.pending_request;

                return (
                  <tr key={sched.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* Department */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${meta.badge}`}>
                          {meta.label}
                        </span>
                        {sched.status === 'Completed' && (
                          <CheckCircle2 size={14} className="text-emerald-600" />
                        )}
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-3 text-slate-600 font-semibold">
                      {sched.planned_duration_days} working days
                    </td>

                    {/* 1. Original Baseline */}
                    <td className="py-3.5 px-3 text-slate-500">
                      <span className="font-mono text-xs font-bold block text-slate-700">
                        {sched.original_target_date ? new Date(sched.original_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                      <span className="text-[10px] text-slate-400">Fixed Baseline</span>
                    </td>

                    {/* 2. Approved Target */}
                    <td className="py-3.5 px-3">
                      <span className={`font-mono text-xs font-bold block ${
                        hasExtension ? 'text-indigo-700 font-black' : 'text-slate-800'
                      }`}>
                        {sched.approved_target_date ? new Date(sched.approved_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                      </span>
                      {hasExtension && (
                        <span className="text-[10px] text-indigo-600 font-bold block">
                          +{sched.approved_extension_days}d Authorized
                        </span>
                      )}
                    </td>

                    {/* 3. Actual Completion */}
                    <td className="py-3.5 px-3">
                      {sched.actual_completion_date ? (
                        <div>
                          <span className="font-mono text-xs font-bold text-emerald-800 block">
                            {new Date(sched.actual_completion_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-bold">Done</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">In Progress</span>
                      )}
                    </td>

                    {/* Delay Analysis (3-Way Metrics) */}
                    <td className="py-3.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {sched.raw_delay_days > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200" title="Raw delay against original baseline">
                            Raw: +{sched.raw_delay_days}d
                          </span>
                        ) : null}

                        {isOverdue ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300" title="Accountable delay after approved extensions">
                            ⚠️ Overdue: +{sched.accountable_delay_days}d
                          </span>
                        ) : sched.status === 'Completed' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            On Time
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold text-slate-400">
                            On Track
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {hasPendingRequest ? (
                          <div className="text-right">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800 border border-amber-300 block mb-1">
                              Extension Pending
                            </span>
                            {isAdmin && (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => handleReviewExtension(sched.pending_request.id, 'APPROVE')}
                                  disabled={reviewingId === sched.pending_request.id}
                                  className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  onClick={() => handleReviewExtension(sched.pending_request.id, 'REJECT')}
                                  disabled={reviewingId === sched.pending_request.id}
                                  className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold cursor-pointer"
                                >
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenDelayModal(sched)}
                              className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-bold border border-rose-200 transition-all cursor-pointer"
                              title="Log specific delay event with cause & responsibility"
                            >
                              + Delay Event
                            </button>
                            <button
                              onClick={() => handleOpenExtension(sched)}
                              className="px-2 py-1 bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 rounded-lg text-[10px] font-bold border border-slate-200 transition-all cursor-pointer"
                            >
                              Request Extension
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Audit Tabs Navigation: Delay Events & Revision History */}
        <div className="border-t border-slate-200 bg-slate-50/70 p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('milestones')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                activeTab === 'milestones' ? 'bg-white shadow-xs text-indigo-700 border border-slate-200' : 'text-slate-600 hover:bg-white'
              }`}
            >
              Milestones View
            </button>
            <button
              onClick={() => setActiveTab('delayEvents')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'delayEvents' ? 'bg-white shadow-xs text-rose-700 border border-slate-200' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <span>Delay Events History</span>
              {delayEvents.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">
                  {delayEvents.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('revisions')}
              className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'revisions' ? 'bg-white shadow-xs text-indigo-700 border border-slate-200' : 'text-slate-600 hover:bg-white'
              }`}
            >
              <span>Deadline Revisions Audit</span>
              {scheduleRevisions.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">
                  {scheduleRevisions.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab 2: Delay Events History */}
        {activeTab === 'delayEvents' && (
          <div className="p-4 border-t border-slate-200 space-y-3 bg-white">
            <h5 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Individual Delay Events ({delayEvents.length} Recorded)
            </h5>
            {delayEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No delay events recorded for this job. All departments operating as planned.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {delayEvents.map((evt) => (
                  <div key={evt.id} className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                        evt.delay_type === 'EXTERNAL' ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}>
                        {evt.delay_type}
                      </span>
                      <span className="font-bold text-slate-900 capitalize">{evt.department}</span>
                      <span className="text-slate-400">•</span>
                      <span className="font-semibold text-slate-700">{evt.delay_reason_label || evt.delay_reason_code}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-black border border-rose-200">
                        +{evt.delay_days} Days
                      </span>
                      <span className="text-slate-500 text-[11px]">
                        Responsible: <strong className="text-slate-700">{evt.responsible_person || evt.reported_by}</strong>
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {evt.reported_at ? new Date(evt.reported_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : ''}
                      </span>
                    </div>
                    {evt.remarks && (
                      <p className="w-full text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                        "{evt.remarks}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Deadline Revisions History */}
        {activeTab === 'revisions' && (
          <div className="p-4 border-t border-slate-200 space-y-3 bg-white">
            <h5 className="text-xs font-black uppercase tracking-wider text-slate-800">
              Approved Deadline Extensions Audit Chain ({scheduleRevisions.length})
            </h5>
            {scheduleRevisions.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No deadline revisions approved. Original baseline dates remain 100% active.</p>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                {scheduleRevisions.map((rev) => (
                  <div key={rev.id} className="p-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                        {rev.department}
                      </span>
                      <span className="font-mono text-slate-500 line-through">
                        {new Date(rev.old_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <ArrowRight size={12} className="text-slate-400" />
                      <span className="font-mono font-black text-indigo-700">
                        {new Date(rev.new_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-bold text-[10px]">
                        +{rev.days_extended}d
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-slate-500">
                        Req: <strong className="text-slate-700">{rev.requested_by}</strong>
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">
                        Approved by: <strong className="text-emerald-700">{rev.approved_by || 'Admin'}</strong>
                      </span>
                    </div>

                    {rev.reason_text && (
                      <p className="w-full text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                        Rationale: {rev.reason_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Extension Request Modal */}
      {activeExtensionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Admin Approval Workflow</span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  Request Deadline Extension
                </h3>
              </div>
              <button 
                onClick={() => setActiveExtensionModal(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitExtension} className="space-y-4">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Department:</span>
                  <span className="font-bold text-slate-900 capitalize">{activeExtensionModal.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Current Approved Deadline:</span>
                  <span className="font-bold text-indigo-700 font-mono">
                    {new Date(activeExtensionModal.approved_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Requested New Target Date *
                </label>
                <input
                  type="date"
                  required
                  min={activeExtensionModal.approved_target_date}
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason Category *
                </label>
                <select
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 bg-white"
                >
                  <option value="Customer Drawing Delay">Waiting for Customer Drawing / Clarification</option>
                  <option value="Material Stockout">Material / Switchgear Component Stockout</option>
                  <option value="Engineering Revision">Major Technical Revision Requested by Client</option>
                  <option value="Capacity Overload">Factory Bay / Testing Bench Capacity Overload</option>
                  <option value="TPI Inspection">Third-Party Inspector (TPI) Schedule Shift</option>
                  <option value="Other">Other Operational Reason</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Detailed Explanation / Rationale *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="Explain why the extension is required and how it impacts final dispatch..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none font-medium text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveExtensionModal(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExtension}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <Send size={13} />
                  <span>{submittingExtension ? 'Submitting...' : 'Submit for Admin Review'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Structured Delay Event Modal */}
      {activeDelayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-600">Delay Incident Tracker</span>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  Record Specific Delay Event
                </h3>
              </div>
              <button 
                onClick={() => setActiveDelayModal(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleLogDelayEvent} className="space-y-4">
              <div className="p-3 rounded-xl bg-rose-50/50 border border-rose-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Department:</span>
                  <span className="font-bold text-slate-900 capitalize">{activeDelayModal.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600 font-medium">Approved Target:</span>
                  <span className="font-bold text-indigo-700 font-mono">
                    {new Date(activeDelayModal.approved_target_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Standardized Delay Reason *
                </label>
                <select
                  value={selectedReasonId}
                  onChange={(e) => setSelectedReasonId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 bg-white"
                >
                  {delayReasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.delay_type}] {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Delay Impact (Days) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={delayDays}
                    onChange={(e) => setDelayDays(parseInt(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-rose-700 bg-rose-50/30 focus:border-rose-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Responsible Person / Entity
                  </label>
                  <input
                    type="text"
                    value={responsiblePerson}
                    onChange={(e) => setResponsiblePerson(e.target.value)}
                    placeholder="e.g. Reliance, Hasmukh, Siemens..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:border-rose-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Delay Remarks & Description *
                </label>
                <textarea
                  required
                  rows={3}
                  value={delayRemarks}
                  onChange={(e) => setDelayRemarks(e.target.value)}
                  placeholder="Explain exactly what happened, why the delay occurred, and corrective action..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs resize-none font-medium text-slate-800 placeholder:text-slate-400"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveDelayModal(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDelay}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                >
                  <AlertCircle size={13} />
                  <span>{submittingDelay ? 'Saving...' : 'Record Delay Event'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
