'use strict';

const { setRelayState, readRelayState } = require('./relayService');

async function executeCommand(target, command, action, parameters = {}) {
  try {
    if (target === 'rackmanager') {
      let state = action === 'on';
      if (action === 'toggle') state = !readRelayState(command);
      return { ok: true, state: setRelayState(command, state) };
    }
    const deviceId = String(target).startsWith('device:') ? String(target).slice(7) : '';
    if (!deviceId || action !== 'execute') return { ok: false, error: 'Nieprawidłowy cel lub działanie komendy.' };
    const transport = require('./multimaxTransport');
    const result = await transport.sendDeviceCommand(deviceId, command, action, parameters);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { executeCommand };
