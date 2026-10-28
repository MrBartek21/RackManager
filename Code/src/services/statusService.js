'use strict';

const config = require('../config');
const { readSystemMetrics, readNetworkUsage } = require('./systemMetrics');
const { readPeripherals } = require('./peripheralsMetrics');
const { readDemoMetrics, readDemoPeripherals } = require('./demoMetrics');
const { getDevices } = require('./deviceService');
const { processAutomations } = require('./automationService');
const { readRelayState, readRelayStates } = require('./relayService');
const multiMaxTransport = require('./multimaxTransport');
const { addEvent } = require('./eventService');

let previousPeripherals = null;
let previousDeviceStatuses = null;

function recordStateChanges(peripherals, devices) {
  if (previousPeripherals) {
    for (const key of ['door', 'relay1', 'relay2']) {
      const before = previousPeripherals[key];
      const current = peripherals[key];
      if (before !== null && before !== undefined && current !== before) {
        const labels = { door: 'Czujnik drzwi', relay1: 'EXT_RLY', relay2: 'POWER_RLY' };
        const format = (value) => key === 'door' ? (value ? 'otwarte' : 'zamknięte') : (value ? 'włączony' : 'wyłączony');
        addEvent({ title: `Zmiana stanu: ${labels[key]}`, detail: current === null || current === undefined ? 'Brak odczytu.' : format(current), kind: current === null || current === undefined ? 'yellow-dot' : 'blue-dot' });
      }
    }
    for (const key of ['extTemp', 'intTemp1', 'intTemp2', 'power-volt', 'power-watt']) {
      const wasAvailable = Number.isFinite(previousPeripherals[key]);
      const isAvailable = Number.isFinite(peripherals[key]);
      if (wasAvailable !== isAvailable) addEvent({ title: isAvailable ? 'Czujnik dostępny' : 'Utracono odczyt czujnika', detail: key, kind: isAvailable ? 'green-dot' : 'yellow-dot' });
    }
  }
  previousPeripherals = { ...peripherals };

  const statuses = new Map(devices.map((device) => [String(device.id), device.status]));
  if (previousDeviceStatuses) {
    for (const device of devices) {
      const id = String(device.id);
      if (previousDeviceStatuses.has(id) && previousDeviceStatuses.get(id) !== device.status) {
        addEvent({ title: 'Zmiana stanu urządzenia', detail: `${device.name || id}: ${device.status || 'brak statusu'}.`, kind: device.status === 'online' ? 'green-dot' : 'yellow-dot' });
      }
    }
  }
  previousDeviceStatuses = statuses;
}

function getStatus() {
  const isDemoMode = config.demoMode;
  const system = { ...(isDemoMode ? readDemoMetrics() : readSystemMetrics()), network: readNetworkUsage() };
  const peripherals = isDemoMode ? readDemoPeripherals() : { ...readPeripherals(), ...readRelayStates() };
  if (isDemoMode && config.relay1Gpio !== null) peripherals.relay1 = readRelayState('relay1');
  if (isDemoMode && config.relay2Gpio !== null) peripherals.relay2 = readRelayState('relay2');
  const devices = getDevices();
  recordStateChanges(peripherals, devices);
  processAutomations(system, peripherals);
  return {
    type: 'status',
    timestamp: new Date().toISOString(),
    demoMode: isDemoMode,
    system,
    peripherals,
    devices,
    multiMax: { configured: Boolean(config.multiMaxPort), connected: multiMaxTransport.isConnected() },
    relayControlConfigured: config.relay1Gpio !== null && config.relay2Gpio !== null,
  };
}

module.exports = { getStatus };
