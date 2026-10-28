'use strict';

const { execFileSync } = require('node:child_process');
const config = require('../config');

function setOutput(pin, high) {
  if (process.platform !== 'linux') throw new Error('Sterowanie GPIO jest dostępne na hoście Linux Raspberry Pi.');
  try {
    execFileSync(config.gpioCommand, ['set', String(pin), 'op', high ? 'dh' : 'dl'], { timeout: 1500, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    throw new Error(`Nie udało się ustawić GPIO ${pin}. Sprawdź ${config.gpioCommand} i uprawnienia serwera.`);
  }
}

function read(pin) {
  if (process.platform !== 'linux') return null;
  try {
    const output = execFileSync(config.gpioCommand, ['get', String(pin)], { timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const level = output.match(/level\s*=\s*([01])/i)?.[1];
    return level === undefined ? null : level === '1';
  } catch { return null; }
}

module.exports = { setOutput, read };
