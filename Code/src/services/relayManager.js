'use strict';

const { spawn } = require('node:child_process');
const config = require('../config');

const relays = {
  1: {
    gpio: config.relay1Gpio,
    state: false,
    process: null,
  },
  2: {
    gpio: config.relay2Gpio,
    state: false,
    process: null,
  },
};

function setRelay(id, state) {
  const relay = relays[id];

  if (!relay) {
    throw new Error(`Nieznany przekaźnik: ${id}`);
  }

  state = Boolean(state);

  // Nie uruchamiaj ponownie, jeśli stan już jest ustawiony.
  if (relay.state === state && relay.process) {
    return relay.state;
  }

  // Zwolnij poprzednie żądanie GPIO.
  if (relay.process) {
    relay.process.kill('SIGTERM');
    relay.process = null;
  }

  const level = state ? '1' : '0';

  const child = spawn('gpioset', [
    '-c',
    config.gpioChip,
    `${relay.gpio}=${level}`,
  ]);

  relay.process = child;
  relay.state = state;

  child.on('error', (error) => {
    console.error(`[RELAY ${id}] Błąd GPIO:`, error.message);

    if (relay.process === child) {
      relay.process = null;
    }
  });

  child.on('close', (code) => {
    if (relay.process === child) {
      relay.process = null;
      console.error(`[RELAY ${id}] Proces zakończony, kod: ${code}`);
    }
  });

  console.log(`[RELAY ${id}] GPIO ${relay.gpio} -> ${state ? 'ON' : 'OFF'}`);

  return relay.state;
}

function toggleRelay(id) {
  const relay = relays[id];

  if (!relay) {
    throw new Error(`Nieznany przekaźnik: ${id}`);
  }

  return setRelay(id, !relay.state);
}

function getRelayState(id) {
  const relay = relays[id];

  if (!relay) {
    throw new Error(`Nieznany przekaźnik: ${id}`);
  }

  return relay.state;
}

function getAllRelayStates() {
  return Object.fromEntries(
    Object.entries(relays).map(([id, relay]) => [
      id,
      relay.state,
    ])
  );
}

module.exports = {
  setRelay,
  toggleRelay,
  getRelayState,
  getAllRelayStates,
};