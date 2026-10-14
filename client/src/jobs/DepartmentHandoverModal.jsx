import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchableUserSelect from './SearchableUserSelect';
import {
  X, CheckCircle2, RotateCcw, ArrowRight, FileText,
  Clock, AlertCircle, Upload, Check, Send, User, ChevronRight, Loader2
} from 'lucide-react';
import { WORKFLOW_CONFIG } from '../config/workflowConfig';

export default function DepartmentHandoverModal({
  job,
  isOpen = true,
  onClose,
  onHandoverSuccess,
  onSuccess
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('action'); // 'action' or 'history'

  const notifySuccess = (jobData) => {
    if (onHandoverSuccess) onHandoverSuccess(jobData);
    if (onSuccess) onSuccess(jobData);
  };
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form states for submission
  const [targetDept, setTargetDept] = useState('planning');
  const [handoverNotes, setHandoverNotes] = useState('');
  const [checklist, setChecklist] = useState({
    coreVerified: true,
    poVerified: true,
    engineerAssigned: true,
    specsAttached: false,
    remarksProvided: false
  });

  // Acceptance & Return states
  const [planningOwnerId, setPlanningOwnerId] = useState(job?.planningOwnerId || null);
  const [planningOwnerName, setPlanningOwnerName] = useState(job?.planningOwnerName || '');
  const [acceptanceNotes, setAcceptanceNotes] = useState('');
  
  const [showReturnDialog, setShowReturnDialog] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  const [uploadingFile, setUploadingFile] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState(job?.attachments || []);

  const currentStatus = job?.handoverStatus || 'Draft';
  const isPendingReview = currentStatus.toLowerCase().includes('submitted') || currentStatus.toLowerCase().includes('pending');

  useEffect(() => {
    if (job) {
      setPlanningOwnerId(job.planningOwnerId || null);
      setPlanningOwnerName(job.planningOwnerName || '');
      setAttachedFiles(job.attachments || []);
      setHandoverNotes(job.handoverNotes || '');
      if (job.handoverChecklist && Object.keys(job.handoverChecklist).length > 0) {
        setChecklist(prev => ({ ...prev, ...job.handoverChecklist }));
      }
    }
  }, [job]);

  useEffect(() => {
    if (isOpen && job?.id) {
      fetchHistory();
    }
  }, [isOpen, job?.id]);

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/jobs/${job.id}/handover/history`);
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error('Failed to load handover history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const toggleChecklist = (key) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !job?.id) return;
    try {
      setUploadingFile(true);
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/jobs/${job.id}/attachments`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data?.attachments) {
        setAttachedFiles(res.data.attachments);
        setChecklist(prev => ({ ...prev, specsAttached: true }));
      }
    } catch (err) {
      console.error('File upload failed:', err);
      setError('File upload failed. Please try again.');
    } finally {
      setUploadingFile(false);
    }
  };

  // Submit Handover
  const handleSubmitHandover = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/submit`, {
        targetDepartment: targetDept,
        fromDepartment: user?.departments?.[0] || 'marketing',
        checklist,
        notes: handoverNotes
      });
      setSuccessMsg(`Job #${job.jobNo} submitted to ${targetDept.toUpperCase()}!`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
        setSuccessMsg('');
      }, 1000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to submit handover.');
    } finally {
      setLoading(false);
    }
  };

  // Accept Handover
  const handleAcceptHandover = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/accept`, {
        planningOwnerId,
        planningOwnerName,
        notes: acceptanceNotes
      });
      setSuccessMsg(`Job #${job.jobNo} handover accepted!`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
        setSuccessMsg('');
      }, 1000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to accept handover.');
    } finally {
      setLoading(false);
    }
  };

  // Return Handover
  const handleReturnHandover = async () => {
    if (!returnReason.trim() || returnReason.trim().length < WORKFLOW_CONFIG.minReturnReasonLength) {
      setError(`Return reason is required (minimum ${WORKFLOW_CONFIG.minReturnReasonLength} characters).`);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/return`, {
        reason: returnReason.trim()
      });
      setSuccessMsg(`Job #${job.jobNo} returned for correction.`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        setShowReturnDialog(false);
        onClose();
        setSuccessMsg('');
      }, 1000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to return handover.');
    } finally {
      setLoading(false);
    }
  };

  // Forward to Downstream Department
  const handleForwardDepartment = async (dept) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/forward`, {
        targetDepartment: dept,
        notes: `Forwarded to ${dept}`
      });
      setSuccessMsg(`Job #${job.jobNo} forwarded to ${dept.toUpperCase()}!`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
        setSuccessMsg('');
      }, 1000);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || 'Failed to forward job.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <ArrowRight size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">Job Planning Control Center</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50">
                  #{job.jobNo}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-md">
                {job.panelName} • {job.clientName || 'General Client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Pill & Tabs */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Current Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full font-semibold border ${WORKFLOW_CONFIG.statusBadges[currentStatus] || 'bg-slate-100 text-slate-700 border-slate-300'}`}>
              {currentStatus}
            </span>
            {job.planningOwnerName && (
              <span className="text-slate-500 ml-2">
                Planning Owner: <strong className="text-slate-800 font-semibold">{job.planningOwnerName}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
            <button
              onClick={() => setActiveTab('action')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'action' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Handover Action
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded-md font-medium transition-all ${
                activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              History ({history.length})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2 font-medium">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {activeTab === 'history' ? (
            /* History Timeline */
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Audit Trail & Handover Timeline</h4>
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 size={16} className="animate-spin text-blue-500" />
                  <span>Loading history...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  No handover history recorded yet for this job.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {history.map((h, i) => (
                    <div key={h.id || i} className="relative group">
                      <span className={`absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-white ${
                        h.action === 'HANDOVER_RETURNED' || (h.reason && h.reason.includes('Returned')) ? 'bg-rose-500' :
                        h.action === 'HANDOVER_ACCEPTED' ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} />
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs space-y-1 hover:border-slate-300 transition-colors">
                        <div className="flex items-center justify-between text-slate-500">
                          <span className="font-semibold text-slate-800">
                            {h.performedBy || 'System User'}
                          </span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Clock size={12} />
                            {h.timestamp ? new Date(h.timestamp).toLocaleString() : 'N/A'}
                          </span>
                        </div>
                        <p className="text-slate-700 font-medium">{h.reason || h.action}</p>
                        {h.notes && <p className="text-slate-600 bg-white p-2 rounded-lg border border-slate-100 text-[11px]">{h.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Action Tab */
            <>
              {/* Return Warning Banner if previously returned */}
              {job.handoverReturnReason && currentStatus === 'Returned for Correction' && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1 text-rose-800">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle size={15} />
                    <span>Returned for Correction by Planning:</span>
                  </div>
                  <p className="pl-5 text-rose-700">{job.handoverReturnReason}</p>
                </div>
              )}

              {/* Review / Acceptance Box (When pending review) */}
              {isPendingReview && (
                <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={15} className="text-blue-600" />
                      Pending Evaluation & Acceptance
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowReturnDialog(prev => !prev)}
                      className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline flex items-center gap-1"
                    >
                      <RotateCcw size={13} />
                      {showReturnDialog ? 'Cancel Return' : 'Return for Correction'}
                    </button>
                  </div>

                  {showReturnDialog ? (
                    <div className="p-3 bg-white border border-rose-200 rounded-xl space-y-2 animate-in fade-in duration-150">
                      <label className="text-xs font-semibold text-rose-800">
                        Reason for Returning Handover *
                      </label>
                      <textarea
                        rows={2}
                        value={returnReason}
                        onChange={e => setReturnReason(e.target.value)}
                        placeholder="State clearly what information or drawings are missing..."
                        className="w-full text-xs p-2 bg-rose-50/40 border border-rose-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-400"
                      />
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleReturnHandover}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                        Confirm Return to Sender
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">
                          Assign Planning Owner
                        </label>
                        <SearchableUserSelect
                          value={planningOwnerName}
                          assignedId={planningOwnerId}
                          department="planning"
                          placeholder="Select Planning Owner..."
                          onChange={(name, id) => {
                            setPlanningOwnerName(name);
                            setPlanningOwnerId(id);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-700 mb-1 block">
                          Acceptance Remarks (Optional)
                        </label>
                        <input
                          type="text"
                          value={acceptanceNotes}
                          onChange={e => setAcceptanceNotes(e.target.value)}
                          placeholder="Milestone notes or schedule commitments..."
                          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400"
                        />
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleAcceptHandover}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Accept Handover & Commit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Handover Submission / Transfer Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Handover to Department
                  </h4>
                  <span className="text-[11px] text-slate-400">Collaborative transition</span>
                </div>

                {/* Target Department Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Target Department</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {[
                      { id: 'planning', label: 'Planning' },
                      { id: 'design', label: 'Design- Elec' },
                      { id: 'mechanical', label: 'Design- Mech' },
                      { id: 'purchase', label: 'Procurement' },
                      { id: 'production', label: 'Production' },
                      { id: 'dispatch', label: 'Dispatch' }
                    ].map(dept => (
                      <button
                        key={dept.id}
                        type="button"
                        onClick={() => setTargetDept(dept.id)}
                        className={`p-2 rounded-xl text-xs font-semibold border transition-all text-center ${
                          targetDept === dept.id
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {dept.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Checklist Verification */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1.5 block">Handover Verification Checklist</label>
                  <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    {[
                      { key: 'coreVerified', label: 'Job Core Details Verified (Job No, Panel, Qty, Client)' },
                      { key: 'poVerified', label: 'Customer Purchase Order & Delivery Terms Verified' },
                      { key: 'engineerAssigned', label: `Responsible Engineer Confirmed: ${job.responsibleEnggName || 'N/A'}` },
                      { key: 'specsAttached', label: 'Technical Specifications / Drawings Reference Documented' },
                      { key: 'remarksProvided', label: 'Handover Instructions & Remarks Documented' },
                    ].map(item => (
                      <label
                        key={item.key}
                        onClick={() => toggleChecklist(item.key)}
                        className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none p-1 rounded hover:bg-slate-100"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(checklist[item.key])}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                        />
                        <span className={checklist[item.key] ? 'font-medium text-slate-900' : 'text-slate-500'}>
                          {item.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Handover Notes */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 mb-1 block">Handover Instructions / Notes</label>
                  <textarea
                    rows={2}
                    value={handoverNotes}
                    onChange={e => setHandoverNotes(e.target.value)}
                    placeholder="Provide specific directions, scope, or requirements for the receiving department..."
                    className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>

                {/* Attachments Section */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">Attachments (PO / Drawings / Specs)</label>
                    <label className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1">
                      {uploadingFile ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                      <span>Upload Document</span>
                      <input type="file" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {attachedFiles.length === 0 ? (
                    <div className="p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                      No files uploaded yet. Click "Upload Document" to attach PO PDF or specification files.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {attachedFiles.map((f, i) => (
                        <div key={f.id || i} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={14} className="text-blue-500 shrink-0" />
                            <span className="font-medium text-slate-800 truncate">{f.originalName || f.storedName}</span>
                            <span className="text-[10px] text-slate-400">({Math.round((f.size || 0) / 1024)} KB)</span>
                          </div>
                          {f.url && (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:text-blue-700 text-xs font-semibold shrink-0"
                            >
                              View
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Forwarding action buttons for Planning Completed jobs */}
                {currentStatus === 'Accepted' && (
                  <div className="p-3 bg-slate-100 rounded-xl space-y-2">
                    <span className="text-xs font-semibold text-slate-700">Planning Completed? Quick Forward to:</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleForwardDepartment('design')}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <ArrowRight size={13} />
                        Forward to Design
                      </button>
                      <button
                        type="button"
                        onClick={() => handleForwardDepartment('purchase')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                      >
                        <ArrowRight size={13} />
                        Forward to Procurement
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>

          {activeTab === 'action' && !isPendingReview && (
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmitHandover}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Submit Handover to {targetDept.toUpperCase()}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
