
'use strict';

const config = require('../config');

const DIO_GPIO = config.tmDioGpio ?? 27;
const CLK_GPIO = config.tmClkGpio ?? 16;

// --------------------------------------------------
// Stan
// --------------------------------------------------

let RIO = null;
let dio = null;
let clk = null;

let initialized = false;
let initPromise = null;
let brightness = 7;

let operationQueue = Promise.resolve();

// --------------------------------------------------
// Znaki TM1637
// --------------------------------------------------

// Segmenty: A B C D E F G
const CHARACTERS = {
  '0': 0x3f,
  '1': 0x06,
  '2': 0x5b,
  '3': 0x4f,
  '4': 0x66,
  '5': 0x6d,
  '6': 0x7d,
  '7': 0x07,
  '8': 0x7f,
  '9': 0x6f,

  'A': 0x77,
  'B': 0x7c,
  'C': 0x39,
  'D': 0x5e,
  'E': 0x79,
  'F': 0x71,

  'a': 0x5f,
  'b': 0x7c,
  'c': 0x58,
  'd': 0x5e,
  'e': 0x7b,
  'f': 0x71,

  'H': 0x76,
  'h': 0x74,
  'L': 0x38,
  'l': 0x30,
  'n': 0x54,
  'o': 0x5c,
  'P': 0x73,
  'r': 0x50,
  'S': 0x6d,
  't': 0x78,
  'U': 0x3e,
  'u': 0x1c,
  'Y': 0x6e,

  '-': 0x40,
  '_': 0x08,
  ' ': 0x00,
};

// --------------------------------------------------
// Pomocnicze
// --------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function enqueue(operation) {
  const result = operationQueue.then(operation);

  // Błąd jednej operacji nie blokuje kolejnych.
  operationQueue = result.catch(error => {
    console.error('[DISPLAY] Błąd:', error.message);
  });

  return result;
}

// --------------------------------------------------
// Inicjalizacja GPIO
// --------------------------------------------------

async function ensureInit() {
  if (initialized) return;

  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const gpioModule = await import('rpi-io');

    RIO = gpioModule.RIO;

    dio = new RIO(DIO_GPIO, 'output', { value: 1 });
    clk = new RIO(CLK_GPIO, 'output', { value: 1 });

    await sleep(20);

    initialized = true;

    console.log(
      `[DISPLAY] TM1637 uruchomiony: DIO=${DIO_GPIO}, CLK=${CLK_GPIO}`
    );
  })();

  try {
    await initPromise;
  } catch (error) {
    initialized = false;
    throw error;
  } finally {
    initPromise = null;
  }
}

// --------------------------------------------------
// GPIO – komunikacja TM1637
// --------------------------------------------------

async function startTransmission() {
  clk.write(1);
  dio.write(1);

  await sleep(0);

  dio.write(0);

  await sleep(0);

  clk.write(0);
}

async function stopTransmission() {
  clk.write(0);
  dio.write(0);

  await sleep(0);

  clk.write(1);

  await sleep(0);

  dio.write(1);

  await sleep(0);
}

// Odczyt ACK wymaga przełączenia DIO na wejście.
async function readAck() {
  dio.close();

  dio = new RIO(DIO_GPIO, 'input');

  clk.write(1);
  await sleep(0);

  const ack = dio.read();

  clk.write(0);

  dio.close();

  dio = new RIO(DIO_GPIO, 'output', { value: 1 });

  return ack === 0;
}

async function writeByte(value) {
  for (let i = 0; i < 8; i++) {
    clk.write(0);

    dio.write((value >> i) & 1);

    await sleep(0);

    clk.write(1);

    await sleep(0);
  }

  clk.write(0);

  await readAck();
}

async function sendCommand(command) {
  await startTransmission();
  await writeByte(command);
  await stopTransmission();
}

// --------------------------------------------------
// Wysyłanie danych
// --------------------------------------------------

async function writeDisplayData(data) {
  // Automatyczne zwiększanie adresu.
  await sendCommand(0x40);

  await startTransmission();

  // Adres pierwszej cyfry.
  await writeByte(0xC0);

  for (const value of data) {
    await writeByte(value);
  }

  await stopTransmission();

  // Włączenie wyświetlacza i jasność.
  await sendCommand(0x88 | brightness);
}

function encodeCharacter(character) {
  return CHARACTERS[character] ?? 0x00;
}

// --------------------------------------------------
// Konwersja tekstu na segmenty
// --------------------------------------------------

function encodeText(text, options = {}) {
  const data = [];
  const dots = new Set(options.dots || []);

  const value = String(text);

  for (const character of value) {
    if (character === '.') {
      if (data.length > 0) {
        dots.add(data.length - 1);
      }
      continue;
    }

    if (character === ':') {
      // Dwukropek jest osobną funkcją,
      // ale fizycznie korzysta z DP drugiej cyfry.
      if (data.length < 4) {
        dots.add(1);
      }
      continue;
    }

    if (data.length >= 4) break;

    data.push(encodeCharacter(character));
  }

  while (data.length < 4) {
    data.push(0x00);
  }

  // Kropki dziesiętne.
  for (const index of dots) {
    if (index >= 0 && index < 4) {
      data[index] |= 0x80;
    }
  }

  // Dwukropek z opcji jest niezależny od kropek w tekście.
  if (options.colon) {
    data[1] |= 0x80;
  }

  return data;
}

// --------------------------------------------------
// Wyświetlanie
// --------------------------------------------------

async function displayInternal(text, options = {}) {
  await ensureInit();

  const data = encodeText(text, options);

  await writeDisplayData(data);
}

function display(text, options = {}) {
  return enqueue(() => displayInternal(text, options));
}

function showNumber(number, options = {}) {
  return display(String(number), options);
}

function showTime(hours, minutes, blink = false) {
  const text =
    String(hours).padStart(2, '0') +
    String(minutes).padStart(2, '0');

  return display(text, {
    colon: !blink || Math.floor(Date.now() / 500) % 2 === 0,
  });
}

// --------------------------------------------------
// Jasność
// --------------------------------------------------

async function setBrightnessInternal(level) {
  await ensureInit();

  brightness = Math.max(0, Math.min(7, Math.round(level)));

  await sendCommand(0x88 | brightness);

  return brightness;
}

function setBrightness(level) {
  return enqueue(() => setBrightnessInternal(level));
}

// --------------------------------------------------
// Czyszczenie
// --------------------------------------------------

async function clearInternal() {
  await displayInternal('    ');
}

function clear() {
  return enqueue(clearInternal);
}

// --------------------------------------------------
// Przewijanie tekstu
// --------------------------------------------------

async function scrollInternal(text, interval = 300) {
  const value = String(text);

  const padded = '    ' + value + '    ';

  for (let i = 0; i <= padded.length - 4; i++) {
    const part = padded.substring(i, i + 4);

    await displayInternal(part);

    await sleep(interval);
  }
}

function scroll(text, interval = 300) {
  return enqueue(() => scrollInternal(text, interval));
}

// --------------------------------------------------
// Animacja startup
// --------------------------------------------------

async function startupInternal() {
  await ensureInit();

  // Wyczyszczenie ekranu.
  await clearInternal();
  await sleep(150);

  // Zapalanie kolejnych cyfr.
  for (let i = 0; i < 4; i++) {
    const data = [0, 0, 0, 0];

    for (let j = 0; j <= i; j++) {
      data[j] = 0x7f;
    }

    await writeDisplayData(data);
    await sleep(180);
  }

  // Krótkie miganie.
  for (let i = 0; i < 2; i++) {
    await displayInternal('BOOT');
    await sleep(250);

    await clearInternal();
    await sleep(150);
  }

  // Końcowy napis.
  await displayInternal('RDY.');
}

function startup() {
  return enqueue(startupInternal);
}

// --------------------------------------------------
// Wyświetlanie surowych segmentów
// --------------------------------------------------

async function showSegmentsInternal(segments) {
  await ensureInit();

  if (!Array.isArray(segments) || segments.length !== 4) {
    throw new Error('Podaj dokładnie 4 wartości segmentów.');
  }

  const data = segments.map(value => Number(value) & 0xff);

  await writeDisplayData(data);
}

function showSegments(segments) {
  return enqueue(() => showSegmentsInternal(segments));
}

// --------------------------------------------------
// Zamykanie
// --------------------------------------------------

async function shutdownInternal() {
  if (!initialized) return;

  await clearInternal();

  dio.close();
  clk.close();

  dio = null;
  clk = null;

  initialized = false;
}

function shutdown() {
  return enqueue(shutdownInternal);
}

// --------------------------------------------------
// Status
// --------------------------------------------------

function getStatus() {
  return {
    initialized,
    brightness,
    dioGpio: DIO_GPIO,
    clkGpio: CLK_GPIO,
  };
}

// --------------------------------------------------
// Eksport
// --------------------------------------------------

module.exports = {
  init: ensureInit,
  display,
  showNumber,
  showTime,
  showSegments,
  setBrightness,
  clear,
  scroll,
  startup,
  shutdown,
  getStatus,
};
