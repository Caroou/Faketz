const http = require('http');
const { Server } = require('socket.io');

const app = require('./src/app');
const config = require('./src/config');
const initSocketServer = require('./src/socket');

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // 10MB for encrypted image payloads
});

// Initialize modular socket events
initSocketServer(io);

server.listen(config.PORT, () => {
  console.log(`Servidor Faketz rodando na porta ${config.PORT}`);
});
