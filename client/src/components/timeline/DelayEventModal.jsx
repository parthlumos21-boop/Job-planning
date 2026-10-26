import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import api from '../../services/api';

export default function DelayEventModal({
  activeDelayModal,
  delayReasons = [],
  currentUser,
  onClose,
  onSubmit,
  submitting
}) {
  const [selectedReasonId, setSelectedReasonId] = useState('');
  const [delayDays, setDelayDays] = useState(1);
  const [delayRemarks, setDelayRemarks] = useState('');
  const [responsiblePerson, setResponsiblePerson] = useState('');
  const [userList, setUserList] = useState([]);

  // Department-specific filtering of reasons loaded from the database
  const activeDept = (activeDelayModal?.department || '').toLowerCase().trim();
  const relevantReasons = delayReasons.filter(r => {
    const rDept = (r.department || 'ALL').toLowerCase().trim();
    return rDept === 'all' || rDept === activeDept;
  });
  const reasonsToDisplay = relevantReasons.length > 0 ? relevantReasons : delayReasons;

  // Fetch active users from database
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/users');
        const rawUsers = Array.isArray(res.data) ? res.data : (res.data?.users || []);
        setUserList(rawUsers);
      } catch (err) {
        console.error('Failed to load users for delay attribution:', err);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (reasonsToDisplay.length > 0) {
      setSelectedReasonId(reasonsToDisplay[0].id);
    }
    setResponsiblePerson(currentUser?.name || currentUser?.username || 'Client / Customer Representative');
    setDelayDays(1);
    setDelayRemarks('');
  }, [activeDelayModal, delayReasons, currentUser]);

  if (!activeDelayModal) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedReasonId || delayDays <= 0) return;
    onSubmit({
      scheduleId: activeDelayModal.id,
      delayReasonId: parseInt(selectedReasonId),
      delayDays: parseInt(delayDays),
      delayRemarks,
      responsiblePerson
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-2xs">
      <div className="bg-white rounded-[4px] border border-slate-300 w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Gray Title Bar */}
        <div className="bg-slate-100 border-b border-slate-300 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-rose-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Record Department Delay Event — {activeDelayModal.department?.toUpperCase()}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Standardized Delay Reason *
            </label>
            <select
              value={selectedReasonId}
              onChange={(e) => setSelectedReasonId(e.target.value)}
              required
              className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
            >
              {reasonsToDisplay.map((r) => {
                const labelText = r.label || r.reason_name || r.description || r.code;
                const typeTag = r.delay_type ? ` [${r.delay_type}]` : '';
                return (
                  <option key={r.id} value={r.id}>
                    {labelText}{typeTag}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Delay Duration (Days) *
              </label>
              <input
                type="number"
                min="1"
                max="90"
                value={delayDays}
                onChange={(e) => setDelayDays(e.target.value)}
                required
                className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs font-bold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Responsible Party / Entity *
              </label>
              <select
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                required
                className="w-full h-[32px] px-2.5 rounded-[3px] border border-slate-300 text-xs font-semibold text-slate-800 bg-white focus:outline-none focus:border-blue-500"
              >
                <optgroup label="Registered Organization Users">
                  {userList.map((u) => {
                    const uName = u.name || u.username;
                    const deptTag = u.departments && u.departments.length > 0 ? ` (${u.departments.join(', ')})` : '';
                    return (
                      <option key={u.id || u.username} value={uName}>
                        {uName}{deptTag}
                      </option>
                    );
                  })}
                </optgroup>
                <optgroup label="External Parties & Stakeholders">
                  <option value="Client / Customer Representative">Client / Customer Representative</option>
                  <option value="External Material Vendor / Supplier">External Material Vendor / Supplier</option>
                  <option value="Third-Party Inspection Agency">Third-Party Inspection Agency</option>
                  <option value="Logistics & Transporter">Logistics & Transporter</option>
                </optgroup>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Detailed Remarks &amp; Description *
            </label>
            <textarea
              required
              rows={3}
              value={delayRemarks}
              onChange={(e) => setDelayRemarks(e.target.value)}
              placeholder="State root cause of delay, impact on next stage, and corrective action..."
              className="w-full p-2.5 rounded-[3px] border border-slate-300 text-xs text-slate-800 bg-white focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-3.5 rounded-[3px] bg-white hover:bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-[30px] px-4 rounded-[3px] bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-2xs border border-rose-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <span>{submitting ? 'Recording...' : 'Record Delay Event'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
