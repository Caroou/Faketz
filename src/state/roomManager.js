// In-memory state for rooms and active connected users
const activeRooms = new Map(); // roomId -> { pin: string }
const users = {}; // socket.id -> { username, roomId, isMuted }
const roomCleanupTimers = new Map(); // roomId -> timeoutId

const RoomManager = {
  hasRoom(roomId) {
    return activeRooms.has(roomId);
  },

  getRoom(roomId) {
    return activeRooms.get(roomId);
  },

  createRoom(roomId, pin = '') {
    if (activeRooms.has(roomId)) {
      return false;
    }
    this.cancelRoomCleanup(roomId);
    activeRooms.set(roomId, { pin });
    return true;
  },

  deleteRoom(roomId) {
    this.cancelRoomCleanup(roomId);
    return activeRooms.delete(roomId);
  },

  ensureRoom(roomId, pin = '') {
    this.cancelRoomCleanup(roomId);
    if (!activeRooms.has(roomId)) {
      activeRooms.set(roomId, { pin });
    }
  },

  getUser(socketId) {
    return users[socketId];
  },

  setUser(socketId, userData) {
    users[socketId] = userData;
  },

  updateUserMute(socketId, isMuted) {
    if (users[socketId]) {
      users[socketId].isMuted = isMuted;
    }
  },

  removeUser(socketId) {
    const user = users[socketId];
    delete users[socketId];
    return user;
  },

  isUsernameTaken(roomId, username, excludeSocketId = null) {
    if (!username) return false;
    const lowerUsername = username.toLowerCase();
    return Object.entries(users).some(
      ([socketId, u]) => socketId !== excludeSocketId &&
        u.roomId === roomId && u.username.toLowerCase() === lowerUsername
    );
  },

  cleanupRoomIfEmpty(io, roomId) {
    if (!roomId) return;
    const room = io.sockets.adapter.rooms.get(roomId);
    if (!room || room.size === 0) {
      if (!roomCleanupTimers.has(roomId)) {
        // 2-minute grace period before cleaning empty room to allow automatic reconnection
        const timer = setTimeout(() => {
          const currentRoom = io.sockets.adapter.rooms.get(roomId);
          if (!currentRoom || currentRoom.size === 0) {
            activeRooms.delete(roomId);
          }
          roomCleanupTimers.delete(roomId);
        }, 120000);
        roomCleanupTimers.set(roomId, timer);
      }
    }
  },

  cancelRoomCleanup(roomId) {
    if (roomCleanupTimers.has(roomId)) {
      clearTimeout(roomCleanupTimers.get(roomId));
      roomCleanupTimers.delete(roomId);
    }
  }
};

module.exports = RoomManager;
