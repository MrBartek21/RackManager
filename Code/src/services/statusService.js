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
    devices: [],
  };
}

module.exports = { getStatus };
