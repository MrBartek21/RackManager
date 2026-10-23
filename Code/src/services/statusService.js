'use strict';

const os = require('node:os');
const config = require('../config');
const { readSystemMetrics } = require('./systemMetrics');
const { readDemoMetrics } = require('./demoMetrics');

function getStatus() {
  const metrics = config.demoMode ? readDemoMetrics() : readSystemMetrics();
  return {
    type: 'status',
    timestamp: new Date().toISOString(),
    demoMode: config.demoMode,
    system: { ...metrics, door: null },
    devices: [],
    host: os.hostname(),
  };
}

module.exports = { getStatus };
