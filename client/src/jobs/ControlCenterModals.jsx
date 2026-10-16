import React, { useState, useEffect } from 'react';
import api from '../services/api';
import {
  X, UserCheck, RefreshCw, AlertCircle, CheckCircle2,
  Send, Clock, ShieldCheck, ArrowRight, Loader2, Search
} from 'lucide-react';

const REASON_CATEGORIES = [
  'Department workload',
  'Skill / specialization',
  'Job type',
  'Existing project ownership',
  'Customer priority',
  'Urgent requirement',
  'Availability',
  'Management instruction',
  'Reassignment',
  'Other'
];

const CLARIFICATION_CATEGORIES = [
  'Missing Design Drawings',
  'Commercial Ambiguity',
  'Incomplete Technical Specs',
  'Quantity Mismatch',
  'Delivery Conflict',
  'Scope Clarification Required',
  'Other'
];

const FORWARDING_CATEGORIES = [
  'Planning Package Verified & Completed',
  'BOM Released & Approved',
  'Urgent Production Fast-Track',
  'Management Directive',
  'Design Signoff Completed',
  'Other'
];

const DEPARTMENTS = [
  { id: 'production', label: 'Production  & QC & Dispatch' },
  { id: 'design', label: 'Design- Electrical' },
  { id: 'mechanical', label: 'Design- Mechanical' },
  { id: 'purchase', label: 'Procurement' },
  { id: 'marketing', label: 'Marketing' }
];

// ==========================================
// 1. FORMAL ASSIGN PLANNING OWNER MODAL
// ==========================================
export function AssignOwnerModal({ job, isOpen, onClose, onSuccess }) {
  const [candidates, setCandidates] = useState([]);
  const [candidatesSearch, setCandidatesSearch] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedOwnerName, setSelectedOwnerName] = useState('');
  const [selectedOwnerOptionKey, setSelectedOwnerOptionKey] = useState('');
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [explanation, setExplanation] = useState('');
  const [priority, setPriority] = useState(job?.priority || 'Normal');
  const [targetDate, setTargetDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setExplanation('');
      setCandidatesSearch('');
      setReasonCategory(REASON_CATEGORIES[0]);
      setPriority(job?.priority || 'Normal');
      fetchCandidates();
    }
  }, [isOpen, job]);

  const fetchCandidates = async () => {
    try {
      setLoadingCandidates(true);
      let list = [];
      try {
        const res = await api.get('/jobs/control/users-workload');
        list = Array.isArray(res.data) ? res.data : (res.data?.users || []);
      } catch (err) {
        console.warn('Could not load candidates workload, trying /users fallback:', err);
      }

      // If empty or error, fallback to /users to ensure all ~97 personnel are accessible
      if (!list || list.length === 0) {
        try {
          const uRes = await api.get('/users');
          const rawUsers = Array.isArray(uRes.data) ? uRes.data : [];
          list = rawUsers.map(u => ({
            id: u.id,
            uniqueKey: u.uniqueKey || `user_${u.id}_${u.name || u.username}`,
            userType: u.userType || 'user',
            name: u.name || u.username,
            username: u.username || u.name,
            departments: u.departments || [],
            activeCount: 0,
            waitingCount: 0
          }));
        } catch (uErr) {
          console.warn('Users fallback failed:', uErr);
        }
      }

      // Deduplicate by uniqueKey or id+name
      const seen = new Set();
      const deduped = (list || []).filter(c => {
        const k = c.uniqueKey || `${c.id}-${c.name || c.username}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      setCandidates(deduped);
      if (list.length > 0 && !selectedOwnerId) {
        const first = list[0];
        const optKey = first.uniqueKey || `${first.userType || 'u'}_${first.id}_${first.name}`;
        setSelectedOwnerOptionKey(optKey);
        setSelectedOwnerId(first.id);
        setSelectedOwnerName(first.name || first.username);
      }
    } catch (err) {
      console.warn('Could not load candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const filteredCandidates = candidates.filter(c => {
    if (!candidatesSearch) return true;
    const q = candidatesSearch.toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const userMatch = (c.username || '').toLowerCase().includes(q);
    const deptMatch = (c.departments || []).some(d => d.toLowerCase().includes(q));
    return nameMatch || userMatch || deptMatch;
  });

  const handleSelectUser = (e) => {
    const keyVal = e.target.value;
    setSelectedOwnerOptionKey(keyVal);
    const found = candidates.find(c => {
      const optKey = c.uniqueKey || `${c.userType || 'u'}_${c.id}_${c.name}`;
      return optKey === keyVal || String(c.id) === String(keyVal);
    });
    if (found) {
      setSelectedOwnerId(found.id);
      setSelectedOwnerName(found.name || found.username);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedOwnerId) {
      setError('Please select a Planning Owner.');
      return;
    }
    if (!explanation || explanation.trim().length < 10) {
      setError('Assignment explanation is mandatory (minimum 10 characters).');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/control/assign-owner`, {
        planningOwnerId: selectedOwnerId,
        planningOwnerName: selectedOwnerName,
        ownerId: selectedOwnerId,
        ownerName: selectedOwnerName,
        reasonCategory,
        reasonExplanation: explanation.trim(),
        explanation: explanation.trim(),
        priority,
        targetDueDate: targetDate || null,
        targetCompletion: targetDate || null
      });

      if (onSuccess) onSuccess(res.data?.job);
      onClose();
    } catch (err) {
      console.error('Assignment error:', err);
      setError(err.response?.data?.detail || 'Failed to assign planning owner.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-sm">
              <UserCheck size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Assign Planning Owner</h3>
              <p className="text-xs text-slate-500">Job #{job?.jobNo} • {job?.panelName}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Planning Owner with Workload & Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Planning Owner *
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">
                {filteredCandidates.length} of {candidates.length} Available
              </span>
            </div>

            {loadingCandidates ? (
              <div className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-indigo-600" />
                <span>Loading all eligible engineers & active workloads...</span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={candidatesSearch}
                    onChange={(e) => setCandidatesSearch(e.target.value)}
                    placeholder="Search engineer by name or department..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <select
                  value={selectedOwnerOptionKey}
                  onChange={handleSelectUser}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer"
                >
                  <option value="" disabled>-- Select Planning Lead ({filteredCandidates.length} available) --</option>
                  {filteredCandidates.map(c => {
                    const optKey = c.uniqueKey || `${c.userType || 'u'}_${c.id}_${c.name}`;
                    const displayName = c.name || c.username;
                    return (
                      <option key={optKey} value={optKey} className="py-1">
                        {displayName}
                      </option>
                    );
                  })}
                </select>
                {selectedOwnerName && (
                  <div className="px-3 py-1.5 bg-indigo-50/80 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 flex items-center justify-between">
                    <span>Selected: <strong>{selectedOwnerName}</strong></span>
                    <span className="text-indigo-600 font-semibold text-[10px]">✓ Ready to Assign</span>
                  </div>
                )}
              </>
            )}
            <p className="text-[11px] text-slate-400">
              Select the engineer who will own this job through the planning milestone.
            </p>
          </div>

          {/* Reason Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason Category *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            >
              {REASON_CATEGORIES.map(rc => (
                <option key={rc} value={rc}>{rc}</option>
              ))}
            </select>
          </div>

          {/* Detailed Explanation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                Assignment Reason / Explanation *
              </label>
              <span className="text-[10px] text-slate-400 font-medium">Min 10 chars (Strictly mandatory)</span>
            </div>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Provide clear technical rationale for assigning this owner (e.g. specialized in VFD panels, existing client familiarity)..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 placeholder-slate-400"
            />
          </div>

          {/* Priority & Target Date */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Target Due Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedOwnerId || explanation.trim().length < 10}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-500/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
              <span>Assign Owner →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 2. FORMAL REASSIGN PLANNING OWNER MODAL
// ==========================================
export function ReassignOwnerModal({ job, isOpen, onClose, onSuccess }) {
  const [candidates, setCandidates] = useState([]);
  const [candidatesSearch, setCandidatesSearch] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerOptionKey, setNewOwnerOptionKey] = useState('');
  const [reasonCategory, setReasonCategory] = useState(REASON_CATEGORIES[0]);
  const [reassignReason, setReassignReason] = useState('');
  const [additionalNote, setAdditionalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const currentOwner = job?.planningOwnerName || 'Unassigned';

  useEffect(() => {
    if (isOpen) {
      setError('');
      setReassignReason('');
      setAdditionalNote('');
      setCandidatesSearch('');
      setReasonCategory(REASON_CATEGORIES[0]);
      fetchCandidates();
    }
  }, [isOpen, job]);

  const fetchCandidates = async () => {
    try {
      setLoadingCandidates(true);
      let list = [];
      try {
        const res = await api.get('/jobs/control/users-workload');
        list = Array.isArray(res.data) ? res.data : (res.data?.users || []);
      } catch (err) {
        console.warn('Could not load candidates workload, trying /users fallback:', err);
      }

      if (!list || list.length === 0) {
        try {
          const uRes = await api.get('/users');
          const rawUsers = Array.isArray(uRes.data) ? uRes.data : [];
          list = rawUsers.map(u => ({
            id: u.id,
            uniqueKey: u.uniqueKey || `user_${u.id}_${u.name || u.username}`,
            userType: u.userType || 'user',
            name: u.name || u.username,
            username: u.username || u.name,
            departments: u.departments || [],
            activeCount: 0,
            waitingCount: 0
          }));
        } catch (uErr) {
          console.warn('Users fallback failed:', uErr);
        }
      }

      // Deduplicate by uniqueKey or id+name
      const seen = new Set();
      const deduped = (list || []).filter(c => {
        const k = c.uniqueKey || `${c.id}-${c.name || c.username}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Keep all candidates available in dropdown
      setCandidates(deduped);
      if (list.length > 0) {
        const first = list.find(c => {
          const isSameId = job?.planningOwnerId && String(c.id) === String(job?.planningOwnerId);
          const isSameName = job?.planningOwnerName && (c.name || '').toLowerCase() === job.planningOwnerName.toLowerCase();
          return !isSameId && !isSameName;
        }) || list[0];
        const optKey = first.uniqueKey || `${first.userType || 'u'}_${first.id}_${first.name}`;
        setNewOwnerOptionKey(optKey);
        setNewOwnerId(first.id);
        setNewOwnerName(first.name || first.username);
      }
    } catch (err) {
      console.warn('Could not load candidates:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const filteredCandidates = candidates.filter(c => {
    if (!candidatesSearch) return true;
    const q = candidatesSearch.toLowerCase();
    const nameMatch = (c.name || '').toLowerCase().includes(q);
    const userMatch = (c.username || '').toLowerCase().includes(q);
    const deptMatch = (c.departments || []).some(d => d.toLowerCase().includes(q));
    return nameMatch || userMatch || deptMatch;
  });

  const handleSelectNewUser = (e) => {
    const keyVal = e.target.value;
    setNewOwnerOptionKey(keyVal);
    const found = candidates.find(c => {
      const optKey = c.uniqueKey || `${c.userType || 'u'}_${c.id}_${c.name}`;
      return optKey === keyVal || String(c.id) === String(keyVal);
    });
    if (found) {
      setNewOwnerId(found.id);
      setNewOwnerName(found.name || found.username);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newOwnerId) {
      setError('Please select a new Planning Owner.');
      return;
    }
    if (!reassignReason || reassignReason.trim().length < 5) {
      setError('Reassignment reason is strictly mandatory.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/control/reassign-owner`, {
        newOwnerId,
        newOwnerName,
        ownerId: newOwnerId,
        ownerName: newOwnerName,
        reasonCategory,
        reassignmentReason: reassignReason.trim(),
        reason: reassignReason.trim(),
        explanation: reassignReason.trim(),
        additionalNote: additionalNote.trim()
      });

      if (onSuccess) onSuccess(res.data?.job);
      onClose();
    } catch (err) {
      console.error('Reassignment error:', err);
      setError(err.response?.data?.detail || 'Failed to reassign planning owner.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-600 text-white shadow-sm">
              <RefreshCw size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Reassign Planning Owner</h3>
              <p className="text-xs text-slate-500">Job #{job?.jobNo} • Transfer ownership with audit logging</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Current Owner Card */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Current Owner</span>
              <span className="text-xs font-bold text-slate-800">{currentOwner}</span>
            </div>
            <ArrowRight size={16} className="text-slate-400" />
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Status</span>
              <span className="text-xs font-bold text-indigo-600">Reassignment Pending</span>
            </div>
          </div>

          {/* New Owner Select with Search */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                New Planning Owner *
              </label>
              <span className="text-[10px] text-slate-400 font-semibold">
                {filteredCandidates.length} of {candidates.length} Available
              </span>
            </div>

            {loadingCandidates ? (
              <div className="py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-400 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-indigo-600" />
                <span>Loading available owners...</span>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={candidatesSearch}
                    onChange={(e) => setCandidatesSearch(e.target.value)}
                    placeholder="Search candidate name or department..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-500/20"
                  />
                </div>

                <select
                  value={newOwnerOptionKey}
                  onChange={handleSelectNewUser}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
                >
                  <option value="" disabled>-- Select New Planning Owner ({filteredCandidates.length} available) --</option>
                  {filteredCandidates.map(c => {
                    const optKey = c.uniqueKey || `${c.userType || 'u'}_${c.id}_${c.name}`;
                    const displayName = c.name || c.username;
                    return (
                      <option key={optKey} value={optKey} className="py-1">
                        {displayName}
                      </option>
                    );
                  })}
                </select>
                {newOwnerName && (
                  <div className="px-3 py-1.5 bg-amber-50/80 border border-amber-100 rounded-xl text-[11px] text-amber-900 flex items-center justify-between">
                    <span>Reassign to: <strong>{newOwnerName}</strong></span>
                    <span className="text-amber-700 font-semibold text-[10px]">✓ Selected</span>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reason Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Reason Category *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20"
            >
              {REASON_CATEGORIES.map(rc => (
                <option key={rc} value={rc}>{rc}</option>
              ))}
            </select>
          </div>

          {/* Reassignment Reason */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Reassignment Reason *
            </label>
            <textarea
              rows={2}
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="e.g. Previous owner on emergency leave, overload rebalancing, priority realignment..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 placeholder-slate-400"
            />
          </div>

          {/* Additional Note */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Additional Technical Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={additionalNote}
              onChange={(e) => setAdditionalNote(e.target.value)}
              placeholder="Notes for new owner regarding completed steps or pending queries..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-amber-500/20 placeholder-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !newOwnerId || !reassignReason.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-amber-500/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>Confirm Reassignment →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 3. CLARIFICATION REQUEST MODAL
// ==========================================
export function ClarificationModal({ job, isOpen, onClose, onSuccess }) {
  const [category, setCategory] = useState(CLARIFICATION_CATEGORIES[0]);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setDetails('');
      setCategory(CLARIFICATION_CATEGORIES[0]);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!details || details.trim().length < 5) {
      setError('Please provide specific details regarding what clarification is required.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/control/request-clarification`, {
        reasonCategory: category,
        details: details.trim(),
        targetDepartment: 'marketing'
      });
      if (onSuccess) onSuccess(res.data?.job);
      onClose();
    } catch (err) {
      console.error('Clarification request error:', err);
      setError(err.response?.data?.detail || 'Failed to submit clarification request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-rose-50 border-b border-rose-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-600 text-white shadow-sm">
              <AlertCircle size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-rose-900">Request Clarification / Return Job</h3>
              <p className="text-xs text-rose-700">Flag missing information or drawings for the responsible team</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-rose-400 hover:text-rose-700 hover:bg-rose-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Issue Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20"
            >
              {CLARIFICATION_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Detailed Query / Missing Item Specification *
            </label>
            <textarea
              rows={4}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="State exactly what drawing, parameter, or commercial confirmation is missing before planning can proceed..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-rose-500/20 placeholder-slate-400"
            />
          </div>

          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
            <strong>Target:</strong> Notification will be dispatched to Responsible Engineer: <strong>{job?.responsibleEnggName || 'Department'}</strong>.
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !details.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-rose-500/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
              <span>Submit Clarification Request →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 4. SUBMIT CORRECTION MODAL
// ==========================================
export function CorrectionModal({ job, isOpen, onClose, onSuccess }) {
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSummary('');
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!summary || summary.trim().length < 5) {
      setError('Please provide a summary of the corrections made.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/control/submit-correction`, {
        summary: summary.trim()
      });
      if (onSuccess) onSuccess(res.data?.job);
      onClose();
    } catch (err) {
      console.error('Correction submission error:', err);
      setError(err.response?.data?.detail || 'Failed to submit correction.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-emerald-50 border-b border-emerald-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-900">Submit Correction / Resolved Clarification</h3>
              <p className="text-xs text-emerald-700">Return job to Planning Verification with updated information</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {job?.handoverReturnReason && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <span className="font-bold text-slate-800 block mb-1">Previous Query / Issue:</span>
              <p className="italic text-slate-600">{job.handoverReturnReason}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Correction Summary & Actions Taken *
            </label>
            <textarea
              rows={4}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Explain what information or documents have been revised and confirmed..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !summary.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-500/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              <span>Re-Submit to Verification →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ==========================================
// 5. RELEASE TO NEXT DEPARTMENT MODAL
// ==========================================
export function ReleaseModal({ job, isOpen, onClose, onSuccess }) {
  const [targetDept, setTargetDept] = useState('production');
  const [category, setCategory] = useState(FORWARDING_CATEGORIES[0]);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setNotes('');
      setCategory(FORWARDING_CATEGORIES[0]);
    }
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!notes || notes.trim().length < 5) {
      setError('Please provide release instructions or notes for the receiving department.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const res = await api.post(`/jobs/${job.id}/control/release`, {
        targetDepartment: targetDept,
        reasonCategory: category,
        notes: notes.trim()
      });
      if (onSuccess) onSuccess(res.data?.job);
      onClose();
    } catch (err) {
      console.error('Release error:', err);
      setError(err.response?.data?.detail || 'Failed to release job.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm">
              <Send size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-blue-900">Release Planning to Next Department</h3>
              <p className="text-xs text-blue-700">Forward verified planning package to execution teams</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-blue-400 hover:text-blue-700 hover:bg-blue-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Receiving Department *
            </label>
            <select
              value={targetDept}
              onChange={(e) => setTargetDept(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {DEPARTMENTS.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Forwarding Reason Category *
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {FORWARDING_CATEGORIES.map(fc => (
                <option key={fc} value={fc}>{fc}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Forwarding Notes & Technical Instructions *
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Include production timeline, BOM notes, or specific customer delivery priorities..."
              className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 placeholder-slate-400"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !notes.trim()}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              <span>Release & Forward →</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
