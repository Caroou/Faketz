const RoomManager = require('../state/roomManager');

function registerRoomHandlers(io, socket) {
  // Check room status, password and duplicate username
  socket.on('check-room', (data, callback) => {
    if (typeof callback !== 'function') return;

    const roomId = typeof data === 'string' ? data : data?.roomId;
    const username = data?.username;
    const pin = data?.pin || '';

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

    const created = RoomManager.createRoom(roomId, pin);
    if (!created) {
      callback({ success: false, message: 'Sala já existe. Escolha outro nome.' });
    } else {
      callback({ success: true });
    }
  });

  // Join room
  socket.on('join-room', (roomId, username) => {
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    RoomManager.cancelRoomCleanup(roomId);
    RoomManager.setUser(socket.id, { username, roomId, isMuted: false });
    RoomManager.ensureRoom(roomId, '');

    // Notify other peers in room
    socket.to(roomId).emit('user-connected', socket.id, username);
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
