import { useState, useEffect } from 'react';
import api from '../services/api';
import {
  X, Clock, User, ArrowRightLeft, CheckCircle2, PauseCircle,
  PlayCircle, AlertTriangle, Calendar, Layers, Activity,
  FileText, ShieldCheck, ChevronRight, Loader2, Sparkles, Sliders
} from 'lucide-react';

function formatDuration(sec) {
  if (sec === null || sec === undefined || isNaN(sec) || sec < 0) return '00:00:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDateTime(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export default function JobHistoryDrawer({
  jobId,
  isOpen,
  onClose,
  onOpenHandover,
  onOpenProgress
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'handovers' | 'sessions' | 'progress'

  useEffect(() => {
    if (!isOpen || !jobId) return;

    let isMounted = true;
    setLoading(true);

    api.get(`/job-monitoring/timeline/${jobId}/history`)
      .then((res) => {
        if (isMounted) setData(res.data);
      })
      .catch((err) => {
        console.error('Failed to load job history:', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, jobId]);

  if (!isOpen) return null;

  const job = data?.job || {};
  const assignment = data?.assignment || {};
  const handovers = data?.handovers || [];
  const sessions = data?.sessions || [];
  const progressLogs = data?.progressLogs || [];

  // Build unified chronological event stream
  const timelineEvents = [];

  if (assignment?.assignedAt) {
    timelineEvents.push({
      type: 'assignment',
      time: assignment.assignedAt,
      title: 'Initial Job Assignment',
      description: `Assigned to ${assignment.currentWorkerName || 'Worker'} by ${assignment.assignedBy || 'Manager'}`,
      badge: 'Assignment',
      badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
      icon: User,
      data: assignment
    });
  }

  handovers.forEach((h) => {
    timelineEvents.push({
      type: 'handover',
      time: h.handoverAt,
      title: `Worker Handover: ${h.fromWorker} ➔ ${h.toWorker}`,
      description: h.workCompletedSummary || `Shift Handover (${h.reason})`,
      badge: h.reason || 'Handover',
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: ArrowRightLeft,
      data: h
    });
  });

  sessions.forEach((s) => {
    const isPause = s.sessionType === 'PAUSE';
    timelineEvents.push({
      type: 'session',
      time: s.startedAt,
      title: isPause ? `Execution Paused: ${s.pauseReason || 'Break'}` : 'Work Session Started',
      description: s.notes || (isPause ? `Paused for ${formatDuration(s.durationSeconds)}` : `Active session by ${s.performedBy}`),
      badge: isPause ? 'Paused' : 'Work Session',
      badgeColor: isPause ? 'bg-orange-100 text-orange-800 border-orange-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: isPause ? PauseCircle : PlayCircle,
      data: s
    });
  });

  progressLogs.forEach((p) => {
    timelineEvents.push({
      type: 'progress',
      time: p.recordedAt,
      title: `Progress Updated to ${p.progressPercentage}%`,
      description: p.note || `Active work units updated by ${p.recordedBy}`,
      badge: `${p.progressPercentage}%`,
      badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      icon: Activity,
      data: p
    });
  });

  // Sort descending by time
  timelineEvents.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

  const filteredEvents = timelineEvents.filter((ev) => {
    if (activeTab === 'all') return true;
    return ev.type === activeTab;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end bg-slate-900/40 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-xl bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300 border-l border-slate-200">
        {/* Drawer Header */}
        <div className="px-6 py-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              #{job.id || jobId}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <span>{job.jobNo || `Job #${jobId}`}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                  job.status === 'In Progress' || job.status === 'Running' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  job.status === 'On Hold' || job.status === 'Paused' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  job.status === 'Completed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  'bg-slate-100 text-slate-700 border-slate-200'
                }`}>
                  {job.status === 'Running' ? 'In Progress' : job.status === 'Paused' ? 'On Hold' : (job.status || 'Draft')}
                </span>
              </h3>
              <p className="text-xs text-slate-500 truncate max-w-[280px]">
                {job.panelName || 'No panel specified'} • {job.clientName || 'Direct Client'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-6 py-3 bg-white border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'all' ? 'bg-white shadow-xs text-slate-900 font-semibold' : 'hover:text-slate-900'}`}
            >
              All ({timelineEvents.length})
            </button>
            <button
              onClick={() => setActiveTab('handover')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'handover' ? 'bg-white shadow-xs text-amber-700 font-semibold' : 'hover:text-slate-900'}`}
            >
              Handovers ({handovers.length})
            </button>
            <button
              onClick={() => setActiveTab('session')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'session' ? 'bg-white shadow-xs text-emerald-700 font-semibold' : 'hover:text-slate-900'}`}
            >
              Sessions ({sessions.length})
            </button>
            <button
              onClick={() => setActiveTab('progress')}
              className={`px-2.5 py-1 rounded-md transition-colors ${activeTab === 'progress' ? 'bg-white shadow-xs text-indigo-700 font-semibold' : 'hover:text-slate-900'}`}
            >
              Progress ({progressLogs.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenProgress && (
              <button
                onClick={() => onOpenProgress(job)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center gap-1.5 border border-indigo-200"
              >
                <Sliders size={13} />
                <span>Progress</span>
              </button>
            )}
            {onOpenHandover && (
              <button
                onClick={() => onOpenHandover(job)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1.5 border border-amber-200"
              >
                <ArrowRightLeft size={13} />
                <span>Handover</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <p className="text-xs">Loading complete audit history...</p>
            </div>
          ) : (
            <>
              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Active Time</div>
                  <div className="text-base font-bold text-slate-800 mt-1">
                    {formatDuration(job.actualDurationSeconds)}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Est: {Math.round((job.estimatedDurationSeconds || 0) / 3600)}h
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Completion</div>
                  <div className="text-base font-bold text-indigo-700 mt-1">
                    {job.progressPercentage || 0}%
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {job.completedWorkUnits || 0} / {job.targetWorkUnits || 100} units
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Handovers</div>
                  <div className="text-base font-bold text-amber-700 mt-1">
                    {handovers.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {job.currentWorkerName || 'Unassigned'}
                  </div>
                </div>
              </div>

              {/* Current Worker Card */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                    {(job.currentWorkerName || 'W').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-blue-950 flex items-center gap-1.5">
                      <span>{job.currentWorkerName || 'Unassigned Worker'}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full bg-blue-200/80 text-blue-800 font-medium">
                        {job.currentWorkerPosition || 'Staff'}
                      </span>
                    </div>
                    <div className="text-[11px] text-blue-700 mt-0.5">
                      Current Active Assignee • {job.targetDepartment || 'Production'}
                    </div>
                  </div>
                </div>
                {job.lastHandoverAt && (
                  <div className="text-right">
                    <span className="text-[10px] text-blue-600 block">Last Handover</span>
                    <span className="text-xs font-semibold text-blue-900">
                      {formatDateTime(job.lastHandoverAt)}
                    </span>
                  </div>
                )}
              </div>

              {/* On Hold Notification Banner if paused */}
              {(job.status === 'On Hold' || job.status === 'Paused') && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <PauseCircle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-900">
                        Job Is Currently On Hold
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">
                        {job.pauseReasonCategory || 'Paused'}
                      </span>
                    </div>
                    {job.pauseNotes && (
                      <p className="text-xs text-amber-800 mt-1">
                        Reason: {job.pauseNotes}
                      </p>
                    )}
                    {job.expectedResumeAt && (
                      <p className="text-[11px] text-amber-700 mt-1 font-medium">
                        Expected Resume: {formatDateTime(job.expectedResumeAt)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Chronological Audit Trail */}
              <div>
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Clock size={14} className="text-blue-600" />
                  <span>Chronological Activity & Handover Trail</span>
                </h4>

                {filteredEvents.length === 0 ? (
                  <div className="text-center py-10 text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No activity logs recorded for this category.
                  </div>
                ) : (
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                    {filteredEvents.map((ev, idx) => {
                      const IconComponent = ev.icon;
                      return (
                        <div key={idx} className="relative group">
                          {/* Node Icon */}
                          <div className="absolute -left-6 top-0 w-5 h-5 rounded-full bg-white border-2 border-blue-500 flex items-center justify-center shadow-xs">
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                          </div>

                          {/* Event Card */}
                          <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs hover:border-slate-300 transition-all">
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <IconComponent size={14} className="text-slate-500" />
                                <span>{ev.title}</span>
                              </span>
                              <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                {formatDateTime(ev.time)}
                              </span>
                            </div>

                            <p className="text-xs text-slate-600">
                              {ev.description}
                            </p>

                            {/* Additional metadata pills */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                              <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${ev.badgeColor}`}>
                                {ev.badge}
                              </span>

                              {ev.type === 'handover' && ev.data && (
                                <>
                                  <span className="text-[10px] text-slate-500">
                                    By: <strong>{ev.data.performedBy || 'System'}</strong>
                                  </span>
                                  {ev.data.notes && (
                                    <span className="text-[10px] text-slate-500 italic">
                                      "{ev.data.notes}"
                                    </span>
                                  )}
                                </>
                              )}

                              {ev.type === 'session' && ev.data && ev.data.durationSeconds > 0 && (
                                <span className="text-[10px] text-slate-500">
                                  Duration: <strong>{formatDuration(ev.data.durationSeconds)}</strong>
                                </span>
                              )}

                              {ev.type === 'progress' && ev.data && ev.data.completedWorkUnits !== undefined && (
                                <span className="text-[10px] text-slate-500">
                                  {ev.data.completedWorkUnits} of {ev.data.targetWorkUnits || 100} units
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
          >
            Close Drawer
          </button>
        </div>
      </div>
    </div>
  );
}
