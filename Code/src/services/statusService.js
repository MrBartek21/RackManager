'use strict';

const config = require('../config');
const { readSystemMetrics, readNetworkUsage } = require('./systemMetrics');
const { readPeripherals } = require('./peripheralsMetrics');
const { readDemoMetrics, readDemoPeripherals } = require('./demoMetrics');

function getStatus() {
  const isDemoMode = config.demoMode;
  return {
    type: 'status',
    timestamp: new Date().toISOString(),
    demoMode: isDemoMode,
    system: { ...(isDemoMode ? readDemoMetrics() : readSystemMetrics()), network: readNetworkUsage() },
    peripherals: isDemoMode ? readDemoPeripherals() : readPeripherals(),
    devices: isDemoMode ? [{
      id: 'MMX-DEMO-01',
      name: 'Moduł Multimax',
      type: 'Moduł I/O',
      protocol: 'MultiMax',
      interface: 'RS-485',
      address: '0x01',
      firmwareVersion: '0.1.0-demo',
      hardwareVersion: '1.0-demo',
      serialNumber: 'MMX-DEMO-0001',
      status: 'online',
      lastSeen: new Date().toISOString(),
      example: true,
    }] : [],
    devices5: [],
  };
}

module.exports = { getStatus };
