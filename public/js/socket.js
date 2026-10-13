import { state } from './state.js';
import { addMessage, onChatMessage, onTypingStatus } from './chat.js';
import { createPeerConnection, handleSignal } from './webrtc/peer.js';
import { removeVideo } from './ui/mediaRenderer.js';
import { showToast } from './ui/toast.js';

export function initSocketClient() {
  const socket = io('/', {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000
  });
  state.socket = socket;

  // Handle Socket Reconnection
  socket.on('connect', () => {
    const dot = document.getElementById('connection-status-dot');
    const text = document.getElementById('connection-status-text');

    if (dot) dot.className = 'w-2 h-2 rounded-full bg-faketz-green animate-pulse';
    if (text) {
      text.className = 'text-xs font-semibold text-faketz-green';
      text.innerText = 'Conectado';
    }

    // If user was already inside an active room before disconnecting, automatically rejoin!
    if (state.roomId && state.username) {
      console.log(`[Reconexão] Reconectando automaticamente à sala ${state.roomId}...`);

      // Clean up stale peer connections from previous session
      for (const userId in state.peers) {
        try {
          state.peers[userId]?.pc?.close();
        } catch (e) {}
        removeVideo(userId);
      }
      state.peers = {};

      // Re-join room with same identity and room credentials
      socket.emit('join-room', state.roomId, state.username);
      if (state.isMicMuted) {
        socket.emit('mute-status', true);
      }

      showToast('Reconectado à sala com sucesso!', 'success');
      addMessage('Sistema', 'Você foi reconectado à sala automaticamente.');
    }
  });

  // Handle Disconnection / Network drops
  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Desconectado do servidor:', reason);

    const dot = document.getElementById('connection-status-dot');
    const text = document.getElementById('connection-status-text');

    if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
    if (text) {
      text.className = 'text-xs font-semibold text-amber-400';
      text.innerText = 'Reconectando...';
    }

    if (state.roomId) {
      showToast('Conexão perdida. Reconectando automaticamente...', 'error');
    }
  });

  socket.on('user-connected', (userId, newUsername) => {
    addMessage('Sistema', `${newUsername} entrou na sala.`);
    createPeerConnection(userId, newUsername);
  });

  socket.on('user-disconnected', (userId) => {
    if (state.peers[userId]) {
      const leavingName = state.peers[userId].username || 'Um usuário';
      state.peers[userId].pc.close();
      delete state.peers[userId];
      removeVideo(userId);
      addMessage('Sistema', `${leavingName} saiu da sala.`);
    }
  });

  socket.on('chat-message', onChatMessage);
  socket.on('typing-status', onTypingStatus);

  socket.on('user-muted', (userId, isMuted) => {
    const allMuteInds = [
      document.getElementById(`mute-indicator-${userId}`),
      document.getElementById(`mute-indicator-${userId}-screen`)
    ];
    allMuteInds.forEach((el) => {
      if (el) el.style.display = isMuted ? 'flex' : 'none';
    });
  });

  socket.on('signal', handleSignal);

  return socket;
}
