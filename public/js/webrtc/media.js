import { state } from '../state.js';
import { getProfile, getScreenConstraints } from '../config.js';
import { showToast } from '../ui/toast.js';
import { addRemoteMedia } from '../ui/mediaRenderer.js';
import { configureFastCodecs } from './peer.js';

export async function initMedia() {
  const globalMutedCheckbox = document.getElementById('global-muted-checkbox');

  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ 
      video: false, 
      audio: {
        echoCancellation: true,      // Keep echo cancellation to prevent feedback loops
        noiseSuppression: state.noiseSuppression,
        autoGainControl: true        // Enable auto gain so the mic volume is normalized
      } 
    });

    updateNoiseSuppressionUI();

    if (globalMutedCheckbox && globalMutedCheckbox.checked) {
      const audioTrack = state.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        state.isMicMuted = true;
        updateMicButtonUI();
      }
    }
    return false; // Joined with working microphone
  } catch (err) {
    console.warn('Microfone não encontrado ou bloqueado. Entrando como espectador.', err);
    state.localStream = null;
    state.isMicMuted = true;
    updateMicButtonUI();
    showToast('Acesso negado ao microfone. Você entrou no Modo Espectador.', 'error');
    return true; // Spectator mode
  }
}

export function updateMicButtonUI() {
  const micToggleBtn = document.getElementById('mic-toggle-btn');
  if (!micToggleBtn) return;

  if (state.isMicMuted) {
    micToggleBtn.classList.remove('bg-faketz-secondary', 'hover:bg-zinc-700', 'text-white');
    micToggleBtn.classList.add('bg-faketz-red', 'hover:bg-red-600', 'text-white');
    micToggleBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path><line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line></svg>';
  } else {
    micToggleBtn.classList.add('bg-faketz-secondary', 'hover:bg-zinc-700', 'text-white');
    micToggleBtn.classList.remove('bg-faketz-red', 'hover:bg-red-600', 'text-white');
    micToggleBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"></path></svg>';
  }
}

export function toggleMic() {
  if (state.localStream) {
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
      state.isMicMuted = !state.isMicMuted;
      audioTrack.enabled = !state.isMicMuted;
      updateMicButtonUI();

      if (state.socket) {
        state.socket.emit('mute-status', state.isMicMuted);
      }

      const localInd = document.getElementById('mute-indicator-local-mic');
      if (localInd) localInd.style.display = state.isMicMuted ? 'flex' : 'none';
    }
  } else {
    showToast('Nenhum microfone detectado. Você está no Modo Espectador.', 'error');
  }
}

export async function toggleNoiseSuppression() {
  if (!state.localStream) return;
  
  state.noiseSuppression = !state.noiseSuppression;
  updateNoiseSuppressionUI();

  try {
    const oldAudioTrack = state.localStream.getAudioTracks()[0];
    
    // In Chrome, we MUST stop the track before requesting a new one, otherwise it ignores the new constraints
    if (oldAudioTrack) {
      oldAudioTrack.stop();
    }
    
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: state.noiseSuppression,
        autoGainControl: true // Always keep gain control on so they don't sound quiet
      }
    });

    const newAudioTrack = newStream.getAudioTracks()[0];
    newAudioTrack.enabled = !state.isMicMuted;

    // Swap the track in all active peer connections
    for (const userId in state.peers) {
      const { pc } = state.peers[userId];
      // Find the audio sender that belongs to the microphone (we check kind and assume it's the first or non-screen)
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio' && !s.track.label.includes('screen') && !s.track.label.includes('system'));
      if (sender) {
        sender.replaceTrack(newAudioTrack).catch(e => console.error('Erro ao substituir track de áudio:', e));
      }
    }

    // Update local stream
    if (oldAudioTrack) {
      state.localStream.removeTrack(oldAudioTrack);
    }
    state.localStream.addTrack(newAudioTrack);
  } catch (err) {
    console.error('Falha ao reiniciar o microfone com novos filtros:', err);
    // Revert visually if failed
    state.noiseSuppression = !state.noiseSuppression;
    updateNoiseSuppressionUI();
  }
}

export function updateNoiseSuppressionUI() {
  const btn = document.getElementById('noise-suppression-btn');
  const badge = document.getElementById('noise-badge');
  if (!btn || !badge) return;

  if (state.noiseSuppression) {
    btn.classList.add('text-white');
    btn.classList.remove('text-zinc-400');
    btn.title = "Supressão de Ruído (Ligado)";
    badge.classList.remove('bg-faketz-red');
    badge.classList.add('bg-faketz-green');
  } else {
    btn.classList.remove('text-white');
    btn.classList.add('text-zinc-400');
    btn.title = "Supressão de Ruído (Desligado)";
    badge.classList.add('bg-faketz-red');
    badge.classList.remove('bg-faketz-green');
  }
}

export async function toggleScreenShare() {
  if (!state.screenStream) {
    await startScreenSharing();
  } else {
    stopScreenSharing();
  }
}

export async function startScreenSharing() {
  const screenShareBtn = document.getElementById('screen-share-btn');
  const profile = getProfile(state.selectedQuality);

  try {
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(
        getScreenConstraints(state.selectedQuality)
      );
    } catch (mediaErr) {
      if (mediaErr.name === 'NotAllowedError' || mediaErr.name === 'AbortError') {
        throw mediaErr;
      }
      console.warn('Falha na captura padrão, tentando fallback básico de vídeo:', mediaErr);
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 60, max: 60 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: false,
          suppressLocalAudioPlayback: true
        }
      });
    }

    state.screenStream = stream;

    if (screenShareBtn) {
      screenShareBtn.classList.remove('text-zinc-300', 'hover:bg-zinc-600');
      screenShareBtn.classList.add('text-white', 'bg-faketz-green', 'hover:bg-green-600');
      screenShareBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        Parar Transmissão
      `;
    }

    const screenVideoTrack = state.screenStream.getVideoTracks()[0];
    const screenAudioTrack = state.screenStream.getAudioTracks()[0];

    if (screenVideoTrack) {
      screenVideoTrack.contentHint = 'motion';
      try {
        await screenVideoTrack.applyConstraints({
          frameRate: { ideal: profile.frameRate, max: profile.frameRate }
        });
      } catch (e) {
        console.warn('applyConstraints frameRate warn:', e);
      }
    }

    for (const userId in state.peers) {
      const { pc } = state.peers[userId];

      if (screenVideoTrack) {
        try {
          const sender = pc.addTrack(screenVideoTrack, state.screenStream);

          // Configure targeted profile bitrate
          try {
            const params = sender.getParameters();
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}];
            }
            params.encodings[0].maxBitrate = 8000000;
            params.encodings[0].maxFramerate = 60;
            params.degradationPreference = 'maintain-framerate';
            sender.setParameters(params).catch(e => console.warn(e));
          } catch (e) {
            console.warn('Falha ao configurar bitrate para a transmissão', e);
          }

          // Prioritize modern multi-core GPU gaming codecs (VP9, AV1, VP8)
          try {
            const transceivers = pc.getTransceivers();
            const videoTransceiver = transceivers.find(t => t.sender === sender);
            if (videoTransceiver) {
              configureFastCodecs(videoTransceiver);
            }
          } catch (e) {
            console.warn('Falha ao configurar preferências de codecs de alta velocidade', e);
          }
        } catch (trackErr) {
          console.warn('Erro ao adicionar vídeo para peer:', userId, trackErr);
        }
      }

      if (screenAudioTrack) {
        try {
          pc.addTrack(screenAudioTrack, state.screenStream);
        } catch (audioErr) {
          console.warn('Erro ao adicionar áudio de tela para peer:', userId, audioErr);
        }
      }
    }

    if (screenVideoTrack) {
      screenVideoTrack.onended = () => stopScreenSharing();
    }

    const localPreviewStream = new MediaStream();
    if (screenVideoTrack) localPreviewStream.addTrack(screenVideoTrack);
    addRemoteMedia('local-screen', localPreviewStream, `${state.username} (Você)`);

  } catch (err) {
    if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
      console.error('Falha na captura:', err.name, err.message, err);
      showToast('Não foi possível iniciar o compartilhamento de tela.', 'error');
    }
    if (screenShareBtn) {
      screenShareBtn.classList.add('text-zinc-300', 'hover:bg-zinc-600');
      screenShareBtn.classList.remove('text-white', 'bg-faketz-green', 'hover:bg-green-600');
      const profile = getProfile(state.selectedQuality);
      screenShareBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        ${profile.label}
      `;
    }
  }
}

export function stopScreenSharing() {
  const videoGrid = document.getElementById('video-grid');
  const screenShareBtn = document.getElementById('screen-share-btn');

  if (state.screenStream) {
    state.screenStream.getTracks().forEach(track => track.stop());

    for (const userId in state.peers) {
      const { pc } = state.peers[userId];
      const senders = pc.getSenders();

      senders.forEach(sender => {
        if (sender.track && sender.track.readyState === 'ended') {
          pc.removeTrack(sender);
        }
      });
    }

    state.screenStream = null;

    if (screenShareBtn) {
      screenShareBtn.classList.add('text-zinc-300', 'hover:bg-zinc-600');
      screenShareBtn.classList.remove('text-white', 'bg-faketz-green', 'hover:bg-green-600');
      const profile = getProfile(state.selectedQuality);
      screenShareBtn.innerHTML = `
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
        ${profile.label}
      `;
    }

    const localScreen = document.getElementById('media-local-screen');
    if (localScreen) {
      if (localScreen.classList.contains('focused') && videoGrid) {
        videoGrid.classList.remove('p-0', 'gap-0', 'content-stretch', 'items-stretch');
        videoGrid.classList.add('p-4', 'gap-4', 'content-start');
        Array.from(videoGrid.children).forEach(child => {
          child.style.display = 'flex';
        });
      }
      localScreen.remove();
    }
  }
}
