'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readExternalTemperature() {
  const base = '/sys/bus/w1/devices';
  try {
    const device = fs.readdirSync(base).find((name) => name.startsWith('28-'));
    if (!device) return null;
    const content = fs.readFileSync(path.join(base, device, 'w1_slave'), 'utf8');
    if (!content.includes('YES')) return null;
    const raw = Number(content.match(/t=(-?\d+)/)?.[1]);
    return Number.isFinite(raw) ? Number((raw / 1000).toFixed(1)) : null;
  } catch {
    return null;
  }
}

function readPeripherals() {
  return {
    door: null,
    extTemp: readExternalTemperature(),
    intTemp1: null,
    intTemp2: null,
    'power-volt': null,
    'power-watt': null,
    relay1: null,
    relay2: null,
  };
}

module.exports = { readPeripherals };
