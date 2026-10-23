'use strict';

const http = require('node:http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const config = require('./config');
const api = require('./routes/api');
const { getStatus } = require('./services/statusService');

const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server, path: '/ws' });

app.disable('x-powered-by');
app.use('/api', api);
app.use(express.static(config.staticDirectory, { extensions: ['html'] }));

webSocketServer.on('connection', (socket) => {
  socket.send(JSON.stringify(getStatus()));
  const timer = setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(getStatus()));
  }, config.updateIntervalMs);
  socket.on('close', () => clearInterval(timer));
  socket.on('error', () => clearInterval(timer));
});

server.listen(config.port, config.host, () => {
  console.log(`RackManager działa: http://localhost:${config.port}`);
  console.log(`Tryb danych: ${config.demoMode ? 'demonstracyjny' : 'rzeczywisty'}`);
});

function shutdown() {
  webSocketServer.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
