import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock, User, Briefcase, Flag, PauseCircle, PlayCircle,
  CheckCircle2, AlertCircle, ChevronDown, RefreshCw, ZoomIn, Eye
} from 'lucide-react';

/**
 * Format total seconds into HH:MM:SS
 */
function formatDuration(sec) {
  if (sec === null || sec === undefined || isNaN(sec) || sec < 0) return '00:00:00';
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Format timestamp into readable time: "10:30 AM" or "10:30:15 AM"
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

/**
 * Live Operational Timeline Chart Component
 * High-performance, lightweight (<15KB), dynamic time axis, live moving cursor, worker name & position tracking.
 */
export default function LiveTimelineChart({
  job,
  timelineData,
  loading = false,
  onRefresh,
  availableJobs = [],
  onSelectJob
}) {
  const [zoomMode, setZoomMode] = useState('dynamic'); // 'dynamic' | 'shift' | 'day'
  const [nowMs, setNowMs] = useState(Date.now());
  const [hoveredSession, setHoveredSession] = useState(null);
  const [hoveredHandover, setHoveredHandover] = useState(null);

  // 1-second interval ticker for live smooth timeline advancement
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute dynamic scale boundaries
  const scale = useMemo(() => {
    const fallbackStart = nowMs - 4 * 3600 * 1000;
    const fallbackEnd = nowMs + 4 * 3600 * 1000;

    if (!job && !timelineData) {
      return { startMs: fallbackStart, endMs: fallbackEnd, spanMs: fallbackEnd - fallbackStart };
    }

    const timestamps = [nowMs];

    if (timelineData?.scaleStart) timestamps.push(new Date(timelineData.scaleStart).getTime());
    if (timelineData?.scaleEnd) timestamps.push(new Date(timelineData.scaleEnd).getTime());
    if (job?.plannedStartAt) timestamps.push(new Date(job.plannedStartAt).getTime());
    if (job?.plannedEndAt) timestamps.push(new Date(job.plannedEndAt).getTime());
    if (job?.actualStartAt) timestamps.push(new Date(job.actualStartAt).getTime());
    if (job?.actualEndAt) timestamps.push(new Date(job.actualEndAt).getTime());

    // Sessions boundaries
    if (timelineData?.sessions?.length) {
      timelineData.sessions.forEach(s => {
        if (s.startedAt) timestamps.push(new Date(s.startedAt).getTime());
        if (s.endedAt) timestamps.push(new Date(s.endedAt).getTime());
      });
    }

    const validTs = timestamps.filter(t => !isNaN(t));
    let minTs = Math.min(...validTs);
    let maxTs = Math.max(...validTs);

    // Dynamic zoom adjustment
    if (zoomMode === 'shift') {
      // 8-hour shift window centered or bounded by now
      minTs = nowMs - 4 * 3600 * 1000;
      maxTs = nowMs + 4 * 3600 * 1000;
    } else if (zoomMode === 'day') {
      // 24-hour window
      minTs = nowMs - 12 * 3600 * 1000;
      maxTs = nowMs + 12 * 3600 * 1000;
    } else {
      // Dynamic: ensure minimum 4 hours span and add 5% padding
      const rawSpan = Math.max(4 * 3600 * 1000, maxTs - minTs);
      const pad = rawSpan * 0.05;
      minTs = minTs - pad;
      maxTs = maxTs + pad;
    }

    const spanMs = Math.max(1, maxTs - minTs);
    return { startMs: minTs, endMs: maxTs, spanMs };
  }, [job, timelineData, nowMs, zoomMode]);

  // Convert a timestamp to a percentage along the timeline (0 to 100)
  const getPercent = (timeVal) => {
    if (!timeVal) return 0;
    const t = typeof timeVal === 'number' ? timeVal : new Date(timeVal).getTime();
    if (isNaN(t)) return 0;
    const pct = ((t - scale.startMs) / scale.spanMs) * 100;
    return Math.max(0, Math.min(100, pct));
  };

  // Generate dynamic time tick markers
  const ticks = useMemo(() => {
    const list = [];
    const spanHours = scale.spanMs / (3600 * 1000);
    // Interval: 1h if <= 8h, 2h if <= 16h, 3h if > 16h
    const stepHours = spanHours <= 8 ? 1 : spanHours <= 16 ? 2 : 3;
    const stepMs = stepHours * 3600 * 1000;

    // First rounded tick
    const firstTickMs = Math.ceil(scale.startMs / stepMs) * stepMs;
    for (let t = firstTickMs; t <= scale.endMs; t += stepMs) {
      list.push({
        timeMs: t,
        label: formatTime(new Date(t)),
        pct: getPercent(t)
      });
    }
    return list;
  }, [scale]);

  // Active Job details
  const activeJobNo = timelineData?.jobNo || job?.jobNo || (job?.id ? `#${job.id}` : 'Select a Job');
  const panelName = timelineData?.panelName || job?.panelName || 'Operational Timeline';
  const currentWorker = timelineData?.currentWorkerName || job?.currentWorkerName || job?.assignedEngineer || 'Unassigned';
  const workerPosition = timelineData?.currentWorkerPosition || job?.currentWorkerPosition || 'Operations Lead';
  const status = timelineData?.status || job?.status || 'Scheduled';
  const isRunning = status === 'Running';
  const isPaused = status === 'Paused';

  // Planned Bar Position
  const plannedStart = timelineData?.planned?.startAt || job?.plannedStartAt;
  const plannedEnd = timelineData?.planned?.endAt || job?.plannedEndAt;
  const plannedStartPct = plannedStart ? getPercent(plannedStart) : 5;
  const plannedEndPct = plannedEnd ? getPercent(plannedEnd) : (plannedStartPct + 40);
  const plannedWidthPct = Math.max(3, plannedEndPct - plannedStartPct);

  // Live cursor position
  const nowPct = getPercent(nowMs);

  // Sessions calculation
  const sessions = useMemo(() => {
    if (timelineData?.sessions?.length) {
      return timelineData.sessions;
    }
    // Fallback synthesize from job props if sessions API hasn't loaded
    if (job?.actualStartAt) {
      return [
        {
          id: 'curr',
          sessionType: isPaused ? 'pause' : 'work',
          startedAt: job.actualStartAt,
          endedAt: isRunning ? null : (job.pauseStartedAt || job.actualEndAt),
          durationSeconds: job.elapsedSeconds || 0,
          performedBy: currentWorker,
          workerPosition: workerPosition,
          pauseReason: job.pauseReason || 'Break'
        }
      ];
    }
    return [];
  }, [timelineData, job, isPaused, isRunning, currentWorker, workerPosition]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all">
      {/* Top Header Bar */}
      <div className="bg-slate-900 px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Clock size={20} className="animate-spin-slow" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white tracking-wide">
                  Live Operational Timeline Chart
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  isRunning
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-pulse'
                    : isPaused
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'bg-emerald-400' : isPaused ? 'bg-amber-400' : 'bg-slate-400'}`} />
                  {status.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Dynamic continuous sliding scale with live cursor & worker accountability
              </p>
            </div>
          </div>

          {/* Job Selector Dropdown */}
          {availableJobs.length > 0 && onSelectJob && (
            <div className="relative ml-2">
              <select
                value={job?.id || ''}
                onChange={(e) => {
                  const selectedId = Number(e.target.value);
                  const found = availableJobs.find(j => j.id === selectedId);
                  if (found) onSelectJob(found);
                }}
                className="bg-slate-800 hover:bg-slate-750 text-white text-xs font-medium py-1.5 px-3 pr-8 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 cursor-pointer appearance-none"
              >
                {availableJobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.jobNo} — {j.panelName || 'Panel'} ({j.status})
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* Zoom Controls & Server Time */}
        <div className="flex items-center gap-3">
          {/* Zoom Toggle */}
          <div className="flex items-center bg-slate-800 p-1 rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => setZoomMode('dynamic')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                zoomMode === 'dynamic' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Dynamic Scale
            </button>
            <button
              onClick={() => setZoomMode('shift')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                zoomMode === 'shift' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              8h Shift
            </button>
            <button
              onClick={() => setZoomMode('day')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                zoomMode === 'day' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Full Day
            </button>
          </div>

          {/* Sync Button */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
              title="Refresh timeline data"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          )}

          {/* Live Clock Badge */}
          <div className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-xs font-mono text-emerald-400 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>{formatTime(new Date(nowMs), true)}</span>
          </div>
        </div>
      </div>

      {/* Main Chart Body */}
      <div className="p-6 space-y-6">
        {/* Active Worker Context Banner */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
              <User size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Current Worker
              </span>
              <span className="text-sm font-bold text-slate-900 block truncate">
                {currentWorker}
              </span>
              <span className="text-xs text-blue-600 font-medium block truncate">
                {workerPosition}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <Briefcase size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Active Job No
              </span>
              <span className="text-sm font-bold text-slate-900 block truncate">
                {activeJobNo}
              </span>
              <span className="text-xs text-slate-500 block truncate">
                {panelName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Active Elapsed Time
              </span>
              <span className="text-sm font-bold text-emerald-700 font-mono block">
                {formatDuration(job?.elapsedSeconds || 0)}
              </span>
              <span className="text-xs text-slate-500 block">
                Planned: {((job?.estimatedDurationSeconds || 28800) / 3600).toFixed(1)} hrs
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
              <Flag size={20} />
            </div>
            <div>
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Next Handover
              </span>
              <span className="text-sm font-bold text-slate-900 block truncate">
                {job?.nextWorkerName || 'Not Scheduled'}
              </span>
              <span className="text-xs text-slate-500 block">
                Prev: {job?.previousWorkerName || 'None'}
              </span>
            </div>
          </div>
        </div>

        {/* SVG Continuous Timeline Container */}
        <div className="relative pt-6 pb-2 select-none">
          {/* Dynamic Time Scale Axis (Top Axis Labels) */}
          <div className="relative h-6 mb-2 border-b border-slate-200">
            {ticks.map((t, idx) => (
              <div
                key={idx}
                className="absolute transform -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${t.pct}%` }}
              >
                <span className="text-[11px] font-medium text-slate-500 font-mono">
                  {t.label}
                </span>
                <span className="h-2 w-px bg-slate-300 mt-0.5" />
              </div>
            ))}
          </div>

          {/* Timeline Visual Canvas */}
          <div className="relative h-44 bg-slate-50/70 rounded-xl border border-slate-200 p-4 overflow-hidden">
            {/* Background Grid Lines corresponding to ticks */}
            {ticks.map((t, idx) => (
              <div
                key={idx}
                className="absolute top-0 bottom-0 w-px border-l border-dashed border-slate-200"
                style={{ left: `${t.pct}%` }}
              />
            ))}

            {/* TRACK 1: Planned Window Bar */}
            <div className="absolute top-4 left-4 right-4 h-9">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1">
                <span>PLANNED SCHEDULED WINDOW</span>
                <span>Estimate: {((job?.estimatedDurationSeconds || 28800) / 3600).toFixed(1)} hrs</span>
              </div>
              <div className="relative h-4 bg-slate-200/80 rounded-md overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 bg-blue-200/80 border border-blue-400 rounded-md transition-all duration-300"
                  style={{
                    left: `${plannedStartPct}%`,
                    width: `${plannedWidthPct}%`
                  }}
                  title={`Planned Window: ${formatTime(plannedStart)} - ${formatTime(plannedEnd)}`}
                >
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-blue-800 tracking-wider">
                    BUDGETED WINDOW
                  </span>
                </div>
              </div>
            </div>

            {/* TRACK 2: Actual Execution & Pauses */}
            <div className="absolute top-20 left-4 right-4 h-12">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 mb-1">
                <span>ACTUAL EXECUTION SESSIONS & STAGES</span>
                <span className="text-emerald-700 font-mono font-bold">
                  Active: {formatDuration(job?.elapsedSeconds || 0)}
                </span>
              </div>

              <div className="relative h-6 bg-slate-200/60 rounded-lg overflow-hidden border border-slate-300/80">
                {/* Render Session Blocks */}
                {sessions.map((sess, idx) => {
                  const sStart = sess.startedAt ? getPercent(sess.startedAt) : 10;
                  const sEnd = sess.endedAt ? getPercent(sess.endedAt) : (isRunning ? nowPct : sStart + 20);
                  const sWidth = Math.max(1.5, sEnd - sStart);
                  const isPauseSession = sess.sessionType === 'pause';

                  return (
                    <div
                      key={sess.id || idx}
                      onMouseEnter={() => setHoveredSession(sess)}
                      onMouseLeave={() => setHoveredSession(null)}
                      className={`absolute top-0 bottom-0 cursor-pointer transition-all ${
                        isPauseSession
                          ? 'bg-amber-300/90 border-r border-l border-amber-500'
                          : 'bg-emerald-500 hover:bg-emerald-400 border-r border-emerald-600'
                      }`}
                      style={{
                        left: `${sStart}%`,
                        width: `${sWidth}%`
                      }}
                    >
                      {/* Active pulsing animation if running */}
                      {!sess.endedAt && isRunning && (
                        <div className="absolute inset-0 bg-white/20 animate-pulse" />
                      )}

                      {/* Micro-label */}
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white px-1 truncate">
                        {isPauseSession ? (sess.pauseReason || 'Pause') : (sess.performedBy || 'Active')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TRACK 3: Handover Markers Trail */}
            {timelineData?.handovers?.map((h, idx) => {
              const hPct = getPercent(h.handoverAt);
              return (
                <div
                  key={h.id || idx}
                  onMouseEnter={() => setHoveredHandover(h)}
                  onMouseLeave={() => setHoveredHandover(null)}
                  className="absolute bottom-1 transform -translate-x-1/2 flex flex-col items-center cursor-pointer group"
                  style={{ left: `${hPct}%` }}
                >
                  <div className="p-1 rounded-full bg-indigo-600 text-white shadow-md hover:scale-125 transition-transform">
                    <Flag size={12} />
                  </div>
                  <span className="text-[9px] font-bold text-indigo-700 bg-indigo-50 px-1 rounded mt-0.5 border border-indigo-200">
                    Handover
                  </span>
                </div>
              );
            })}

            {/* LIVE MOVING CURSOR (Now Beacon) */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none transition-all duration-1000 z-20"
              style={{ left: `${nowPct}%` }}
            >
              {/* Glowing vertical line */}
              <div className="h-full w-0.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)] mx-auto" />

              {/* Top Cursor Flag */}
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 border border-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
                <span>NOW: {formatTime(new Date(nowMs), true)}</span>
              </div>

              {/* Bottom Radar Indicator */}
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                <div className="h-3 w-3 rounded-full bg-emerald-500/30 border border-emerald-500 animate-ping absolute -inset-0.5" />
                <div className="h-2 w-2 rounded-full bg-emerald-600 border border-white" />
              </div>
            </div>

            {/* Hover Tooltip for Sessions */}
            {hoveredSession && (
              <div className="absolute bottom-2 left-6 bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs z-30 pointer-events-none max-w-sm">
                <div className="font-bold flex items-center gap-1.5 text-emerald-400">
                  {hoveredSession.sessionType === 'pause' ? <PauseCircle size={14} className="text-amber-400" /> : <PlayCircle size={14} />}
                  <span>{hoveredSession.sessionType === 'pause' ? `PAUSE: ${hoveredSession.pauseReason || 'Break'}` : 'EXECUTION SESSION'}</span>
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <p>Worker: <span className="font-semibold text-white">{hoveredSession.performedBy || currentWorker}</span></p>
                  <p>Position: <span className="text-slate-400">{hoveredSession.workerPosition || workerPosition}</span></p>
                  <p>Time: <span className="font-mono text-slate-300">{formatTime(hoveredSession.startedAt)} ➔ {hoveredSession.endedAt ? formatTime(hoveredSession.endedAt) : 'In Progress'}</span></p>
                  <p>Duration: <span className="font-mono text-emerald-400">{formatDuration(hoveredSession.durationSeconds)}</span></p>
                  {hoveredSession.notes && <p className="italic text-slate-400">"{hoveredSession.notes}"</p>}
                </div>
              </div>
            )}

            {/* Hover Tooltip for Handover */}
            {hoveredHandover && (
              <div className="absolute bottom-2 right-6 bg-slate-900 text-white p-3 rounded-xl shadow-xl border border-slate-700 text-xs z-30 pointer-events-none max-w-sm">
                <div className="font-bold flex items-center gap-1.5 text-indigo-400">
                  <Flag size={14} />
                  <span>HANDOVER EVENT</span>
                </div>
                <div className="text-slate-300 mt-1 space-y-0.5">
                  <p>From: <span className="font-semibold text-white">{hoveredHandover.fromWorker}</span> ({hoveredHandover.fromPosition || 'Staff'})</p>
                  <p>To: <span className="font-semibold text-white">{hoveredHandover.toWorker}</span> ({hoveredHandover.toPosition || 'Staff'})</p>
                  <p>Reason: <span className="text-amber-300">{hoveredHandover.reason}</span></p>
                  <p>Handover At: <span className="font-mono text-slate-300">{formatTime(hoveredHandover.handoverAt, true)}</span></p>
                  {hoveredHandover.notes && <p className="italic text-slate-400">"{hoveredHandover.notes}"</p>}
                </div>
              </div>
            )}
          </div>

          {/* Legend and Guide */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-3 px-2 text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded bg-blue-200 border border-blue-400" />
                <span>Planned Budget</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded bg-emerald-500" />
                <span>Active Work</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-5 rounded bg-amber-300 border border-amber-500" />
                <span>Pause Period</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[8px] font-bold">🚩</span>
                <span>Handover Marker</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-1 bg-emerald-500" />
                <span>Live Time Cursor ($t_{"{now}"}$)</span>
              </span>
            </div>

            <div className="font-medium text-slate-400">
              Hover over bars & markers for full worker attribution details
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
