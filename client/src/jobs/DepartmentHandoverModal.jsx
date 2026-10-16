import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import SearchableUserSelect from './SearchableUserSelect';
import DocumentPreviewModal from '../components/DocumentPreviewModal';
import {
  X, CheckCircle2, RotateCcw, ArrowRight, FileText,
  Clock, AlertCircle, Upload, Check, Send, User, ChevronRight, Loader2, Building2,
  ArrowRightLeft, Eye, Download
} from 'lucide-react';
import { WORKFLOW_CONFIG } from '../config/workflowConfig';
import { cleanJobNo } from '../config/marketingFormConfig';

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
  const [previewFile, setPreviewFile] = useState(null);

  const currentStatus = job?.handoverStatus || 'Draft';
  const isPendingReview = currentStatus.toLowerCase().includes('submitted') || currentStatus.toLowerCase().includes('pending');

  const defaultMarketingName =
    job?.responsibleEnggName ||
    job?.engineers?.marketing?.[0] ||
    job?.fields?.marketing?.['Responsible Engg. Name'] ||
    job?.handoverChecklist?.submitted_by ||
    job?.createdBy ||
    '';

  const marketingOwner = defaultMarketingName || 'Marketing Team';
  const [marketingOwnerName, setMarketingOwnerName] = useState(defaultMarketingName);
  const [marketingOwnerId, setMarketingOwnerId] = useState(null);

  useEffect(() => {
    if (job) {
      setPlanningOwnerId(job.planningOwnerId || null);
      setPlanningOwnerName(job.planningOwnerName || '');
      setAttachedFiles(job.attachments || []);
      setHandoverNotes(job.handoverNotes || '');
      const mName =
        job.responsibleEnggName ||
        job.engineers?.marketing?.[0] ||
        job.fields?.marketing?.['Responsible Engg. Name'] ||
        job.handoverChecklist?.submitted_by ||
        job.createdBy ||
        '';
      setMarketingOwnerName(mName);
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
      setSuccessMsg(`Handover submitted to ${targetDept.toUpperCase()} successfully!`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Handover submit failed:', err);
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
        planning_owner_id: planningOwnerId,
        planning_owner_name: planningOwnerName,
        notes: acceptanceNotes
      });
      setSuccessMsg('Handover accepted and committed to Planning stage!');
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Accept handover failed:', err);
      setError(err.response?.data?.detail || 'Failed to accept handover.');
    } finally {
      setLoading(false);
    }
  };

  // Return Handover
  const handleReturnHandover = async () => {
    if (!returnReason.trim()) {
      setError('Please provide a reason for returning the handover.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/return`, {
        reason: returnReason
      });
      setSuccessMsg('Handover returned for correction.');
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      console.error('Return handover failed:', err);
      setError(err.response?.data?.detail || 'Failed to return handover.');
    } finally {
      setLoading(false);
    }
  };

  // Handover to Internal Marketing Owner
  const handleHandoverToMarketing = async () => {
    if (!marketingOwnerName && !marketingOwnerId) {
      setError('Please select or specify an Internal Marketing Owner for handover.');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/handover/submit`, {
        targetDepartment: 'marketing',
        fromDepartment: 'planning',
        toWorkerId: marketingOwnerId,
        notes: handoverNotes.trim() || `Handed over from Planning to Marketing Owner (${marketingOwnerName})`,
        checklist: {
          planningCompleted: true,
          handoverBy: user?.name || user?.username || 'Planning',
          handoverAt: new Date().toISOString()
        }
      });
      setSuccessMsg(`Job successfully handed over to Marketing Owner (${marketingOwnerName})!`);
      notifySuccess(res.data?.job);
      setTimeout(() => {
        onClose();
      }, 1100);
    } catch (err) {
      console.error('Handover to marketing failed:', err);
      setError(err.response?.data?.detail || 'Failed to handover to Marketing Owner.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !job) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col my-8">
        
        {/* Header - Clean Job Number without '#' */}
        <div className="px-6 py-4 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30">
              <ArrowRight size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base tracking-tight text-white">Job Planning Control Center</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-900/60 text-blue-300 border border-blue-700/50 font-bold">
                  {cleanJobNo(job.jobNo)}
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

        {/* Sub-Header - Removed "Current Status: Submitted to Design", keeping Planning Owner & Tabs */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {job.planningOwnerName && (
              <span className="text-slate-600 font-medium flex items-center gap-1.5 bg-blue-50/80 px-2.5 py-1 rounded-lg border border-blue-100">
                <User size={13} className="text-blue-600" />
                Planning Owner: <strong className="text-slate-900 font-bold">{job.planningOwnerName}</strong>
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
            /* Action Tab - Simplified & Streamlined */
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
              {isPendingReview ? (
                <div className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
                  {/* Target Department (Planning only) & Marketing Owner Side-by-Side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Target Department
                      </span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-xs">
                        <Building2 size={13} />
                        <span>Planning (Own Department)</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Marketing Owner
                      </span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-slate-800 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0">
                          {(marketingOwner || 'M').charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{marketingOwner}</span>
                      </div>
                    </div>
                  </div>

                  {showReturnDialog ? (
                    <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2.5 animate-in fade-in duration-150">
                      <label className="text-xs font-bold text-rose-900 block">
                        Reason for Returning Handover *
                      </label>
                      <textarea
                        rows={2}
                        value={returnReason}
                        onChange={e => setReturnReason(e.target.value)}
                        placeholder="State clearly what information or drawings are missing..."
                        className="w-full text-xs p-2.5 bg-white border border-rose-200 rounded-lg outline-none focus:ring-2 focus:ring-rose-400"
                      />
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => setShowReturnDialog(false)}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleReturnHandover}
                          className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs"
                        >
                          {loading ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                          Confirm Return to Sender
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-800 mb-1.5 block">
                          Assign Planning Owner
                        </label>
                        <SearchableUserSelect
                          value={planningOwnerName}
                          assignedId={planningOwnerId}
                          department="planning"
                          placeholder="Select Planning Owner (e.g. Bhavesh prajapati)..."
                          onChange={(name, id) => {
                            setPlanningOwnerName(name);
                            setPlanningOwnerId(id);
                          }}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-800 mb-1 block">
                          Acceptance Remarks (Optional)
                        </label>
                        <input
                          type="text"
                          value={acceptanceNotes}
                          onChange={e => setAcceptanceNotes(e.target.value)}
                          placeholder="Milestone notes or schedule commitments..."
                          className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-blue-400 text-slate-800 font-medium transition-all"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setShowReturnDialog(true)}
                          className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                        >
                          <RotateCcw size={13} />
                          Return for Correction
                        </button>

                        <button
                          type="button"
                          disabled={loading}
                          onClick={handleAcceptHandover}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          Accept Handover & Commit
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* When already accepted or in Forwarding stage */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Current Department
                      </span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-xs">
                        <Building2 size={13} />
                        <span>Planning</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">
                        Marketing Owner
                      </span>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white text-slate-800 text-xs font-bold rounded-lg border border-slate-200 shadow-2xs">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-black shrink-0">
                          {((marketingOwnerName || marketingOwner || 'M')).charAt(0).toUpperCase()}
                        </div>
                        <span className="truncate">{marketingOwnerName || marketingOwner}</span>
                      </div>
                    </div>
                  </div>

                  {/* Handover to Internal Marketing Owner Section */}
                  <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-3.5 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-200/70 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100">
                          <ArrowRightLeft size={16} />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Handover to Internal Marketing Owner
                          </h4>
                          <p className="text-[11px] text-slate-500 font-medium">
                            Transfer job milestone and instructions back to the Marketing team
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-full">
                        Target: Marketing
                      </span>
                    </div>

                    {/* Internal Marketing Owner Selector */}
                    <div>
                      <label className="text-xs font-bold text-slate-800 mb-1.5 block">
                        Internal Marketing Owner
                      </label>
                      <SearchableUserSelect
                        value={marketingOwnerName}
                        assignedId={marketingOwnerId}
                        department="marketing"
                        placeholder="Search or select Marketing Owner..."
                        onChange={(name, id) => {
                          setMarketingOwnerName(name);
                          setMarketingOwnerId(id);
                        }}
                      />
                    </div>

                    {/* Handover Instructions / Notes */}
                    <div>
                      <label className="text-xs font-bold text-slate-800 mb-1 block">
                        Handover Instructions / Notes (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={handoverNotes}
                        onChange={e => setHandoverNotes(e.target.value)}
                        placeholder="Provide specific notes, scheduling details, or feedback for the Marketing Owner..."
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400 font-medium text-slate-800 transition-all"
                      />
                    </div>

                    {/* Action Button inside card */}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={handleHandoverToMarketing}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-50"
                      >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        <span>Handover to Marketing Owner</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments Section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">Attachments (PO / Drawings / Specs / Excel)</label>
                  <label className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer flex items-center gap-1">
                    {uploadingFile ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    <span>Upload Document</span>
                    <input type="file" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>

                {attachedFiles.length === 0 ? (
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-400">
                    No files attached. Click "Upload Document" to attach files.
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
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setPreviewFile(f)}
                              className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                              title="View inside modal"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                            <a
                              href={f.url}
                              download={f.originalName || f.storedName}
                              target="_blank"
                              rel="noreferrer"
                              className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-200 transition-colors"
                              title="Download file"
                            >
                              <Download size={13} />
                            </a>
                          </div>
                        )}
                      </div>
                    ))}
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
        </div>

        {/* In-Modal Document/Excel/PDF Preview Overlay */}
        {previewFile && (
          <DocumentPreviewModal
            file={previewFile}
            onClose={() => setPreviewFile(null)}
          />
        )}
      </div>
    </div>
  );
}
