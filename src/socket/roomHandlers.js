const RoomManager = require('../state/roomManager');

function registerRoomHandlers(io, socket) {
  // Check room status, password and duplicate username
  socket.on('check-room', (data, callback) => {
    if (typeof callback !== 'function') return;

    const roomId = typeof data === 'string' ? data : data?.roomId;
    const username = data?.username;
    const pin = data?.pin || '';

    if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 64 ||
        (username !== undefined && (typeof username !== 'string' || username.length > 32)) ||
        typeof pin !== 'string') {
      callback({ exists: false, success: false, message: 'Nome ou sala inválidos.' });
      return;
    }

    if (!RoomManager.hasRoom(roomId)) {
      callback({ exists: false });
      return;
    }

    const roomData = RoomManager.getRoom(roomId);
    if (roomData.pin && roomData.pin !== pin) {
      callback({ exists: true, success: false, message: 'Senha da sala incorreta.' });
      return;
    }

    if (username && RoomManager.isUsernameTaken(roomId, username)) {
      callback({ exists: true, success: false, message: 'Este nome de usuário já está em uso na sala.' });
      return;
    }

    callback({ exists: true, success: true });
  });

  // Create room with optional password
  socket.on('create-room', (data, callback) => {
    if (typeof callback !== 'function') return;

    const roomId = typeof data === 'string' ? data : data?.roomId;
    const pin = data?.pin || '';

    if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 64 ||
        typeof pin !== 'string' || pin.length > 128) {
      callback({ success: false, message: 'Nome da sala ou senha inválidos.' });
      return;
    }

    const created = RoomManager.createRoom(roomId, pin);
    if (!created) {
      callback({ success: false, message: 'Sala já existe. Escolha outro nome.' });
    } else {
      callback({ success: true });
    }
  });

  // Join room
  socket.on('join-room', (roomId, username, avatar = null, pin = '', callback) => {
    const acknowledge = (result) => {
      if (typeof callback === 'function') callback(result);
    };
    if (typeof roomId !== 'string' || !roomId.trim() || roomId.length > 64 ||
        typeof username !== 'string' || !username.trim() || username.length > 32 ||
        typeof pin !== 'string' || pin.length > 128) {
      acknowledge({ success: false, message: 'Nome ou sala inválidos.' });
      return;
    }

    const roomData = RoomManager.getRoom(roomId);
    if (!roomData) {
      acknowledge({ success: false, message: 'Esta sala não existe.' });
      return;
    }
    if ((roomData.pin || '') !== (typeof pin === 'string' ? pin : '')) {
      acknowledge({ success: false, message: 'Senha da sala incorreta.' });
      return;
    }
    if (RoomManager.isUsernameTaken(roomId, username, socket.id)) {
      acknowledge({ success: false, message: 'Este nome de usuário já está em uso na sala.' });
      return;
    }
    if (socket.roomId && socket.roomId !== roomId) {
      acknowledge({ success: false, message: 'Esta conexão já está em outra sala.' });
      return;
    }
    if (socket.roomId === roomId) {
      acknowledge({ success: true });
      return;
    }

    const safeAvatar = typeof avatar === 'string' && avatar.length <= 50000 &&
      /^data:image\/jpeg;base64,[a-z0-9+/]+=*$/i.test(avatar) ? avatar : null;

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    socket.avatar = safeAvatar;

    RoomManager.cancelRoomCleanup(roomId);
    RoomManager.setUser(socket.id, { username, roomId, avatar: safeAvatar, isMuted: false });

    // Notify other peers in room
    socket.to(roomId).emit('user-connected', socket.id, username, safeAvatar);
    acknowledge({ success: true });
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('typing-status', {
        userId: socket.id,
        username: socket.username,
        isTyping: false
      });
      socket.to(socket.roomId).emit('user-disconnected', socket.id);
      RoomManager.removeUser(socket.id);
      RoomManager.cleanupRoomIfEmpty(io, socket.roomId);
    }
  });
}

module.exports = registerRoomHandlers;
