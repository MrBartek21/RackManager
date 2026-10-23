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

module.exports = Object.freeze({
  host: process.env.HOST || '0.0.0.0',
  port: integerFromEnv('PORT', 3000, 1, 65535),
  updateIntervalMs: integerFromEnv('UPDATE_INTERVAL_MS', 2000, 500, 60000),
  demoMode: (process.env.DEMO_MODE || 'true').toLowerCase() !== 'false',
  staticDirectory: path.join(__dirname, '..', 'public'),
});
