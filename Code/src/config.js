'use strict';

const path = require('node:path');
const fs = require('node:fs');

const envFile = path.join(__dirname, '..', '.env');

// Wczytanie .env
try {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);

    if (!match || Object.hasOwn(process.env, match[1])) continue;

    process.env[match[1]] = match[2].replace(
      /^(?:"(.*)"|'(.*)')$/,
      (_whole, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted
    );
  }
} catch {
  // .env jest opcjonalny
}

function getBoolean(value, fallback = false) {
  if (value === undefined) return fallback;

  return ['true', '1', 'yes', 'on'].includes(
    String(value).toLowerCase()
  );
}

function getNumber(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isInteger(number) || number < min || number > max) {
    return fallback;
  }

  return number;
}

function getString(value, fallback = '') {
  return value !== undefined ? String(value) : fallback;
}

// Automatyczna konfiguracja na podstawie .env
const config = {};

for (const [key, value] of Object.entries(process.env)) {
  config[key] = value;
}

// Konfiguracja ze sprawdzonymi typami i wartościami domyślnymi
Object.assign(config, {
  host: getString(process.env.HOST, '0.0.0.0'),
  port: getNumber(process.env.PORT, 8080, 1, 65535),

  updateIntervalMs: getNumber(process.env.UPDATE_INTERVAL_MS, 2000, 500, 60000),

  multiMaxPort: getString(
    process.env.MULTIMAX_PORT,
    process.platform === 'linux' && fs.existsSync('/dev/serial0') ? '/dev/serial0' : ''),

  multiMaxBaudRate: getNumber(process.env.MULTIMAX_BAUD_RATE, 115200, 1200, 1000000),
  multiMaxAddress: getNumber(process.env.MULTIMAX_GATEWAY_ADDRESS, 0, 0, 65534),
  multiMaxDirectionGpio: getNumber(process.env.MULTIMAX_REDE_GPIO, 18, 0, 53),
  deviceOfflineTimeoutMs: getNumber(process.env.DEVICE_OFFLINE_TIMEOUT_MS, 30000, 2000, 3600000),

  relay1Gpio: getNumber(process.env.RELAY1_GPIO, 23, 0, 53),
  relay2Gpio: getNumber(process.env.RELAY2_GPIO, 22, 0, 53),
  doorGpio: getNumber(process.env.DOOR_GPIO, 25, 0, 53),
  relayActiveLow: getBoolean(process.env.RELAY_ACTIVE_LOW),

  gpioChip: getString(process.env.GPIO_CHIP, '/dev/gpiochip0'),


  powerBtnGpio: getNumber(process.env.POWER_BTN_GPIO, 24, 0, 53),
  powerLedGpio: getNumber(process.env.POWER_LED_GPIO, 5, 0, 53),
  okLedGpio: getNumber(process.env.OK_LED_GPIO, 6, 0, 53),
  actLedGpio: getNumber(process.env.ACT_LED_GPIO, 13, 0, 53),
  tmDioGpio: getNumber(process.env.TM_DIO_GPIO, 27, 0, 53),
  tmClkGpio: getNumber(process.env.TM_CLK_GPIO, 17, 0, 53),
  
  buzzerGpio: getNumber(process.env.BUZZER_GPIO, 12, 0, 53),
  buzzerActiveLowGpio: getBoolean(process.env.BUZZER_ACTIVE_LOW),


  staticDirectory: path.join(__dirname, '..', 'public'),
});

module.exports = Object.freeze(config);