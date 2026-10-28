'use strict';

const config = require('../config');
const gpio = require('./gpioService');

const relayPins = { relay1: config.relay1Gpio, relay2: config.relay2Gpio };

function readRelayState(relay) {
  const pin = relayPins[relay];
  if (pin === null || pin === undefined) return null;
  const level = gpio.read(pin);
  return level === null ? null : level !== config.relayActiveLow;
}

function readRelayStates() {
  return { relay1: readRelayState('relay1'), relay2: readRelayState('relay2') };
}

function setRelayState(relay, state) {
  const pin = relayPins[relay];
  if (!['relay1', 'relay2'].includes(relay)) throw new Error('Nieznany przekaźnik.');
  if (pin === null || pin === undefined) throw new Error(`Ustaw RACKMANAGER_${relay.toUpperCase()}_GPIO w pliku .env.`);
  const electricalHigh = Boolean(state) !== config.relayActiveLow;
  gpio.setOutput(pin, electricalHigh);
  const observed = readRelayState(relay);
  if (observed !== Boolean(state)) throw new Error(`GPIO ${pin} nie potwierdziło zmiany stanu.`);
  return observed;
}

module.exports = { readRelayState, readRelayStates, setRelayState };
