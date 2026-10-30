
'use strict';

const { spawn } = require('node:child_process');
const config = require('../config');

// --------------------------------------------------
// Konfiguracja
// --------------------------------------------------

const gpio = config.buzzerGpio ?? 12;
const gpioChip = config.gpioChip || '/dev/gpiochip0';

const activeLow =
  String(config.buzzerActiveLowGpio ?? 'false').toLowerCase() === 'true';

// --------------------------------------------------
// Stan
// --------------------------------------------------

let gpioProcess = null;
let currentPlayback = null;
let queue = [];

let playing = false;
let initialized = false;
let stopping = false;

// --------------------------------------------------
// Pomocnicze
// --------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getGpioLevel(enabled) {
  const active = activeLow ? !enabled : enabled;
  return active ? '1' : '0';
}

// --------------------------------------------------
// GPIO
// --------------------------------------------------

function releaseGpio() {
  return new Promise((resolve) => {
    const child = gpioProcess;

    if (!child) {
      initialized = false;
      return resolve();
    }

    gpioProcess = null;
    initialized = false;

    if (child.exitCode !== null || child.signalCode !== null) {
      return resolve();
    }

    child.once('close', resolve);
    child.kill('SIGTERM');
  });
}

async function writeBuzzer(enabled) {
  // Zakończ poprzedni proces i zwolnij GPIO.
  await releaseGpio();

  const level = getGpioLevel(enabled);

  const child = spawn('gpioset', [
    '--banner',
    '-c',
    gpioChip,
    `${gpio}=${level}`,
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  gpioProcess = child;

  await new Promise((resolve, reject) => {
    let started = false;
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      fail(new Error('Przekroczono czas uruchamiania gpioset.'));
      child.kill('SIGTERM');
    }, 2000);

    function cleanup() {
      clearTimeout(timeout);
    }

    function succeed() {
      if (settled) return;

      settled = true;
      started = true;
      initialized = true;
      cleanup();
      resolve();
    }

    function fail(error) {
      if (settled) return;

      settled = true;
      cleanup();

      if (gpioProcess === child) {
        gpioProcess = null;
        initialized = false;
      }

      reject(error);
    }

    child.stdout.on('data', () => {
      // --banner pojawia się po poprawnym przejęciu GPIO.
      succeed();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.once('error', (error) => {
      if (!started) {
        fail(error);
      } else {
        console.error('[BUZZER] Błąd procesu:', error.message);
      }
    });

    child.once('close', (code, signal) => {
      if (gpioProcess === child) {
        gpioProcess = null;
        initialized = false;
      }

      if (!started) {
        fail(new Error(
          stderr.trim() || `gpioset zakończył się kodem ${code}, sygnał ${signal}`
        ));
      }
    });
  });
}

// --------------------------------------------------
// Melodie
// --------------------------------------------------

const melodies = {
  beep: [
    { on: true, duration: 120 },
  ],

  success: [
    { on: true, duration: 100 },
    { on: false, duration: 80 },
    { on: true, duration: 180 },
  ],

  warning: [
    { on: true, duration: 250 },
    { on: false, duration: 150 },
    { on: true, duration: 250 },
  ],

  alarm: [
    { on: true, duration: 500 },
    { on: false, duration: 250 },
    { on: true, duration: 500 },
    { on: false, duration: 250 },
    { on: true, duration: 500 },
  ],

  startup: [
    { on: true, duration: 80 },
    { on: false, duration: 70 },
    { on: true, duration: 80 },
    { on: false, duration: 70 },
    { on: true, duration: 180 },
    { on: false, duration: 250 },
    { on: true, duration: 400 },
    ],
};

// --------------------------------------------------
// Odtwarzanie
// --------------------------------------------------

async function playPattern(pattern) {
  for (const step of pattern) {
    if (currentPlayback?.cancelled || stopping) break;

    await writeBuzzer(step.on);
    await sleep(step.duration);
  }

  // Po zakończeniu melodii zawsze wyłącz buzzer.
  await writeBuzzer(false);
}

async function processQueue() {
  if (playing || stopping) return;

  playing = true;

  try {
    while (queue.length > 0 && !stopping) {
      const item = queue.shift();

      currentPlayback = item;

      let finishPlayback;

      item.done = new Promise((resolve) => {
        finishPlayback = resolve;
      });

      try {
        await playPattern(item.pattern);
      } catch (error) {
        console.error('[BUZZER] Błąd odtwarzania:', error.message);

        try {
          await writeBuzzer(false);
        } catch (gpioError) {
          console.error('[BUZZER] Nie udało się wyłączyć GPIO:', gpioError.message);
          await releaseGpio();
        }
      }

      currentPlayback = null;

      item.resolve();
      finishPlayback();
    }
  } finally {
    playing = false;

    // Obsługa elementów dodanych podczas kończenia odtwarzania.
    if (queue.length > 0 && !stopping) {
      processQueue();
    }
  }
}

// --------------------------------------------------
// Publiczne API
// --------------------------------------------------

function init() {
  // GPIO jest uruchamiane dopiero przy pierwszym odtworzeniu.
  return true;
}

function play(name) {
  const pattern = melodies[name];

  if (!pattern) {
    return Promise.reject(
      new Error(`Nieznana melodia: ${name}`)
    );
  }

  return playCustom(pattern);
}

function playCustom(pattern) {
  if (!Array.isArray(pattern) || pattern.length === 0) {
    return Promise.reject(
      new Error('Nieprawidłowa melodia.')
    );
  }

  for (const step of pattern) {
    if (
      typeof step.on !== 'boolean' ||
      !Number.isFinite(step.duration) ||
      step.duration < 1
    ) {
      return Promise.reject(
        new Error('Nieprawidłowy krok melodii.')
      );
    }
  }

  if (stopping) {
    return Promise.reject(
      new Error('Buzzer jest zatrzymywany.')
    );
  }

  return new Promise((resolve) => {
    queue.push({
      pattern,
      resolve,
      cancelled: false,
    });

    processQueue();
  });
}

async function stop() {
  stopping = true;

  // Usuń oczekujące melodie.
  queue.forEach((item) => item.resolve());
  queue = [];

  // Przerwij aktualną melodię.
  if (currentPlayback) {
    currentPlayback.cancelled = true;

    if (currentPlayback.done) {
      await currentPlayback.done;
    }
  }

  // Ustaw stan nieaktywny.
  try {
    await writeBuzzer(false);
  } catch (error) {
    console.error('[BUZZER] Błąd zatrzymywania:', error.message);
    await releaseGpio();
  }

  stopping = false;

  if (queue.length > 0) {
    processQueue();
  }
}

function getStatus() {
  return {
    initialized,
    playing,
    queued: queue.length,
    current: currentPlayback ? 'playing' : null,
  };
}

// --------------------------------------------------
// Eksport
// --------------------------------------------------

module.exports = {
  init,
  play,
  playCustom,
  stop,
  getStatus,
};
