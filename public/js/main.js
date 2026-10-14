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

// Local storage keys
const STORAGE_USERNAME = 'faketz_last_username';
const STORAGE_ROOM = 'faketz_last_room';
const STORAGE_AVATAR = 'faketz_user_avatar';

// Helper: Compress avatar file to max 96x96 px thumbnail data URL (< 10KB)
function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const size = 96;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Center-crop to square
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;

        ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateLoginAvatarUI() {
  const initialEl = document.getElementById('login-avatar-initial');
  const imgEl = document.getElementById('login-avatar-img');
  const removeBtn = document.getElementById('remove-avatar-btn');
  const usernameInput = document.getElementById('username-input');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const initial = username ? username.charAt(0).toUpperCase() : '?';

  if (state.avatar) {
    if (imgEl) {
      imgEl.src = state.avatar;
      imgEl.classList.remove('hidden');
    }
    if (initialEl) initialEl.classList.add('hidden');
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    if (imgEl) {
      imgEl.src = '';
      imgEl.classList.add('hidden');
    }
    if (initialEl) {
      initialEl.textContent = initial;
      initialEl.classList.remove('hidden');
    }
    if (removeBtn) removeBtn.classList.add('hidden');
  }
}

function initProfilePersistence() {
  const usernameInput = document.getElementById('username-input');
  const joinRoomInput = document.getElementById('join-room-input');
  const createRoomInput = document.getElementById('create-room-input');
  const avatarFileInput = document.getElementById('avatar-file-input');
  const avatarPreviewBtn = document.getElementById('avatar-preview-btn');
  const removeAvatarBtn = document.getElementById('remove-avatar-btn');

  // Load saved values
  const savedUsername = localStorage.getItem(STORAGE_USERNAME);
  const savedRoom = localStorage.getItem(STORAGE_ROOM);
  const savedAvatar = localStorage.getItem(STORAGE_AVATAR);

  if (savedUsername && usernameInput) {
    usernameInput.value = savedUsername;
    state.username = savedUsername;
  }
  if (savedRoom) {
    if (joinRoomInput) joinRoomInput.value = savedRoom;
    if (createRoomInput) createRoomInput.value = savedRoom;
  }
  if (savedAvatar) {
    state.avatar = savedAvatar;
  }

  updateLoginAvatarUI();

  // Listen to username typing to update default letter avatar
  if (usernameInput) {
    usernameInput.addEventListener('input', () => {
      if (!state.avatar) {
        updateLoginAvatarUI();
      }
    });
  }

  // Trigger avatar file selection
  const pickFile = () => avatarFileInput?.click();
  if (avatarPreviewBtn) avatarPreviewBtn.addEventListener('click', pickFile);

  // Avatar file input change
  if (avatarFileInput) {
    avatarFileInput.addEventListener('change', async () => {
      const file = avatarFileInput.files?.[0];
      if (file) {
        try {
          const dataUrl = await compressAvatar(file);
          state.avatar = dataUrl;
          localStorage.setItem(STORAGE_AVATAR, dataUrl);
          updateLoginAvatarUI();
          showToast('Foto de perfil atualizada!', 'success');
        } catch (err) {
          console.error('Erro ao processar avatar:', err);
          showToast('Erro ao carregar avatar.', 'error');
        } finally {
          avatarFileInput.value = '';
        }
      }
    });
  }

  // Remove avatar
  if (removeAvatarBtn) {
    removeAvatarBtn.addEventListener('click', () => {
      state.avatar = null;
      localStorage.removeItem(STORAGE_AVATAR);
      updateLoginAvatarUI();
      showToast('Foto removida.', 'info');
    });
  }
}

async function proceedToRoom(pin) {
  const loginSection = document.getElementById('login-section');
  const appSection = document.getElementById('app-section');
  const roomNameDisplay = document.getElementById('room-name-display');
  const actionBtn = document.getElementById('action-btn');

  try {
    const isSpectator = await initMedia();
    const joinResult = await new Promise((resolve) => {
      state.socket.emit('join-room', state.roomId, state.username, state.avatar, pin, resolve);
    });
    if (!joinResult?.success) {
      state.localStream?.getTracks().forEach((track) => track.stop());
      state.localStream = null;
      state.isConnecting = false;
      if (actionBtn) {
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
      }
      showToast(joinResult?.message || 'Não foi possível entrar na sala.', 'error');
      return;
    }

    loginSection.classList.add('hidden-section');
    appSection.classList.remove('hidden-section');

    roomNameDisplay.innerText = state.roomId;

    // Suppress double toast if spectator toast was already triggered
    if (!isSpectator) {
      showToast(`Conectado à sala ${state.roomId}`, 'success');
    }

    // Render local avatar/mic tile
    addRemoteMedia('local-mic', state.localStream, `${state.username} (Você)`, state.isMicMuted, state.avatar);

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
  state.roomPin = pin;

  if (!state.roomId || !state.username) {
    showToast('Por favor, preencha o nome e a sala.', 'error');
    return;
  }

  // Persist user inputs in localStorage
  localStorage.setItem(STORAGE_USERNAME, state.username);
  localStorage.setItem(STORAGE_ROOM, state.roomId);

  state.isConnecting = true;
  actionBtn.disabled = true;
  actionBtn.style.opacity = '0.7';

  if (state.currentTab === 'create') {
    state.socket.emit('create-room', { roomId: state.roomId, username: state.username, pin }, async (response) => {
      if (response.success) {
        state.chatCryptoKey = await deriveKey(state.roomId, pin);
        await proceedToRoom(pin);
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
        await proceedToRoom(pin);
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
  initProfilePersistence();

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
