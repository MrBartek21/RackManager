'use strict';

const { randomUUID } = require('node:crypto');
const { readCollection, writeCollection } = require('./jsonFileStore');
const config = require('../config');
const FILE = 'devices.json';

function getDevices() {
  const now = Date.now();
  return readCollection(FILE)
    .filter((device) => !device.example || (config.demoMode && !config.multiMaxPort))
    .map((device) => {
      if (device.example || !device.lastSeen) return device;
      const lastSeenAt = new Date(device.lastSeen).getTime();
      return Number.isFinite(lastSeenAt) && now - lastSeenAt > config.deviceOfflineTimeoutMs
        ? { ...device, status: 'offline' }
        : device;
    });
}

function saveDevice(input) {
  const device = { ...input, id: String(input.id || randomUUID()), lastSeen: input.lastSeen || new Date().toISOString() };
  const devices = readCollection(FILE);
  const index = devices.findIndex((item) => String(item.id) === device.id);
  if (index >= 0) devices[index] = { ...devices[index], ...device };
  else devices.push(device);
  writeCollection(FILE, devices);
  return device;
}

function deleteDevice(id) {
  const devices = readCollection(FILE);
  const next = devices.filter((item) => String(item.id) !== String(id));
  writeCollection(FILE, next);
  return next.length !== devices.length;
}

module.exports = { getDevices, saveDevice, deleteDevice };
