'use strict';

const path = require('node:path');
const fs = require('node:fs');

// Minimalny loader .env bez dodatkowej zależności. Zmienne środowiskowe procesu mają pierwszeństwo.
const envFile = path.join(__dirname, '..', '.env');
try {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    process.env[match[1]] = match[2].replace(/^(?:"(.*)"|'(.*)')$/, (_whole, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
  }
} catch { /* Plik .env jest opcjonalny. */ }

function integerFromEnv(name, fallback, minimum, maximum) {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isInteger(value) || value < minimum || value > maximum) return fallback;
  return value;
}

const defaultMultiMaxPort = process.platform === 'linux' && fs.existsSync('/dev/serial0') ? '/dev/serial0' : '';

module.exports = Object.freeze({
  host: process.env.HOST || '0.0.0.0',
  port: integerFromEnv('PORT', 3000, 1, 65535),
  updateIntervalMs: integerFromEnv('UPDATE_INTERVAL_MS', 2000, 500, 60000),
  deviceOfflineTimeoutMs: integerFromEnv('DEVICE_OFFLINE_TIMEOUT_MS', 30000, 2000, 3600000),
  multiMaxPort: process.env.MULTIMAX_PORT || defaultMultiMaxPort,
  multiMaxBaudRate: integerFromEnv('MULTIMAX_BAUD_RATE', 115200, 1200, 1000000),
  multiMaxAddress: integerFromEnv('MULTIMAX_GATEWAY_ADDRESS', 0, 0, 65534),
  relay1Gpio: integerFromEnv('RACKMANAGER_RELAY1_GPIO', 23, 0, 53),
  relay2Gpio: integerFromEnv('RACKMANAGER_RELAY2_GPIO', 22, 0, 53),
  multiMaxDirectionGpio: integerFromEnv('MULTIMAX_REDE_GPIO', 18, 0, 53),
  relayActiveLow: (process.env.RACKMANAGER_RELAY_ACTIVE_LOW || 'false').toLowerCase() === 'true',
  gpioCommand: process.env.RACKMANAGER_GPIO_COMMAND || 'pinctrl',
  demoMode: (process.env.DEMO_MODE || 'true').toLowerCase() !== 'false',
  staticDirectory: path.join(__dirname, '..', 'public'),
});
