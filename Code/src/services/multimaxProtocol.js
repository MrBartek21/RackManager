'use strict';

const MAGIC = Buffer.from([0xaa, 0x55]);
const VERSION = 1;
const HEADER_SIZE = 12;
const MAX_PAYLOAD = 4096;
const MESSAGE = Object.freeze({
  DISCOVER: 0x01,
  ANNOUNCE_ACK: 0x02,
  ANNOUNCE: 0x10,
  HEARTBEAT: 0x11,
  COMMAND: 0x20,
  COMMAND_ACK: 0x21,
  EXECUTE: 0x30,
  RESULT: 0x31,
  READ_STATE: 0x40,
  STATE: 0x41,
});

function crc16(buffer) {
  let crc = 0xffff;
  for (const byte of buffer) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function encodeFrame({ destination, source = 0, type, sequence = 0, payload = {} }) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  if (body.length > MAX_PAYLOAD) throw new RangeError(`MultiMax payload exceeds ${MAX_PAYLOAD} bytes.`);
  const frame = Buffer.alloc(HEADER_SIZE + body.length + 2);
  MAGIC.copy(frame, 0);
  frame[2] = VERSION;
  frame.writeUInt16BE(destination, 3);
  frame.writeUInt16BE(source, 5);
  frame[7] = type;
  frame.writeUInt16BE(sequence, 8);
  frame.writeUInt16BE(body.length, 10);
  body.copy(frame, HEADER_SIZE);
  frame.writeUInt16BE(crc16(frame.subarray(2, HEADER_SIZE + body.length)), HEADER_SIZE + body.length);
  return frame;
}

function takeFrames(input) {
  let buffer = input;
  const frames = [];
  while (buffer.length >= HEADER_SIZE + 2) {
    const start = buffer.indexOf(MAGIC);
    if (start < 0) return { frames, rest: buffer.subarray(Math.max(0, buffer.length - 1)) };
    if (start > 0) buffer = buffer.subarray(start);
    if (buffer.length < HEADER_SIZE + 2) break;
    const length = buffer.readUInt16BE(10);
    if (length > MAX_PAYLOAD) { buffer = buffer.subarray(2); continue; }
    const frameLength = HEADER_SIZE + length + 2;
    if (buffer.length < frameLength) break;
    const content = buffer.subarray(2, HEADER_SIZE + length);
    const expectedCrc = buffer.readUInt16BE(HEADER_SIZE + length);
    if (buffer[2] !== VERSION || crc16(content) !== expectedCrc) { buffer = buffer.subarray(2); continue; }
    try {
      frames.push({
        destination: buffer.readUInt16BE(3),
        source: buffer.readUInt16BE(5),
        type: buffer[7],
        sequence: buffer.readUInt16BE(8),
        payload: JSON.parse(buffer.subarray(HEADER_SIZE, HEADER_SIZE + length).toString('utf8')),
      });
    } catch { /* Nieprawidłowy JSON w ramce jest pomijany. */ }
    buffer = buffer.subarray(frameLength);
  }
  return { frames, rest: buffer };
}

module.exports = { MESSAGE, VERSION, MAX_PAYLOAD, encodeFrame, takeFrames, crc16 };
