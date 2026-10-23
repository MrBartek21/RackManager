'use strict';

let tick = 0;
const between = (min, max, phase) => Number((min + ((Math.sin(tick / phase) + 1) / 2) * (max - min)).toFixed(1));

function readDemoMetrics() {
  tick += 1;
  return {
    cpuUsage: between(8, 42, 5), cpuTemp: between(39, 51, 12), ram: between(34, 48, 18),
    swap: between(0, 4, 21), disk: 36, extTemp: between(20, 23, 16),
    memory: { totalBytes: 8 * 1024 ** 3, freeBytes: 4.4 * 1024 ** 3 },
    uptimeSeconds: 4 * 86400 + tick * 2, hostname: 'rackmanager-demo', platform: 'Raspberry Pi OS (demo)', loadAverage: [0.24, 0.19, 0.16],
  };
}

module.exports = { readDemoMetrics };
