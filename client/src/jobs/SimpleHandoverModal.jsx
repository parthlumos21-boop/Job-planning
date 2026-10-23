import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENT_USER_OPTIONS } from './departmentUserOptions';
import { cleanJobNo } from '../config/marketingFormConfig';
import {
  X, Send, CheckCircle2, AlertCircle, Loader2, ArrowRightLeft,
  Upload, FileText, CheckSquare, Clock, Calendar, UserCheck
} from 'lucide-react';

export default function SimpleHandoverModal({
  job,
  isOpen,
  onClose,
  onSuccess
}) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const jobId = job?.id || job?.externalId || job?.external_id;

  // Handover Target
  const [targetDepartment, setTargetDepartment] = useState('design');
  const [selectedEngineer, setSelectedEngineer] = useState(
    job?.responsibleEnggName || job?.responsible_engg_name || ''
  );
  const [notes, setNotes] = useState('Technical package ready for receiving department review.');

  // Documents State (pgAdmin 4 PostgreSQL job_documents)
  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // New Task for Next Department
  const defaultTargetDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().split('T')[0];
  };

  const [includeTask, setIncludeTask] = useState(true);
  const [taskTitle, setTaskTitle] = useState('Prepare Electrical GA & SLD');
  const [taskAssignedUser, setTaskAssignedUser] = useState('');
  const [taskTargetDate, setTaskTargetDate] = useState(defaultTargetDate());
  const [taskEstimatedHours, setTaskEstimatedHours] = useState('8');
  const [taskInstructions, setTaskInstructions] = useState('Review specifications and prepare baseline drawings.');

  const normalizeDept = (d) => {
    const s = (d || '').toLowerCase();
    if (s.includes('market')) return 'marketing';
    if (s.includes('mech')) return 'mechanical';
    if (s.includes('elect') || s.includes('design')) return 'design';
    if (s.includes('purch') || s.includes('proc')) return 'purchase';
    if (s.includes('prod') || s.includes('qc') || s.includes('disp')) return 'production';
    return s || 'design';
  };

  const targetDeptKey = normalizeDept(targetDepartment);
  const targetEngineers = Array.from(new Set([
    ...(DEPARTMENT_USER_OPTIONS[targetDeptKey] || []),
    'Keval V Shah'
  ]));

  // Auto-sync task title based on department selection
  useEffect(() => {
    if (targetDeptKey === 'design') {
      setTaskTitle('Prepare Electrical GA & Single Line Diagram');
      setTaskInstructions('Review specifications and prepare baseline electrical drawings.');
    } else if (targetDeptKey === 'mechanical') {
      setTaskTitle('Prepare 3D Enclosure & Busbar Routing Layout');
      setTaskInstructions('Verify mechanical clearances, cutout dimensions, and mounting detail.');
    } else if (targetDeptKey === 'purchase') {
      setTaskTitle('Bill of Materials Verification & PO Processing');
      setTaskInstructions('Source major switchgear and components as per approved BOM.');
    } else if (targetDeptKey === 'production') {
      setTaskTitle('Panel Fabrication, Wiring & Routine QC Testing');
      setTaskInstructions('Assemble panel, complete wiring, and conduct routine testing.');
    }
  }, [targetDepartment]);

  // Auto-sync assigned user if empty
  useEffect(() => {
    if (!selectedEngineer && targetEngineers.length > 0) {
      setSelectedEngineer(targetEngineers[0]);
    }
  }, [targetDepartment]);

  useEffect(() => {
    if (!taskAssignedUser && selectedEngineer) {
      setTaskAssignedUser(selectedEngineer);
    }
  }, [selectedEngineer]);

  // Load existing PostgreSQL documents for this job
  const fetchDocuments = async () => {
    if (!jobId) return;
    try {
      setDocsLoading(true);
      const res = await api.get(`/jobs/${jobId}/documents`);
      const fetched = res.data?.documents || [];
      setDocuments(fetched);
      setSelectedDocIds(fetched.map(d => d.id));
    } catch (err) {
      console.warn('Could not fetch job documents:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && jobId) {
      fetchDocuments();
    }
  }, [isOpen, jobId]);

  // Upload Document to PostgreSQL job_documents & disk
  const handleUploadDocument = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !jobId) return;

    try {
      setUploadingDoc(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', 'Specification Document');
      formData.append('department', job?.currentDepartment || 'marketing');

      const res = await api.post(`/jobs/${jobId}/documents/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.data?.document) {
        setDocuments(prev => [res.data.document, ...prev]);
        setSelectedDocIds(prev => [res.data.document.id, ...prev]);
      }
    } catch (err) {
      console.error('Failed to upload document:', err);
      setError(err.response?.data?.detail || 'Failed to upload document to PostgreSQL database.');
    } finally {
      setUploadingDoc(false);
      e.target.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const tasksPayload = includeTask && taskTitle.trim() ? [
        {
          taskName: taskTitle.trim(),
          assignedUser: taskAssignedUser || selectedEngineer || 'Design Engineer',
          targetDate: taskTargetDate,
          estimatedEffort: parseFloat(taskEstimatedHours) || 8.0,
          instructions: taskInstructions.trim()
        }
      ] : [];

      const res = await api.post(`/jobs/${jobId}/workflow/handover`, {
        targetDepartment: targetDepartment,
        responsibleEngineer: selectedEngineer,
        handoverNote: notes.trim(),
        notes: notes.trim(),
        selectedDocumentIds: selectedDocIds,
        tasks: tasksPayload
      });

      setSuccess(`Job ${cleanJobNo(job?.jobNo || job?.job_no)} handed over to ${targetDepartment.toUpperCase()} successfully!`);

      if (onSuccess) {
        onSuccess(res.data);
      }

      setTimeout(() => {
        onClose();
        setSuccess('');
      }, 1200);
    } catch (err) {
      console.error('Handover failed:', err);
      setError(err.response?.data?.detail || 'Failed to submit handover. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const jobNoDisplay = cleanJobNo(job?.jobNo || job?.job_no || 'JOB');
  const panelDisplay = job?.panelName || job?.panel_name || 'Standard Panel';
  const customerDisplay = job?.clientName || job?.client_name || job?.customer || 'Elite Electricals';
  const currentRespEngg = job?.responsibleEnggName || job?.responsible_engg_name || selectedEngineer || 'Hasmukh';
  const fromDeptDisplay = job?.currentDepartment || job?.current_department || 'Marketing';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-600 text-white">
              <ArrowRightLeft size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 tracking-tight uppercase">
                HANDOVER TO NEXT DEPARTMENT
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Standardized multi-department handover with task instructions & selected documents
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2 font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2 font-bold animate-in fade-in">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {/* SECTION 1: Job Readiness & Overview */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-blue-600 uppercase tracking-wider">SECTION 1</span>
                <div className="text-base font-black text-slate-900 tracking-tight">{jobNoDisplay}</div>
                <div className="text-xs font-semibold text-slate-600">{panelDisplay}</div>
              </div>
              <div className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-600" />
                <span>Readiness: Ready for Handover</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-200/60 text-xs">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Customer</span>
                <span className="font-semibold text-slate-800">{customerDisplay}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">From Dept</span>
                <span className="font-semibold text-slate-800 capitalize">{fromDeptDisplay}</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Responsible Engg</span>
                <span className="font-semibold text-slate-800">{currentRespEngg}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Target Department & Responsible Engineer */}
          <div className="space-y-3">
            <div className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center justify-between">
              <span>Section 2: Destination & Owner</span>
              <span className="text-[11px] text-slate-400 font-medium">Who receives this job</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Target Department
                </label>
                <select
                  value={targetDepartment}
                  onChange={(e) => setTargetDepartment(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="design">Design - Electrical</option>
                  <option value="mechanical">Design - Mechanical</option>
                  <option value="purchase">Procurement</option>
                  <option value="production">Production & QC & Dispatch</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Responsible Engineer
                </label>
                <select
                  value={selectedEngineer}
                  onChange={(e) => {
                    setSelectedEngineer(e.target.value);
                    if (!taskAssignedUser) setTaskAssignedUser(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="">Select Engineer</option>
                  {targetEngineers.map((eng, idx) => (
                    <option key={`eng-${idx}`} value={eng}>{eng}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 3: New Task for Receiving Department */}
          <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-indigo-600 text-white">
                  <CheckSquare size={13} />
                </div>
                <div>
                  <span className="text-[10px] font-black text-indigo-700 uppercase tracking-wider block">SECTION 3</span>
                  <span className="text-xs font-black text-slate-900">New Task for Receiving Department</span>
                </div>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer text-xs font-bold text-indigo-700">
                <input
                  type="checkbox"
                  checked={includeTask}
                  onChange={(e) => setIncludeTask(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Attach Task</span>
              </label>
            </div>

            {includeTask && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Task Title *
                  </label>
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="e.g. Prepare Electrical GA Drawing & SLD"
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Assigned To
                    </label>
                    <select
                      value={taskAssignedUser}
                      onChange={(e) => setTaskAssignedUser(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      <option value="">{selectedEngineer || 'Assignee'}</option>
                      {targetEngineers.map((eng, idx) => (
                        <option key={`teng-${idx}`} value={eng}>{eng}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Target Date
                    </label>
                    <input
                      type="date"
                      value={taskTargetDate}
                      onChange={(e) => setTaskTargetDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                      Est. Hours
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={taskEstimatedHours}
                      onChange={(e) => setTaskEstimatedHours(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                    Task Instructions / Requirements
                  </label>
                  <textarea
                    rows={2}
                    value={taskInstructions}
                    onChange={(e) => setTaskInstructions(e.target.value)}
                    placeholder="Provide detailed instructions for the receiving engineer..."
                    className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* SECTION 4: Documents (Checkboxes of existing job documents & upload) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">SECTION 4</span>
                <span className="text-xs font-black text-slate-900">Documents to Send to Receiving Department</span>
              </div>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all">
                <Upload size={13} className={uploadingDoc ? 'animate-bounce' : ''} />
                <span>{uploadingDoc ? 'Uploading...' : '+ Upload New Document'}</span>
                <input
                  type="file"
                  onChange={handleUploadDocument}
                  disabled={uploadingDoc}
                  className="hidden"
                />
              </label>
            </div>

            {docsLoading ? (
              <div className="py-3 text-center text-xs text-slate-400 font-medium">
                Loading PostgreSQL documents...
              </div>
            ) : documents.length === 0 ? (
              <div className="py-3 px-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                No documents uploaded yet. Click <strong>+ Upload New Document</strong> to attach specifications.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <label
                      key={doc.id}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 text-xs cursor-pointer transition-all ${
                        isChecked ? 'bg-blue-50/70 border-blue-300' : 'bg-slate-50 border-slate-200 opacity-70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedDocIds(prev =>
                              prev.includes(doc.id) ? prev.filter(x => x !== doc.id) : [...prev, doc.id]
                            );
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                        <FileText size={15} className="text-blue-600 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate" title={doc.fileName || doc.file_name}>
                          {doc.fileName || doc.file_name}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-[11px] text-slate-500 font-medium">
                        <span>{doc.fileSize ? `${Math.round(doc.fileSize / 1024)} KB` : ''}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white text-indigo-700 font-bold border border-slate-200">
                          {doc.documentType || 'Doc'}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* SECTION 5: Handover Note */}
          <div className="space-y-1 pt-1 border-t border-slate-100">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Handover Note / Remarks
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Technical package ready for receiving department review..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold shadow-xs hover:shadow transition-all"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Transferring...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Confirm Handover & Send Task</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
