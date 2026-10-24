import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import {
  Inbox, RefreshCw, CheckCircle2, AlertTriangle, ArrowRightLeft,
  FileText, Calendar, Clock, User, UserCheck, ShieldCheck, Download,
  ExternalLink, Eye, AlertCircle, ArrowLeft, Send
} from 'lucide-react';
import { cleanJobNo } from '../config/marketingFormConfig';

export default function IncomingJobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [incomingJobs, setIncomingJobs] = useState([]);
  const [error, setError] = useState('');

  // Return modal state
  const [returnModalJob, setReturnModalJob] = useState(null);
  const [returnReason, setReturnReason] = useState('Missing Technical Information');
  const [returnRemarks, setReturnRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchIncoming = async () => {
    try {
      setRefreshing(true);
      setError('');
      const res = await api.get('/jobs/incoming/list');
      setIncomingJobs(res.data?.incomingJobs || []);
    } catch (err) {
      console.error('Failed to load incoming jobs:', err);
      setError(err.response?.data?.detail || 'Failed to load incoming jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchIncoming();
  }, []);

  const handleAccept = async (job) => {
    try {
      setActionLoading(true);
      await api.post(`/jobs/${job.jobId}/incoming/accept`, {});
      await fetchIncoming();
    } catch (err) {
      alert('Failed to accept job: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReturnSubmit = async (e) => {
    e.preventDefault();
    if (!returnModalJob) return;
    if (!returnRemarks.trim()) {
      alert('Please provide clarification remarks detailing what needs correction.');
      return;
    }
    try {
      setActionLoading(true);
      await api.post(`/jobs/${returnModalJob.jobId}/incoming/return`, {
        reasonCategory: returnReason,
        remarks: returnRemarks.trim()
      });
      setReturnModalJob(null);
      setReturnRemarks('');
      await fetchIncoming();
    } catch (err) {
      alert('Failed to return job: ' + (err.response?.data?.detail || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-16">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
            <Inbox size={16} />
            <span>Transferred Department Work</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Incoming Jobs & Tasks
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Review incoming jobs transferred to your department. Accept to start engineering execution or return for clarification.
          </p>
        </div>

        <button
          onClick={fetchIncoming}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>Refresh List</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-blue-600" />
          <p className="text-sm font-semibold">Loading incoming jobs...</p>
        </div>
      ) : incomingJobs.length === 0 ? (
        <div className="p-16 text-center bg-white rounded-2xl border border-slate-200/80 shadow-xs space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Inbox size={26} />
          </div>
          <h3 className="text-base font-bold text-slate-900">No Incoming Jobs Pending Acceptance</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Your department queue is clear. New jobs and tasks transferred from other departments will automatically appear here.
          </p>
          <button
            onClick={() => navigate('/my-tasks')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0000AA] hover:bg-[#000088] text-white rounded-xl text-xs font-bold transition-all mt-2 cursor-pointer"
          >
            Go to My Tasks
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {incomingJobs.map((job) => {
            const handover = job.handover || {};
            const docs = job.documents || [];
            const tasks = job.tasks || [];

            return (
              <div
                key={job.jobId}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Job Card Header Strip */}
                <div className="p-5 sm:p-6 bg-slate-50/70 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-base sm:text-lg font-black text-blue-700">
                        Job {cleanJobNo(job.jobNo)}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-sm sm:text-base font-bold text-slate-900">
                        {job.panelName || 'Standard Panel'}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs sm:text-sm font-semibold text-slate-600">
                        {job.clientName || 'General Client'}
                      </span>

                      <span className="px-3 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                        Pending Acceptance
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      Project: <strong className="text-slate-700">{job.projectName || '—'}</strong>
                    </p>
                  </div>

                  <Link
                    to={`/jobs/${job.jobId}`}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-700 bg-white hover:bg-slate-100 border border-slate-200 px-3.5 py-2 rounded-xl transition-all self-start md:self-auto"
                  >
                    <span>View Full Job Details</span>
                    <ExternalLink size={13} />
                  </Link>
                </div>

                <div className="p-5 sm:p-6 space-y-5">
                  {/* Sender & Accountability Info Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-blue-50/50 rounded-xl border border-blue-100 text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                        Handed Over By (Sender)
                      </span>
                      <span className="font-bold text-slate-900 mt-0.5 block">
                        📨 {handover.sentBy || 'Marketing User'} ({String(handover.fromDepartment || 'marketing').toUpperCase()})
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                        Responsible Engineer
                      </span>
                      <span className="font-bold text-indigo-700 mt-0.5 block">
                        👤 {job.responsibleEngineer || handover.responsibleEngineer || 'Unassigned'}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                        Handover Transfer Date
                      </span>
                      <span className="font-semibold text-slate-800 mt-0.5 block">
                        📅 {handover.handedOverAt ? new Date(handover.handedOverAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today'}
                      </span>
                    </div>
                  </div>

                  {/* Task(s) Created by Sender */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5">
                      <span>📋 Department Task for Execution</span>
                    </h4>
                    {tasks.length > 0 ? (
                      <div className="space-y-2.5">
                        {tasks.map((t, idx) => (
                          <div key={t.id || idx} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="text-sm font-black text-slate-900">
                                {t.taskName}
                              </span>
                              <div className="flex items-center gap-3 text-xs text-slate-600">
                                <span>Assigned To: <strong className="text-slate-900">{t.assignedUser || 'Department Team'}</strong></span>
                                <span>•</span>
                                <span>Target: <strong className="text-slate-900">{t.targetDate || '5 Days'}</strong></span>
                                <span>•</span>
                                <span>Effort: <strong className="text-blue-600">{t.estimatedEffort || 8}h</strong></span>
                              </div>
                            </div>
                            {t.instructions && (
                              <p className="text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200/60 font-medium">
                                <strong className="text-slate-700">Instructions: </strong>
                                {t.instructions}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 italic">
                        Standard departmental review task will be created upon acceptance.
                      </div>
                    )}
                  </div>

                  {/* Attached Documents (Stored in PostgreSQL) */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2.5 flex items-center gap-1.5">
                      <span>📁 Documents Attached ({docs.length})</span>
                    </h4>
                    {docs.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                        {docs.map((doc) => (
                          <div
                            key={doc.id}
                            className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between gap-2 transition-all"
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <FileText size={16} className="text-blue-600 shrink-0" />
                              <div className="overflow-hidden">
                                <span className="text-xs font-bold text-slate-800 block truncate" title={doc.originalName}>
                                  {doc.originalName}
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  {doc.documentType} • {doc.fileSizeKb} KB
                                </span>
                              </div>
                            </div>

                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors shrink-0"
                              title="Download / View Document"
                            >
                              <Download size={14} />
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-400 italic">
                        No separate documents attached in PostgreSQL.
                      </div>
                    )}
                  </div>

                  {/* Handover Note */}
                  {handover.note && (
                    <div className="p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-slate-700">
                      <span className="font-bold text-amber-900 block mb-0.5">Handover Note from Sender:</span>
                      <p className="font-medium text-amber-950">"{handover.note}"</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 flex-wrap">
                    <button
                      onClick={() => setReturnModalJob(job)}
                      disabled={actionLoading}
                      className="px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 text-xs font-bold rounded-xl transition-all cursor-pointer"
                    >
                      Return for Clarification
                    </button>

                    <button
                      onClick={() => handleAccept(job)}
                      disabled={actionLoading}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 size={16} />
                      <span>Accept & Start Work</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Return for Clarification Modal */}
      {returnModalJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Return Job #{cleanJobNo(returnModalJob.jobNo)} for Clarification
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Explain what information or drawing is missing. The existing task will be preserved as Blocked.
              </p>
            </div>

            <form onSubmit={handleReturnSubmit} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Reason Category</label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800"
                >
                  <option value="Missing Customer Drawing">Missing Customer Drawing</option>
                  <option value="Missing Technical Information">Missing Technical Information</option>
                  <option value="Drawing Discrepancy">Drawing Discrepancy</option>
                  <option value="Commercial Conflict">Commercial Conflict</option>
                  <option value="Infeasible Delivery Date">Infeasible Delivery Date</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Clarification Remarks *</label>
                <textarea
                  rows={3}
                  value={returnRemarks}
                  onChange={(e) => setReturnRemarks(e.target.value)}
                  placeholder="Detail exact missing drawings, specifications, or clarifications needed..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 resize-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setReturnModalJob(null)}
                  className="px-4 py-2 border border-slate-200 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all"
                >
                  Confirm Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
