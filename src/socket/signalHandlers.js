const RoomManager = require('../state/roomManager');

function registerSignalHandlers(io, socket) {
  // Mute status synchronization
  socket.on('mute-status', (isMuted) => {
    RoomManager.updateUserMute(socket.id, isMuted);
    if (socket.roomId) {
      socket.to(socket.roomId).emit('user-muted', socket.id, isMuted);
    }
  });

  // WebRTC P2P Signaling relay (offer/answer/candidate)
  socket.on('signal', (data) => {
    if (!data || !data.to) return;

    const user = RoomManager.getUser(socket.id);
    const recipient = RoomManager.getUser(data.to);
    if (!user || !recipient || !user.roomId || user.roomId !== recipient.roomId ||
        socket.roomId !== user.roomId) return;

    io.to(data.to).emit('signal', {
      from: socket.id,
      signal: data.signal,
      username: user.username,
      avatar: user.avatar || null,
      isMuted: user.isMuted
    });
  });
}

module.exports = registerSignalHandlers;
