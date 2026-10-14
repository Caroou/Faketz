import { state } from '../state.js';

let statsInterval = null;
const prevStats = new Map(); // key -> { timestamp, frames, bytes, dropped }
const LOGGING_STORAGE_KEY = 'faketz_detailed_stats_logging';
let detailedLoggingEnabled = false;

function setDetailedLogging(enabled, button) {
  detailedLoggingEnabled = enabled;
  try {
    localStorage.setItem(LOGGING_STORAGE_KEY, String(enabled));
  } catch {
    // Logging can still be toggled for this page if storage is unavailable.
  }

  if (button) {
    button.textContent = enabled ? 'Logs: ligados' : 'Logs: desligados';
    button.title = `Logs técnicos: ${enabled ? 'ligados' : 'desligados'}`;
    button.setAttribute('aria-pressed', String(enabled));
    button.classList.toggle('text-white', enabled);
    button.classList.toggle('bg-white/10', enabled);
    button.classList.toggle('text-zinc-400', !enabled);
  }
}

function initDetailedLoggingToggle() {
  const button = document.getElementById('toggle-stats-logs-btn');
  if (!button) return;

  let enabled = false;
  try {
    enabled = localStorage.getItem(LOGGING_STORAGE_KEY) === 'true';
  } catch {
    // Leave detailed logging disabled when storage is unavailable.
  }
  setDetailedLogging(enabled, button);
  button.addEventListener('click', () => setDetailedLogging(!detailedLoggingEnabled, button));
}

function getCodecName(stats, codecId) {
  const codecReport = codecId ? stats.get(codecId) : null;
  return codecReport?.mimeType?.split('/')[1]?.toUpperCase() || '—';
}

export function initStreamStats() {
  if (statsInterval) return;
  initDetailedLoggingToggle();

  statsInterval = setInterval(async () => {
    if (!state.roomId) return;

    for (const userId in state.peers) {
      const peer = state.peers[userId];
      if (!peer || !peer.pc) continue;

      const connState = peer.pc.connectionState;
      const iceState = peer.pc.iceConnectionState;
      if (connState !== 'connected' && iceState !== 'connected' && iceState !== 'completed') {
        continue;
      }

      try {
        const stats = await peer.pc.getStats();

        stats.forEach((report) => {
          // Outbound stats (streamer side)
          if (report.type === 'outbound-rtp' && report.kind === 'video' && !report.isRemote && (report.framesSent > 0 || report.frameWidth > 0 || report.framesEncoded > 0)) {
            const codec = getCodecName(stats, report.codecId);
            const key = `out-${userId}`;
            const currentFrames = report.framesSent || 0;
            const currentEncodedFrames = report.framesEncoded ?? null;
            const currentCapturedFrames = report.framesCaptured ?? null;
            const currentBytes = report.bytesSent || 0;
            const prev = prevStats.get(key);

            if (!prev) {
              prevStats.set(key, {
                timestamp: report.timestamp,
                frames: currentFrames,
                encodedFrames: currentEncodedFrames,
                capturedFrames: currentCapturedFrames,
                bytes: currentBytes
              });
              const fps = report.framesPerSecond ? Math.round(report.framesPerSecond) : 0;
              const width = report.frameWidth || (state.screenStream?.getVideoTracks()[0]?.getSettings().width) || 0;
              const height = report.frameHeight || (state.screenStream?.getVideoTracks()[0]?.getSettings().height) || 0;
              updateStatsBadge('local-screen', fps, '0.0', width, height, codec);
              return;
            }

            const dt = (report.timestamp - prev.timestamp) / 1000;
            if (dt >= 0.7) {
              const dFrames = currentFrames - prev.frames;
              const encodedFps = getDeltaFps(currentEncodedFrames, prev.encodedFrames, dt);
              const capturedFps = getDeltaFps(currentCapturedFrames, prev.capturedFrames, dt);
              const dBytes = currentBytes - prev.bytes;
              const calculatedFps = Math.max(0, Math.round(dFrames / dt));
              const fps = calculatedFps > 0 ? calculatedFps : (report.framesPerSecond ? Math.round(report.framesPerSecond) : 0);
              const bitrateMbps = Math.max(0, (dBytes * 8) / (dt * 1000000)).toFixed(1);
              const width = report.frameWidth || (state.screenStream?.getVideoTracks()[0]?.getSettings().width) || 0;
              const height = report.frameHeight || (state.screenStream?.getVideoTracks()[0]?.getSettings().height) || 0;
              const limitation = report.qualityLimitationReason || 'none';
              const trackFps = state.screenStream?.getVideoTracks()[0]?.getSettings()?.frameRate;
              const capStr = trackFps ? Math.round(trackFps) : '';

              if (detailedLoggingEnabled) {
                const capturedText = capturedFps === null ? 'n/a' : capturedFps;
                const encodedText = encodedFps === null ? 'n/a' : encodedFps;
                console.log(`[Screen Stats Out] FPS:${fps} (calc:${calculatedFps}, rtc:${report.framesPerSecond}) Capt:${capturedText} Enc:${encodedText} Sent:${calculatedFps} ${width}x${height} ${bitrateMbps}Mb/s ${codec} Lim:${limitation} Cap:${capStr}`);
              }

              prevStats.set(key, {
                timestamp: report.timestamp,
                frames: currentFrames,
                encodedFrames: currentEncodedFrames,
                capturedFrames: currentCapturedFrames,
                bytes: currentBytes
              });

              updateStatsBadge('local-screen', fps, bitrateMbps, width, height, codec, limitation, capStr);
            }
          }

          // Inbound stats (viewer side)
          if (report.type === 'inbound-rtp' && report.kind === 'video' && !report.isRemote && (report.framesDecoded > 0 || report.frameWidth > 0 || report.framesReceived > 0)) {
            const codec = getCodecName(stats, report.codecId);
            const key = `in-${userId}`;
            const currentFrames = report.framesDecoded ?? report.framesReceived ?? 0;
            const currentBytes = report.bytesReceived || 0;
            const currentDropped = report.framesDropped || 0;
            const prev = prevStats.get(key);

            if (!prev) {
              prevStats.set(key, {
                timestamp: report.timestamp,
                frames: currentFrames,
                bytes: currentBytes,
                dropped: currentDropped
              });
              const fps = report.framesPerSecond ? Math.round(report.framesPerSecond) : 0;
              updateStatsBadge(`${userId}-screen`, fps, '0.0', report.frameWidth || 0, report.frameHeight || 0, codec);
              return;
            }

            const dt = (report.timestamp - prev.timestamp) / 1000;
            if (dt >= 0.7) {
              const dFrames = currentFrames - prev.frames;
              const dBytes = currentBytes - prev.bytes;
              const dropped = Math.max(0, currentDropped - (prev.dropped || 0));
              const calculatedFps = Math.max(0, Math.round(dFrames / dt));
              const fps = calculatedFps > 0 ? calculatedFps : (report.framesPerSecond ? Math.round(report.framesPerSecond) : 0);
              const bitrateMbps = Math.max(0, (dBytes * 8) / (dt * 1000000)).toFixed(1);
              const width = report.frameWidth || 0;
              const height = report.frameHeight || 0;
              if (detailedLoggingEnabled) {
                console.log(`[Screen Stats In] FPS:${fps} (calc:${calculatedFps}, rtc:${report.framesPerSecond}) ${width}x${height} ${bitrateMbps}Mb/s ${codec} Dropped:${dropped}`);
              }

              prevStats.set(key, {
                timestamp: report.timestamp,
                frames: currentFrames,
                bytes: currentBytes,
                dropped: currentDropped
              });

              updateStatsBadge(`${userId}-screen`, fps, bitrateMbps, width, height, codec, 'none', '', dropped);
            }
          }
        });
      } catch (err) {
        // Ignore stats errors during peer renegotiation
      }
    }
  }, 1000);
}

function getDeltaFps(current, previous, seconds) {
  if (current === null || previous === null || current === undefined || previous === null || previous === undefined) return null;
  return Math.max(0, Math.round((current - previous) / seconds));
}

function updateStatsBadge(mediaId, fps, bitrateMbps, width, height, codec, limitation = '', capStr = '', dropped = null) {
  const container = document.getElementById(`media-${mediaId}`);
  if (!container) return;

  let badge = document.getElementById(`stats-badge-${mediaId}`);
  if (!badge) {
    badge = document.createElement('div');
    badge.id = `stats-badge-${mediaId}`;
    badge.className =
      'stats-badge absolute top-3 left-3 bg-black/85 backdrop-blur-md font-mono text-[11px] px-2.5 py-1 rounded-lg z-30 shadow-lg border border-white/15 flex items-center gap-2 pointer-events-none select-none';
    container.appendChild(badge);
  }

  const fpsColor = fps >= 55 ? 'text-emerald-400' : fps >= 30 ? 'text-amber-400' : 'text-rose-400';
  const dotColor = fps >= 55 ? 'bg-emerald-400 animate-pulse' : fps >= 30 ? 'bg-amber-400' : 'bg-rose-400';
  const resStr = width && height ? `${height || width}p` : '';

  badge.innerHTML = `
    <span class="inline-block w-1.5 h-1.5 rounded-full ${dotColor}"></span>
    <span class="font-bold ${fpsColor}">${fps} FPS</span>
    ${bitrateMbps > 0 ? `<span class="text-zinc-500">|</span> <span class="text-zinc-200">${bitrateMbps} Mb/s</span>` : ''}
    ${resStr ? `<span class="text-zinc-500">|</span> <span class="text-zinc-300">${resStr}</span>` : ''}
    <span class="text-zinc-400 uppercase font-semibold text-[10px]">${codec}</span>
    ${capStr ? `<span class="text-zinc-500">|</span> <span class="text-cyan-400 text-[10px]">Cap:${capStr}</span>` : ''}
    ${limitation && limitation !== 'none' ? `<span class="text-zinc-500">|</span> <span class="text-rose-400 text-[10px]">Lim:${limitation}</span>` : ''}
    ${dropped !== null ? `<span class="text-zinc-500">|</span> <span class="${dropped > 0 ? 'text-rose-400' : 'text-emerald-400'} text-[10px]">Drop:${dropped}</span>` : ''}
  `;
}
