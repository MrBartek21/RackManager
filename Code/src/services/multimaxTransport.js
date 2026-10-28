'use strict';

const config = require('../config');
const { addEvent } = require('./eventService');
const { getDevices } = require('./deviceService');
const { registerAnnouncement, processIncomingCommand, updateDeviceHeartbeat } = require('./multimaxMessageService');
const { MESSAGE, encodeFrame, takeFrames } = require('./multimaxProtocol');
const gpio = require('./gpioService');

let port = null;
let discoveryTimer = null;
let reconnectTimer = null;
let stopping = false;
let receiveBuffer = Buffer.alloc(0);
let sequence = 0;
let writeQueue = Promise.resolve();
const pendingCommands = new Map();

function nextSequence() {
  sequence = (sequence + 1) & 0xffff;
  return sequence;
}

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function writeFrame(frame) {
  const currentWrite = writeQueue.then(async () => {
    if (!port?.isOpen) throw new Error('Port MultiMax nie jest otwarty.');
    const directionPin = config.multiMaxDirectionGpio;
    try {
      if (directionPin !== null) {
        gpio.setOutput(directionPin, true);
        await delay(1);
      }
      await new Promise((resolve, reject) => {
        port.write(frame, (error) => {
          if (error) return reject(error);
          port.drain((drainError) => drainError ? reject(drainError) : resolve());
        });
      });
      if (directionPin !== null) await delay(1);
    } finally {
      if (directionPin !== null) gpio.setOutput(directionPin, false);
    }
  });
  writeQueue = currentWrite.catch(() => {});
  return currentWrite;
}

async function sendMessage(destination, type, payload = {}, requestSequence = nextSequence()) {
  return writeFrame(encodeFrame({ destination, source: config.multiMaxAddress, type, sequence: requestSequence, payload }));
}

function addressOf(device) {
  const address = typeof device.address === 'string' ? Number.parseInt(device.address, 0) : Number(device.address);
  if (!Number.isInteger(address) || address < 1 || address > 65534) throw new Error(`Urządzenie ${device.id} nie ma prawidłowego adresu MultiMax.`);
  return address;
}

async function sendDeviceCommand(deviceId, command, action, parameters = {}) {
  const device = getDevices().find((item) => String(item.id) === String(deviceId));
  if (!device) throw new Error(`Nie znaleziono urządzenia ${deviceId}.`);
  if (!port?.isOpen) throw new Error('Port MultiMax nie jest podłączony.');
  const address = addressOf(device);
  const commandSequence = nextSequence();
  const key = `${address}:${commandSequence}`;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingCommands.delete(key);
      reject(new Error(`Urządzenie ${device.name} nie odpowiedziało na komendę ${command}.`));
    }, 3000);
    pendingCommands.set(key, { resolve, reject, timeout });
    sendMessage(address, MESSAGE.EXECUTE, { command, action, parameters }, commandSequence).catch((error) => {
      clearTimeout(timeout);
      pendingCommands.delete(key);
      reject(error);
    });
  });
}

function handleFrame(frame) {
  if (frame.destination !== config.multiMaxAddress && frame.destination !== 0xffff) return;
  if (!frame.payload || typeof frame.payload !== 'object') return;
  if (frame.type === MESSAGE.ANNOUNCE) {
    try {
      const device = registerAnnouncement(frame.payload, frame.source);
      sendMessage(frame.source, MESSAGE.ANNOUNCE_ACK, { accepted: true, id: device.id }, frame.sequence).catch(() => {});
    } catch (error) {
      addEvent({ title: 'Odrzucono ogłoszenie MultiMax', detail: error.message, kind: 'yellow-dot' });
      sendMessage(frame.source, MESSAGE.ANNOUNCE_ACK, { accepted: false, error: error.message }, frame.sequence).catch(() => {});
    }
    return;
  }
  if (frame.type === MESSAGE.HEARTBEAT) {
    const device = updateDeviceHeartbeat(frame.payload.id, frame.payload.state, frame.source);
    if (device) sendMessage(frame.source, MESSAGE.ANNOUNCE_ACK, { accepted: true }, frame.sequence).catch(() => {});
    return;
  }
  if (frame.type === MESSAGE.COMMAND) {
    try {
      processIncomingCommand(frame.payload.id, frame.payload.command, frame.payload.parameters, frame.source);
      sendMessage(frame.source, MESSAGE.COMMAND_ACK, { accepted: true }, frame.sequence).catch(() => {});
    } catch (error) {
      sendMessage(frame.source, MESSAGE.COMMAND_ACK, { accepted: false, error: error.message }, frame.sequence).catch(() => {});
    }
    return;
  }
  if (frame.type === MESSAGE.STATE) {
    updateDeviceHeartbeat(frame.payload.id, frame.payload.state, frame.source);
    return;
  }
  if (frame.type === MESSAGE.RESULT) {
    const key = `${frame.source}:${frame.sequence}`;
    const pending = pendingCommands.get(key);
    if (!pending) return;
    clearTimeout(pending.timeout);
    pendingCommands.delete(key);
    if (frame.payload.ok) pending.resolve(frame.payload);
    else pending.reject(new Error(frame.payload.error || 'Urządzenie odrzuciło komendę.'));
  }
}

function onData(chunk) {
  receiveBuffer = Buffer.concat([receiveBuffer, chunk]);
  const parsed = takeFrames(receiveBuffer);
  receiveBuffer = parsed.rest;
  for (const frame of parsed.frames) handleFrame(frame);
}

function scheduleReconnect() {
  if (stopping || !config.multiMaxPort) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    port = null;
    start();
  }, 5000);
}

async function discover() {
  if (!port?.isOpen) return;
  try {
    const discoverySequence = nextSequence();
    await sendMessage(0xffff, MESSAGE.DISCOVER, {
      protocol: 'MultiMax', version: 1, slots: 64, slotMs: 25, epoch: discoverySequence,
    }, discoverySequence);
  } catch (error) {
    addEvent({ title: 'Błąd magistrali MultiMax', detail: error.message, kind: 'yellow-dot' });
  }
}

function start() {
  if (!config.multiMaxPort || port) return;
  stopping = false;
  const { SerialPort } = require('serialport');
  try {
    if (config.multiMaxDirectionGpio !== null) gpio.setOutput(config.multiMaxDirectionGpio, false);
    port = new SerialPort({
      path: config.multiMaxPort,
      baudRate: config.multiMaxBaudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      autoOpen: false,
    });
  } catch (error) {
    port = null;
    addEvent({ title: 'Błąd konfiguracji portu MultiMax', detail: error.message, kind: 'yellow-dot' });
    return;
  }
  port.on('data', onData);
  port.on('open', () => {
    addEvent({ title: 'Połączono z magistralą MultiMax', detail: `${config.multiMaxPort}, ${config.multiMaxBaudRate} bit/s, 8N1.`, kind: 'green-dot' });
    discover();
    discoveryTimer = setInterval(discover, 10000);
  });
  port.on('error', (error) => addEvent({ title: 'Błąd portu MultiMax', detail: error.message, kind: 'yellow-dot' }));
  port.on('close', () => {
    clearInterval(discoveryTimer);
    discoveryTimer = null;
    port = null;
    addEvent({ title: 'Rozłączono magistralę MultiMax', detail: config.multiMaxPort, kind: 'yellow-dot' });
    scheduleReconnect();
  });
  port.open((error) => {
    if (error) {
      addEvent({ title: 'Nie można otworzyć portu MultiMax', detail: error.message, kind: 'yellow-dot' });
      scheduleReconnect();
    }
  });
}

function stop() {
  stopping = true;
  clearInterval(discoveryTimer);
  discoveryTimer = null;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (port?.isOpen) port.close();
  port = null;
}

module.exports = { start, stop, sendDeviceCommand, isConnected: () => Boolean(port?.isOpen) };
