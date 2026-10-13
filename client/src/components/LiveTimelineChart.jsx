import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, User, Play, Pause, CheckCircle2, AlertTriangle,
  ZoomIn, ArrowRightLeft, Calendar, Sparkles, RefreshCw,
  Search, Sliders, ChevronRight, Eye, ShieldCheck, Activity
} from 'lucide-react';

/**
 * Format seconds into HH:MM:SS
 */
function formatDuration(sec) {
  if (sec === null || sec === undefined || isNaN(sec) || sec < 0) return '00:00:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format timestamp into readable time string: "10:30 AM"
 */
function formatTime(isoString, withSeconds = false) {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {})
  });
}

function formatDate(isoString) {
  if (!isoString) return '--';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function LiveTimelineChart({
  jobs = [],
  loading = false,
  selectedJobId = null,
  onSelectJob,
  onOpenHistory,
  onOpenProgress,
  onOpenHandover,
  onRefresh
}) {
  const [zoomMode, setZoomMode] = useState('dynamic'); // 'shift' | 'day' | 'week' | 'month' | 'dynamic'
  const [nowMs, setNowMs] = useState(Date.now());
  const [filterWorker, setFilterWorker] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [timelineSearch, setTimelineSearch] = useState('');
  const [hoveredTooltip, setHoveredTooltip] = useState(null);
  const scrollContainerRef = useRef(null);

  // 1-second live ticker for live cursor advancement
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter jobs for timeline chart
  const displayedJobs = useMemo(() => {
    return jobs.filter((j) => {
      if (filterStatus !== 'all' && (j.status || 'Draft').toLowerCase() !== filterStatus.toLowerCase()) {
        return false;
      }
      if (filterWorker !== 'all') {
        const worker = String(j.currentWorkerName || '').toLowerCase();
        if (!worker.includes(filterWorker.toLowerCase())) return false;
      }
      if (timelineSearch) {
        const q = timelineSearch.toLowerCase();
        const matchesJobNo = String(j.jobNo || '').toLowerCase().includes(q);
        const matchesPanel = String(j.panelName || '').toLowerCase().includes(q);
        const matchesWorker = String(j.currentWorkerName || '').toLowerCase().includes(q);
        if (!matchesJobNo && !matchesPanel && !matchesWorker) return false;
      }
      return true;
    });
  }, [jobs, filterStatus, filterWorker, timelineSearch]);

  // Dynamic Scale Range Calculation
  const scale = useMemo(() => {
    const now = nowMs;
    const timestamps = [now];

    displayedJobs.forEach((j) => {
      if (j.plannedStartAt) timestamps.push(new Date(j.plannedStartAt).getTime());
      if (j.plannedEndAt) timestamps.push(new Date(j.plannedEndAt).getTime());
      if (j.actualStartAt) timestamps.push(new Date(j.actualStartAt).getTime());
      if (j.actualEndAt) timestamps.push(new Date(j.actualEndAt).getTime());
      if (j.sessions?.length) {
        j.sessions.forEach((s) => {
          if (s.startedAt) timestamps.push(new Date(s.startedAt).getTime());
          if (s.endedAt) timestamps.push(new Date(s.endedAt).getTime());
        });
      }
    });

    const validTs = timestamps.filter((t) => !isNaN(t) && t > 0);
    let minTs = Math.min(...validTs);
    let maxTs = Math.max(...validTs);

    if (zoomMode === 'shift') {
      // 8-hour shift window centered on now
      minTs = now - 3 * 3600 * 1000;
      maxTs = now + 5 * 3600 * 1000;
    } else if (zoomMode === 'day') {
      // 24-hour day window centered on now
      minTs = now - 10 * 3600 * 1000;
      maxTs = now + 14 * 3600 * 1000;
    } else if (zoomMode === 'week') {
      // 7-day window
      minTs = now - 2 * 86400 * 1000;
      maxTs = now + 5 * 86400 * 1000;
    } else if (zoomMode === 'month') {
      // 30-day window
      minTs = now - 7 * 86400 * 1000;
      maxTs = now + 23 * 86400 * 1000;
    } else {
      // Dynamic auto-fit: ensure at least 6 hours span with 5% margin
      const rawSpan = Math.max(6 * 3600 * 1000, maxTs - minTs);
      const pad = rawSpan * 0.05;
      minTs = minTs - pad;
      maxTs = maxTs + pad;
    }

    const spanMs = Math.max(1000, maxTs - minTs);

    // Generate smart scale ticks
    const ticks = [];
    let tickStepMs = 3600 * 1000; // 1 hour default

    if (zoomMode === 'week') {
      tickStepMs = 24 * 3600 * 1000; // 1 day
    } else if (zoomMode === 'month') {
      tickStepMs = 3 * 24 * 3600 * 1000; // 3 days
    } else if (spanMs > 48 * 3600 * 1000) {
      tickStepMs = 12 * 3600 * 1000; // 12 hours
    } else if (spanMs > 12 * 3600 * 1000) {
      tickStepMs = 2 * 3600 * 1000; // 2 hours
    }

    const firstTick = Math.ceil(minTs / tickStepMs) * tickStepMs;
    for (let t = firstTick; t <= maxTs; t += tickStepMs) {
      const pct = ((t - minTs) / spanMs) * 100;
      if (pct >= 0 && pct <= 100) {
        ticks.push({
          timeMs: t,
          pct,
          label: formatTime(new Date(t).toISOString()),
          dateLabel: formatDate(new Date(t).toISOString())
        });
      }
    }

    const nowPct = Math.min(100, Math.max(0, ((now - minTs) / spanMs) * 100));

    return { minTs, maxTs, spanMs, ticks, nowPct };
  }, [nowMs, displayedJobs, zoomMode]);

  // Helper: map a timestamp to % position
  const getPct = (ts) => {
    if (!ts) return null;
    const t = new Date(ts).getTime();
    if (isNaN(t)) return null;
    return Math.min(100, Math.max(0, ((t - scale.minTs) / scale.spanMs) * 100));
  };

  // Helper: calculate width between two timestamps
  const getWidthPct = (startTs, endTs) => {
    if (!startTs || !endTs) return 0;
    const s = new Date(startTs).getTime();
    const e = new Date(endTs).getTime();
    if (isNaN(s) || isNaN(e) || e <= s) return 0;
    const startP = Math.min(100, Math.max(0, ((s - scale.minTs) / scale.spanMs) * 100));
    const endP = Math.min(100, Math.max(0, ((e - scale.minTs) / scale.spanMs) * 100));
    return Math.max(0.5, endP - startP);
  };

  // Auto-scroll timeline to live red cursor on initial mount or zoom
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollTarget = (scale.nowPct / 100) * container.scrollWidth - container.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
    }
  }, [zoomMode]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col">
      {/* Top Controls Toolbar */}
      <div className="p-4 border-b border-slate-200/80 bg-slate-50/70 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Pulsing Badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            <span>LIVE OPERATIONAL TIMELINE</span>
            <span className="text-[10px] text-emerald-600 font-mono">
              {new Date(nowMs).toLocaleTimeString()}
            </span>
          </div>

          {/* Quick Filter: Search */}
          <div className="relative min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Search job or worker..."
              className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running Only</option>
            <option value="paused">Paused Only</option>
            <option value="draft">Scheduled / Draft</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        {/* Zoom & Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Zoom Modes */}
          <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-lg text-xs font-semibold text-slate-600 shadow-xs">
            <button
              onClick={() => setZoomMode('shift')}
              className={`px-2.5 py-1 rounded-md transition-all ${zoomMode === 'shift' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'}`}
              title="8-Hour Shift Window"
            >
              8h Shift
            </button>
            <button
              onClick={() => setZoomMode('day')}
              className={`px-2.5 py-1 rounded-md transition-all ${zoomMode === 'day' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'}`}
              title="24-Hour Day Window"
            >
              24h Day
            </button>
            <button
              onClick={() => setZoomMode('week')}
              className={`px-2.5 py-1 rounded-md transition-all ${zoomMode === 'week' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'}`}
              title="7-Day Horizon"
            >
              7 Days
            </button>
            <button
              onClick={() => setZoomMode('month')}
              className={`px-2.5 py-1 rounded-md transition-all ${zoomMode === 'month' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'}`}
              title="30-Day Monthly View"
            >
              30 Days
            </button>
            <button
              onClick={() => setZoomMode('dynamic')}
              className={`px-2.5 py-1 rounded-md transition-all ${zoomMode === 'dynamic' ? 'bg-blue-600 text-white shadow-xs' : 'hover:text-slate-900'}`}
              title="Auto-Fit All Jobs"
            >
              Auto-Fit
            </button>
          </div>

          {/* Refresh Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-xs"
              title="Refresh timeline records"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin text-blue-600' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Timeline Gantt Grid Matrix */}
      <div className="relative overflow-x-auto flex-1 min-h-[380px] max-h-[580px]" ref={scrollContainerRef}>
        <div className="min-w-[980px] w-full flex flex-col">
          {/* Header Row: Left Columns + Right Time Axis */}
          <div className="flex border-b border-slate-200 bg-slate-100/90 sticky top-0 z-20 shadow-xs">
            {/* Frozen Left Columns Header */}
            <div className="w-[340px] shrink-0 px-4 py-2.5 flex items-center justify-between border-r border-slate-200 bg-slate-100 font-bold text-xs text-slate-700 uppercase tracking-wider">
              <span>Job & Assignee Details</span>
              <span className="text-[10px] text-slate-500 font-normal">
                {displayedJobs.length} {displayedJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            </div>

            {/* Right Dynamic Time Axis Header */}
            <div className="flex-1 relative h-10 bg-slate-50/80 overflow-hidden">
              {scale.ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-slate-200/80 flex flex-col justify-center pl-1.5"
                  style={{ left: `${tick.pct}%` }}
                >
                  <span className="text-[10px] font-bold text-slate-700 leading-tight">
                    {tick.label}
                  </span>
                  <span className="text-[9px] text-slate-400 leading-tight">
                    {tick.dateLabel}
                  </span>
                </div>
              ))}

              {/* Red Now Cursor Marker Pill in Header */}
              {scale.nowPct >= 0 && scale.nowPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-30 pointer-events-none flex flex-col items-center"
                  style={{ left: `${scale.nowPct}%` }}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[9px] font-bold shadow-xs whitespace-nowrap transform -translate-x-1/2">
                    NOW
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline Body Rows */}
          {displayedJobs.length === 0 ? (
            <div className="p-16 text-center text-slate-400 text-xs">
              {loading ? 'Loading timeline dataset...' : 'No jobs found matching the current timeline criteria.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 relative">
              {/* Full-Height Vertical Now Line across all rows */}
              {scale.nowPct >= 0 && scale.nowPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 w-0 border-r-2 border-dashed border-rose-500 z-10 pointer-events-none"
                  style={{ left: `calc(340px + (100% - 340px) * ${scale.nowPct / 100})` }}
                />
              )}

              {displayedJobs.map((job) => {
                const isSelected = job.id === selectedJobId;
                const rawStatus = job.status || 'Draft';
                const isRunning = rawStatus === 'Running' || rawStatus === 'In Progress';
                const isPaused = rawStatus === 'Paused' || rawStatus === 'On Hold';
                const isCompleted = rawStatus === 'Completed';
                const status = isRunning ? 'In Progress' : isPaused ? 'On Hold' : rawStatus;

                // Planned Bar calculations
                const planStartPct = getPct(job.plannedStartAt);
                const planWidthPct = getWidthPct(job.plannedStartAt, job.plannedEndAt);

                // Actual Bar calculations
                const actualStart = job.actualStartAt;
                const actualEnd = job.actualEndAt || (isRunning || isPaused ? new Date(nowMs).toISOString() : null);
                const actStartPct = getPct(actualStart);
                const actWidthPct = getWidthPct(actualStart, actualEnd);

                // Delay detection: if now or actualEnd exceeds plannedEndAt
                const plannedEndMs = job.plannedEndAt ? new Date(job.plannedEndAt).getTime() : null;
                const isDelayed = plannedEndMs && ((actualEnd && new Date(actualEnd).getTime() > plannedEndMs) || (!isCompleted && nowMs > plannedEndMs));

                return (
                  <div
                    key={job.id}
                    onClick={() => onSelectJob && onSelectJob(job)}
                    className={`flex items-stretch hover:bg-slate-50/80 transition-colors cursor-pointer group ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {/* Frozen Left Column */}
                    <div className="w-[340px] shrink-0 p-3 border-r border-slate-200 bg-white group-hover:bg-slate-50/60 flex flex-col justify-between gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                            {job.jobNo || `#${job.id}`}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[140px]" title={job.panelName}>
                            {job.panelName || 'Standard Panel'}
                          </span>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                            isRunning
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : isPaused
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : isCompleted
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : 'bg-slate-50 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                          <span>{status}</span>
                        </span>
                      </div>

                      {/* Worker & Progress Details */}
                      <div className="flex items-center justify-between gap-2 text-xs">
                        {/* Worker Badge */}
                        <div className="flex items-center gap-1.5 text-slate-600 truncate">
                          <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(job.currentWorkerName || 'W').charAt(0).toUpperCase()}
                          </div>
                          <span className="truncate text-[11px] font-medium" title={job.currentWorkerName}>
                            {job.currentWorkerName || 'Unassigned'}
                          </span>
                        </div>

                        {/* Progress Indicator */}
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, job.progressPercentage || 0)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-slate-700">
                            {Math.round(job.progressPercentage || 0)}%
                          </span>
                        </div>
                      </div>

                      {/* Quick Interactive Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                        <span className="text-[10px] text-slate-400">
                          {job.clientName || 'General Client'}
                        </span>
                        <div className="flex items-center gap-1">
                          {onOpenProgress && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenProgress(job);
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors"
                              title="Update Progress"
                            >
                              Progress
                            </button>
                          )}
                          {onOpenHandover && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenHandover(job);
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors"
                              title="Shift Handover"
                            >
                              Handover
                            </button>
                          )}
                          {onOpenHistory && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenHistory(job.id);
                              }}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-colors flex items-center gap-0.5"
                              title="Inspect Full Audit History"
                            >
                              <span>History</span>
                              <ChevronRight size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Timeline Track Container */}
                    <div className="flex-1 relative h-20 bg-slate-50/20 group-hover:bg-slate-50/40 transition-colors overflow-hidden py-1.5">
                      {/* Background Vertical Grid Lines */}
                      {scale.ticks.map((tick, i) => (
                        <div
                          key={i}
                          className="absolute top-0 bottom-0 border-l border-slate-100 pointer-events-none"
                          style={{ left: `${tick.pct}%` }}
                        />
                      ))}

                      {/* TRACK 1: Planned Schedule Bar (Top Lane) */}
                      {planStartPct !== null && planWidthPct > 0 ? (
                        <div
                          className="absolute top-2 h-5 rounded-md bg-sky-100/80 border border-sky-300 text-sky-800 text-[10px] font-semibold px-2 flex items-center truncate shadow-2xs hover:bg-sky-200/90 transition-all z-5 cursor-help"
                          style={{
                            left: `${planStartPct}%`,
                            width: `${planWidthPct}%`,
                            minWidth: '24px'
                          }}
                          onMouseEnter={() =>
                            setHoveredTooltip({
                              title: `Planned Schedule: ${job.jobNo}`,
                              start: formatTime(job.plannedStartAt),
                              end: formatTime(job.plannedEndAt),
                              desc: `Est: ${Math.round((job.estimatedDurationSeconds || 0) / 3600)}h`
                            })
                          }
                          onMouseLeave={() => setHoveredTooltip(null)}
                        >
                          <span className="truncate">
                            📋 Planned: {formatTime(job.plannedStartAt)} → {formatTime(job.plannedEndAt)}
                          </span>
                        </div>
                      ) : (
                        <div className="absolute top-2 left-3 text-[10px] text-slate-300 italic pointer-events-none">
                          No planned window scheduled
                        </div>
                      )}

                      {/* TRACK 2: Actual Execution Bar (Bottom Lane) */}
                      {actStartPct !== null && actWidthPct > 0 ? (
                        <div
                          className={`absolute top-9 h-7 rounded-lg text-white text-[11px] font-bold px-2.5 flex items-center justify-between shadow-xs transition-all z-10 cursor-pointer ${
                            isRunning
                              ? 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 animate-pulse'
                              : isPaused
                              ? 'bg-amber-500 text-amber-950'
                              : isCompleted
                              ? 'bg-indigo-600'
                              : 'bg-slate-400'
                          }`}
                          style={{
                            left: `${actStartPct}%`,
                            width: `${actWidthPct}%`,
                            minWidth: '32px'
                          }}
                          onMouseEnter={() =>
                            setHoveredTooltip({
                              title: `Execution: ${job.jobNo} (${status})`,
                              start: formatTime(job.actualStartAt, true),
                              end: job.actualEndAt ? formatTime(job.actualEndAt, true) : isRunning ? 'Running Live' : 'On Hold',
                              desc: isPaused
                                ? `On Hold: ${job.pauseReasonCategory || job.pause_reason || 'Material unavailable'} ${job.pauseNotes ? `(${job.pauseNotes})` : ''} • Elapsed: ${formatDuration(job.actualDurationSeconds)}`
                                : `Elapsed: ${formatDuration(job.actualDurationSeconds)} • Assigned: ${job.currentWorkerName || 'N/A'}`
                            })
                          }
                          onMouseLeave={() => setHoveredTooltip(null)}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isRunning ? <Play size={11} fill="currentColor" /> : isPaused ? <Pause size={11} /> : <CheckCircle2 size={11} />}
                            <span className="truncate">
                              {job.currentWorkerName || 'Active'} • {formatDuration(job.actualDurationSeconds)}
                            </span>
                          </div>

                          {/* Inner Progress indicator */}
                          <span className="text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-mono">
                            {job.progressPercentage || 0}%
                          </span>
                        </div>
                      ) : (
                        <div className="absolute top-9 left-3 text-[10px] text-slate-400 italic pointer-events-none">
                          Execution not started yet
                        </div>
                      )}

                      {/* Handover Diamond Point Markers along the timeline */}
                      {job.handovers?.map((ho, hIdx) => {
                        const hoPct = getPct(ho.handoverAt);
                        if (hoPct === null || hoPct < 0 || hoPct > 100) return null;
                        return (
                          <div
                            key={hIdx}
                            className="absolute top-8 z-25 -translate-x-1/2 cursor-pointer group/ho"
                            style={{ left: `${hoPct}%` }}
                            onMouseEnter={() =>
                              setHoveredTooltip({
                                title: `Shift Handover: ${ho.fromWorker} ➔ ${ho.toWorker}`,
                                start: formatTime(ho.handoverAt, true),
                                desc: `Reason: ${ho.reason} • Active before: ${formatDuration(ho.activeSecondsBefore)}`
                              })
                            }
                            onMouseLeave={() => setHoveredTooltip(null)}
                          >
                            <div className="w-4 h-4 bg-amber-400 border-2 border-white rounded-xs rotate-45 shadow-sm group-hover/ho:scale-125 transition-transform flex items-center justify-center">
                              <ArrowRightLeft size={8} className="text-amber-950 -rotate-45" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Overdue / Delay Extension Stripe */}
                      {isDelayed && (
                        <div
                          className="absolute top-9 right-2 bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs z-15"
                          title="Execution exceeds planned delivery schedule"
                        >
                          <AlertTriangle size={11} />
                          <span>Delayed</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Floating Hover Tooltip */}
      {hoveredTooltip && (
        <div className="p-3 bg-slate-900 text-white rounded-xl text-xs fixed bottom-6 right-6 shadow-2xl z-50 pointer-events-none border border-slate-700 animate-in fade-in max-w-xs">
          <div className="font-bold text-sm text-blue-300">{hoveredTooltip.title}</div>
          <div className="text-slate-300 mt-1">
            Window: <strong>{hoveredTooltip.start}</strong> {hoveredTooltip.end ? `→ ${hoveredTooltip.end}` : ''}
          </div>
          {hoveredTooltip.desc && (
            <div className="text-slate-400 text-[11px] mt-0.5">
              {hoveredTooltip.desc}
            </div>
          )}
        </div>
      )}

      {/* Footer Legend Bar */}
      <div className="px-5 py-3 border-t border-slate-200/90 bg-slate-50 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">Legend:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-sky-100 border border-sky-300" />
            <span>Planned Window</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-emerald-500" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-amber-400" />
            <span>On Hold</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-2.5 rounded bg-indigo-600" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-400 rotate-45" />
            <span>Shift Handover Point</span>
          </div>
          <div className="flex items-center gap-1.5 text-rose-600 font-semibold">
            <span className="w-3 h-0.5 bg-rose-500 border-t border-dashed border-rose-500" />
            <span>Live Ticking Cursor</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-400">
          Click any row to inspect timeline details • Multi-job real-time Gantt
        </div>
      </div>
    </div>
  );
}
