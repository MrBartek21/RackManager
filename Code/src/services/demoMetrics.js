'use strict';

let tick = 0;
const between = (min, max, phase) => Number((min + ((Math.sin(tick / phase) + 1) / 2) * (max - min)).toFixed(1));

function readDemoMetrics() {
  tick += 1;
  return {
    cpuUsage: between(8, 42, 5), cpuTemp: between(39, 51, 12), ram: between(34, 48, 18),
    swap: between(0, 4, 21), disk: 36,
    memory: { totalBytes: 8 * 1024 ** 3, freeBytes: 4.4 * 1024 ** 3 },
    uptimeSeconds: 4 * 86400 + tick * 2, hostname: 'rackmanager-demo', platform: 'Raspberry Pi OS (demo)', loadAverage: [0.24, 0.19, 0.16],
  };
}

function readDemoPeripherals() {
  return {
    door: null,
    extTemp: between(20, 23, 16),
    intTemp1: between(15, 30, 20),
    intTemp2: between(5, 40, 8),
    'power-volt': between(10, 14, 1),
    'power-watt': between(5, 50, 3),
    relay1: true,
    relay2: false,
  };
}

module.exports = { readDemoMetrics, readDemoPeripherals };
