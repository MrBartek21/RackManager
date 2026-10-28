'use strict';

const http = require('node:http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const config = require('./config');
const api = require('./routes/api');
const { getStatus } = require('./services/statusService');
const { addEvent } = require('./services/eventService');
const multiMaxTransport = require('./services/multimaxTransport');

const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server, path: '/ws' });
addEvent({ title: 'Uruchomiono serwer RackManager', detail: `Tryb ${config.demoMode ? 'demonstracyjny' : 'rzeczywisty'}.`, kind: 'green-dot' });
multiMaxTransport.start();
const statusTimer = setInterval(() => {
  const status = JSON.stringify(getStatus());
  for (const socket of webSocketServer.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.send(status);
  }
}, config.updateIntervalMs);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use('/api', api);
app.use(express.static(config.staticDirectory, { extensions: ['html'] }));

webSocketServer.on('connection', (socket) => {
  socket.send(JSON.stringify(getStatus()));
});

server.listen(config.port, config.host, () => {
  console.log(`RackManager działa: http://localhost:${config.port}`);
  console.log(`Tryb danych: ${config.demoMode ? 'demonstracyjny' : 'rzeczywisty'}`);
});

function shutdown() {
  clearInterval(statusTimer);
  multiMaxTransport.stop();
  webSocketServer.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
