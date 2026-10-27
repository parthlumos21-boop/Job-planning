import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, User, Play, Pause, CheckCircle2, AlertTriangle,
  ZoomIn, ArrowRightLeft, Calendar, Sparkles, RefreshCw,
  Search, Sliders, ChevronRight, Eye, ShieldCheck, Activity, Layers
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
  }, [jobs, filterWorker, timelineSearch]);

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

  // Calculate dynamic canvas min-width based on zoom mode & tick count to ensure zero text collision
  const canvasMinWidth = useMemo(() => {
    const basePerTick = 110;
    const ticksCount = scale?.ticks?.length || 0;
    const computedFromTicks = ticksCount * basePerTick + 360; // 340px frozen column + margin
    if (zoomMode === 'month') return Math.max(3000, computedFromTicks);
    if (zoomMode === 'week') return Math.max(2400, computedFromTicks);
    if (zoomMode === 'day') return Math.max(2000, computedFromTicks);
    if (zoomMode === 'shift') return Math.max(1800, computedFromTicks);
    return Math.max(1800, computedFromTicks);
  }, [zoomMode, scale.ticks]);

  // Auto-scroll timeline to live red cursor on initial mount or zoom
  useEffect(() => {
    if (scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const scrollTarget = (scale.nowPct / 100) * container.scrollWidth - container.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollTarget), behavior: 'smooth' });
    }
  }, [zoomMode]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex flex-col h-full min-h-[380px]">
      {/* 1. Internal Card Header (Exact Image 1 Match) */}
      <div className="px-4 py-3 border-b border-slate-200/80 bg-white flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-800 tracking-tight">
          Dynamic Live Operational Timeline
        </h3>

        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-blue-600 rounded-[7px] text-xs font-semibold shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh timeline records"
          >
            <RefreshCw size={13} className={`text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        )}
      </div>

      {/* 2. Controls Toolbar (Exact Image 1 Match) */}
      <div className="px-4 py-2.5 border-b border-slate-200/80 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Live Badge (Image 1: Green Pill with Dot) */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-[7px] bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live</span>
          </div>

          {/* Search Input */}
          <div className="relative w-44 sm:w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={timelineSearch}
              onChange={(e) => setTimelineSearch(e.target.value)}
              placeholder="Search job or worker..."
              className="w-full pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-[7px] text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 text-slate-800 placeholder-slate-400 font-medium"
            />
          </div>
        </div>

        {/* Zoom Modes & Calendar Button (Image 1 Right Toolbar) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center bg-white border border-slate-200 p-0.5 rounded-[7px] text-xs font-semibold text-slate-600 shadow-2xs">
            <button
              onClick={() => setZoomMode('shift')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                zoomMode === 'shift'
                  ? 'bg-blue-50 text-blue-600 border border-blue-400 font-bold shadow-2xs'
                  : 'hover:text-slate-900 border border-transparent'
              }`}
              title="8-Hour Shift Window"
            >
              8h Shift
            </button>
            <button
              onClick={() => setZoomMode('day')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                zoomMode === 'day'
                  ? 'bg-blue-50 text-blue-600 border border-blue-400 font-bold shadow-2xs'
                  : 'hover:text-slate-900 border border-transparent'
              }`}
              title="24-Hour Day Window"
            >
              24h Day
            </button>
            <button
              onClick={() => setZoomMode('week')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                zoomMode === 'week'
                  ? 'bg-blue-50 text-blue-600 border border-blue-400 font-bold shadow-2xs'
                  : 'hover:text-slate-900 border border-transparent'
              }`}
              title="7-Day Horizon"
            >
              7 Days
            </button>
            <button
              onClick={() => setZoomMode('month')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                zoomMode === 'month'
                  ? 'bg-blue-50 text-blue-600 border border-blue-400 font-bold shadow-2xs'
                  : 'hover:text-slate-900 border border-transparent'
              }`}
              title="30-Day Monthly View"
            >
              30 Days
            </button>
            <button
              onClick={() => setZoomMode('dynamic')}
              className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                zoomMode === 'dynamic'
                  ? 'bg-blue-50 text-blue-600 border border-blue-400 font-bold shadow-2xs'
                  : 'text-blue-600 hover:text-blue-800 border border-transparent'
              }`}
              title="Auto-Fit All Jobs"
            >
              Auto-Fit
            </button>
          </div>

          {/* Calendar Picker Icon Button */}
          <button
            type="button"
            onClick={() => setZoomMode('dynamic')}
            className="p-1.5 bg-white border border-slate-200 rounded-[7px] text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
            title="Jump to date"
          >
            <Calendar size={14} />
          </button>
        </div>
      </div>

      {/* Timeline Gantt Grid Matrix with Internal Horizontal Scroll */}
      <div className="relative overflow-x-auto flex-1 min-h-[380px] max-h-[580px] scrollbar-thin scrollbar-thumb-slate-300 hover:scrollbar-thumb-slate-400 scrollbar-track-slate-100 pb-1" ref={scrollContainerRef}>
        <div className="w-full flex flex-col" style={{ minWidth: `${canvasMinWidth}px` }}>
          {/* Header Row: Left Columns + Right Time Axis */}
          <div className="flex border-b border-slate-200 bg-slate-100/90 sticky top-0 z-30 shadow-xs">
            {/* Frozen Left Columns Header */}
            <div className="w-[340px] shrink-0 px-4 py-2.5 flex items-center justify-between border-r border-slate-200 bg-slate-100 sticky left-0 z-30 font-bold text-xs text-slate-700 uppercase tracking-wider shadow-xs">
              <span>Job & Assignee Details</span>
              <span className="text-[10px] text-slate-500 font-normal">
                {displayedJobs.length} {displayedJobs.length === 1 ? 'Job' : 'Jobs'}
              </span>
            </div>

            {/* Right Dynamic Time Axis Header (Crisp Time & Date Ticks) */}
            <div className="flex-1 relative h-10 bg-slate-50/80 overflow-visible">
              {scale.ticks.map((tick, i) => (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 border-l border-slate-200/80 flex flex-col justify-center pl-1.5 pointer-events-none min-w-max"
                  style={{ left: `${tick.pct}%` }}
                >
                  <span className="text-[10px] font-bold text-slate-800 leading-tight whitespace-nowrap tabular-nums">
                    {tick.label}
                  </span>
                  <span className="text-[8px] font-semibold text-slate-500 leading-tight mt-0.5 whitespace-nowrap tabular-nums">
                    {tick.dateLabel}
                  </span>
                </div>
              ))}

              {/* Red Now Cursor Marker Pill in Header */}
              {scale.nowPct >= 0 && scale.nowPct <= 100 && (
                <div
                  className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
                  style={{ left: `${scale.nowPct}%` }}
                >
                  <div className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[8px] font-extrabold shadow-2xs whitespace-nowrap transform -translate-x-1/2">
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
                      isSelected ? 'bg-[#0000AA]/5' : ''
                    }`}
                  >
                    {/* Frozen Left Column (Exact Image Match) */}
                    <div className="w-[340px] shrink-0 p-3 border-r border-slate-200 bg-white group-hover:bg-slate-50/90 sticky left-0 z-20 shadow-xs flex items-center justify-between gap-2.5">
                      <div className="flex items-start gap-2 min-w-0">
                        {/* Flow / Department Icon */}
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200/60 mt-0.5 shrink-0">
                          <Layers size={14} />
                        </div>

                        {/* Stacked Details */}
                        <div className="min-w-0 flex-1">
                          {/* Line 1: Job Number & Panel Name */}
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="font-bold text-xs text-blue-600 group-hover:text-blue-800 transition-colors shrink-0">
                              #{job.jobNo || job.id}
                            </span>
                            <span className="text-xs font-semibold text-slate-900 truncate" title={job.panelName}>
                              {job.panelName || 'Standard Panel'}
                            </span>
                          </div>

                          {/* Line 2: Assignee */}
                          <div className="flex items-center gap-1 text-[11px] text-slate-600 font-medium truncate mt-0.5" title={job.currentWorkerName}>
                            <User size={11} className="text-slate-400 shrink-0" />
                            <span className="truncate">{job.currentWorkerName || 'Unassigned'}</span>
                          </div>

                          {/* Line 3: Department / Client */}
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {job.department || job.departmentKey || 'Production'} • {job.clientName || 'General Client'}
                          </div>
                        </div>
                      </div>

                      {/* Status Pill Badge (Right-aligned in left column) */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 inline-flex items-center gap-1 ${
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
                          className="absolute top-1.5 h-[18px] rounded-[4px] bg-sky-100/90 border border-sky-300/80 text-sky-900 text-[9px] font-semibold px-1.5 flex items-center truncate shadow-2xs hover:bg-sky-200 transition-all z-5 cursor-help"
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
                            📋 Plan: {formatTime(job.plannedStartAt)} – {formatTime(job.plannedEndAt)}
                          </span>
                        </div>
                      ) : (
                        <div className="absolute top-1.5 left-3 text-[9px] text-slate-300 italic pointer-events-none">
                          No planned window scheduled
                        </div>
                      )}

                      {/* TRACK 2: Actual Execution Bar (Bottom Lane) */}
                      {actStartPct !== null && actWidthPct > 0 ? (
                        <div
                          className={`absolute top-8 h-7 rounded-[5px] text-white text-[10px] font-bold px-2.5 flex items-center justify-between shadow-2xs transition-all z-10 cursor-pointer ${
                            isRunning
                              ? 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600'
                              : isPaused
                              ? 'bg-amber-500 text-white'
                              : isCompleted
                              ? 'bg-indigo-600'
                              : 'bg-slate-400'
                          }`}
                          style={{
                            left: `${actStartPct}%`,
                            width: `${actWidthPct}%`,
                            minWidth: '36px'
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
                            {isRunning ? <Play size={10} fill="currentColor" /> : isPaused ? <Pause size={10} /> : <CheckCircle2 size={10} />}
                            <span className="truncate">
                              {job.currentWorkerName || 'Active'} - {formatDuration(job.actualDurationSeconds)}
                            </span>
                          </div>

                          {/* Quick View Icon matching Image */}
                          <Eye size={12} className="opacity-80 shrink-0 ml-1.5" />
                        </div>
                      ) : (
                        <div className="absolute top-8 left-3 text-[9px] text-slate-400 italic pointer-events-none">
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

      {/* Footer Legend Bar (Exact Image Match) */}
      <div className="px-5 py-2.5 border-t border-slate-200/90 bg-slate-50 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">LEGEND:</span>
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
            <span className="w-3 border-b-2 border-dashed border-rose-500" />
            <span>Live Ticking Cursor</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-medium">
          Click any row to inspect timeline details - Multi-job real-time Chart
        </div>
      </div>
    </div>
  );
}
