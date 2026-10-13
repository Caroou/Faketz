import { state } from './state.js';
import { deriveKey } from './crypto.js';
import { showToast } from './ui/toast.js';
import { initTabs } from './ui/tabs.js';
import { initIdleDetection } from './ui/idle.js';
import { initSpeakingDetector } from './ui/speaking.js';
import { addRemoteMedia } from './ui/mediaRenderer.js';
import { initMedia, toggleMic, toggleNoiseSuppression, startScreenSharing, stopScreenSharing } from './webrtc/media.js';
import { initChat } from './chat.js';
import { initSocketClient } from './socket.js';
import { initScreenPicker, openWebQualityModal } from './ui/screenPicker.js';
import { initStreamStats } from './ui/streamStats.js';

async function proceedToRoom() {
  const loginSection = document.getElementById('login-section');
  const appSection = document.getElementById('app-section');
  const roomNameDisplay = document.getElementById('room-name-display');
  const actionBtn = document.getElementById('action-btn');

  try {
    const isSpectator = await initMedia();
    loginSection.classList.add('hidden-section');
    appSection.classList.remove('hidden-section');

    roomNameDisplay.innerText = state.roomId;

    // Suppress double toast if spectator toast was already triggered
    if (!isSpectator) {
      showToast(`Conectado à sala ${state.roomId}`, 'success');
    }

    addRemoteMedia('local-mic', state.localStream, `${state.username} (Você)`, state.isMicMuted);

    state.socket.emit('join-room', state.roomId, state.username);
    if (state.isMicMuted) {
      state.socket.emit('mute-status', true);
    }
  } catch (error) {
    console.error('Erro ao ingressar na sala:', error);
    showToast('Erro ao acessar o microfone. Verifique as permissões.', 'error');
    state.isConnecting = false;
    if (actionBtn) {
      actionBtn.disabled = false;
      actionBtn.style.opacity = '1';
    }
  }
}

async function enterRoom() {
  if (state.isConnecting) return;

  const createRoomInput = document.getElementById('create-room-input');
  const createPinInput = document.getElementById('create-pin-input');
  const joinRoomInput = document.getElementById('join-room-input');
  const joinPinInput = document.getElementById('join-pin-input');
  const usernameInput = document.getElementById('username-input');
  const actionBtn = document.getElementById('action-btn');

  state.username = usernameInput.value.trim();
  state.roomId = state.currentTab === 'create' ? createRoomInput.value.trim() : joinRoomInput.value.trim();
  const pin = state.currentTab === 'create' ? createPinInput.value.trim() : joinPinInput.value.trim();

  if (!state.roomId || !state.username) {
    showToast('Por favor, preencha o nome e a sala.', 'error');
    return;
  }

  state.isConnecting = true;
  actionBtn.disabled = true;
  actionBtn.style.opacity = '0.7';

  if (state.currentTab === 'create') {
    state.socket.emit('create-room', { roomId: state.roomId, username: state.username, pin }, async (response) => {
      if (response.success) {
        state.chatCryptoKey = await deriveKey(state.roomId, pin);
        await proceedToRoom();
      } else {
        showToast(response.message, 'error');
        state.isConnecting = false;
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
      }
    });
  } else {
    state.socket.emit('check-room', { roomId: state.roomId, username: state.username, pin }, async (response) => {
      if (!response.exists) {
        showToast('Esta sala não existe. Verifique o nome ou crie uma nova.', 'error');
        state.isConnecting = false;
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
      } else if (!response.success) {
        showToast(response.message, 'error');
        state.isConnecting = false;
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
      } else {
        state.chatCryptoKey = await deriveKey(state.roomId, pin);
        await proceedToRoom();
      }
    });
  }
}

// Bootstrap application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI systems
  initTabs();
  initIdleDetection();
  initSpeakingDetector();
  initChat();
  initSocketClient();
  initScreenPicker();
  initStreamStats();

  // Bind main action buttons
  const actionBtn = document.getElementById('action-btn');
  const micToggleBtn = document.getElementById('mic-toggle-btn');
  const noiseSuppressionBtn = document.getElementById('noise-suppression-btn');
  const screenShareBtn = document.getElementById('screen-share-btn');
  const leaveRoomBtn = document.getElementById('leave-room-btn');

  if (actionBtn) {
    actionBtn.addEventListener('click', enterRoom);
  }

  if (micToggleBtn) {
    micToggleBtn.addEventListener('click', toggleMic);
  }

  if (noiseSuppressionBtn) {
    noiseSuppressionBtn.addEventListener('click', toggleNoiseSuppression);
  }

  if (screenShareBtn) {
    screenShareBtn.addEventListener('click', () => {
      if (!state.screenStream) {
        if (!window.desktopApp?.isDesktop) {
          openWebQualityModal();
        } else {
          startScreenSharing();
        }
      } else {
        stopScreenSharing();
      }
    });
  }

  if (leaveRoomBtn) {
    leaveRoomBtn.addEventListener('click', () => {
      if (confirm('Deseja realmente sair da sala?')) {
        window.location.reload();
      }
    });
  }

  const toggleStatsBtn = document.getElementById('toggle-stats-btn');
  if (toggleStatsBtn) {
    toggleStatsBtn.addEventListener('click', () => {
      document.body.classList.toggle('hide-stats');
      if (document.body.classList.contains('hide-stats')) {
        toggleStatsBtn.classList.remove('text-white', 'bg-white/10');
        toggleStatsBtn.classList.add('text-zinc-400');
      } else {
        toggleStatsBtn.classList.add('text-white', 'bg-white/10');
        toggleStatsBtn.classList.remove('text-zinc-400');
      }
    });
  }

  // Ocultar botão de download se estiver rodando no Electron
  if (window.desktopApp?.isDesktop) {
    const downloadContainer = document.getElementById('download-app-container');
    if (downloadContainer) downloadContainer.style.display = 'none';
  }
});
