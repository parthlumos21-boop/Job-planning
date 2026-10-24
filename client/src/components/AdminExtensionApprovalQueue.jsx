import React, { useState, useEffect } from 'react';
import { 
  Clock, CheckCircle, XCircle, AlertCircle, RefreshCw, 
  ArrowRight, ShieldCheck, User, Calendar
} from 'lucide-react';
import axios from 'axios';

export default function AdminExtensionApprovalQueue({ onReviewAction }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  useEffect(() => {
    fetchPendingRequests();
  }, []);

  const fetchPendingRequests = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/planning/extension-requests?status=Pending', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRequests(res.data || []);
    } catch (err) {
      console.error('Failed to fetch extension requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (requestId, action) => {
    try {
      setProcessingId(requestId);
      const token = localStorage.getItem('token');
      await axios.post(`/api/planning/extension-requests/${requestId}/review`, {
        action: action,
        review_remarks: action === 'APPROVE' ? 'Approved in Admin Queue' : 'Rejected in Admin Queue'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      fetchPendingRequests();
      if (onReviewAction) onReviewAction();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to process request');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && requests.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500">
        <RefreshCw size={14} className="animate-spin text-indigo-600" />
        <span>Loading extension requests...</span>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-emerald-50/60 p-5 rounded-2xl border border-emerald-200 text-emerald-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2.5">
          <CheckCircle size={16} className="text-emerald-600" />
          <span className="font-bold">All Department Deadlines Clear — No pending extension requests.</span>
        </div>
        <button onClick={fetchPendingRequests} className="p-1 rounded text-emerald-700 hover:bg-emerald-100">
          <RefreshCw size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-200 overflow-hidden shadow-xs">
      <div className="px-5 py-3.5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-amber-600" />
          <span className="text-xs font-black uppercase tracking-wider text-amber-900">
            Pending Department Extension Requests ({requests.length})
          </span>
        </div>
        <button
          onClick={fetchPendingRequests}
          className="text-amber-700 hover:text-amber-900 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
        >
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Queue</span>
        </button>
      </div>

      <div className="divide-y divide-slate-100">
        {requests.map((req) => (
          <div key={req.id} className="p-4 hover:bg-slate-50/60 transition-colors text-xs flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 max-w-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-black text-slate-900 text-sm">Job #{req.job_id}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-100 text-indigo-800 border border-indigo-200">
                  {req.department}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {req.reason_category}
                </span>
              </div>

              <div className="flex items-center gap-4 text-[11px] text-slate-500 font-medium">
                <span>Current: <strong className="text-slate-700 font-mono">{req.current_deadline}</strong></span>
                <ArrowRight size={12} className="text-slate-400" />
                <span>Requested: <strong className="text-indigo-700 font-mono font-bold">{req.requested_deadline}</strong> (+{req.requested_extension_days}d)</span>
                <span>• Requested by: <strong className="text-slate-700">{req.requested_by_name}</strong></span>
              </div>

              <p className="text-slate-700 italic text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-100 mt-1">
                "{req.reason_text}"
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleReview(req.id, 'APPROVE')}
                disabled={processingId === req.id}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle size={13} />
                <span>Approve</span>
              </button>
              <button
                onClick={() => handleReview(req.id, 'REJECT')}
                disabled={processingId === req.id}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <XCircle size={13} />
                <span>Reject</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
