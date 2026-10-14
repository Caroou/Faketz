function registerChatHandlers(io, socket) {
  socket.on('chat-message', (message) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('chat-message', {
        message,
        username: socket.username,
        userId: socket.id,
        avatar: socket.avatar || null
      });
    }
  });

  socket.on('typing-status', (isTyping) => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit('typing-status', {
        userId: socket.id,
        username: socket.username,
        isTyping: Boolean(isTyping)
      });
    }
  });
}

module.exports = registerChatHandlers;
