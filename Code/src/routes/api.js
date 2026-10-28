'use strict';

const express = require('express');
const config = require('../config');
const { getStatus } = require('../services/statusService');
const { getUpdateStatus } = require('../services/updateService');
const { getDevices, saveDevice, deleteDevice } = require('../services/deviceService');
const { getEvents, addEvent, clearEvents } = require('../services/eventService');
const { getAutomations, saveAutomation, deleteAutomation, setAutomationEnabled } = require('../services/automationService');
const { executeCommand } = require('../services/commandService');
const { registerAnnouncement, processIncomingCommand } = require('../services/multimaxMessageService');

const router = express.Router();
router.get('/health', (_request, response) => response.json({ ok: true, name: 'RackManager', timestamp: new Date().toISOString() }));
router.get('/status', (_request, response) => response.json(getStatus()));
router.get('/config', (_request, response) => response.json({
  demoMode: config.demoMode,
  updateIntervalMs: config.updateIntervalMs,
  deviceOfflineTimeoutMs: config.deviceOfflineTimeoutMs,
  multiMaxConfigured: Boolean(config.multiMaxPort),
  relayControlConfigured: config.relay1Gpio !== null && config.relay2Gpio !== null,
}));
router.get('/update-status', async (_request, response) => response.json(await getUpdateStatus()));

router.get('/devices', (_request, response) => response.json({ devices: getDevices() }));
router.post('/devices', (request, response) => {
  if (!request.body || typeof request.body !== 'object' || !request.body.name) {
    return response.status(400).json({ error: 'Nazwa urządzenia jest wymagana.' });
  }
  const device = saveDevice(request.body);
  addEvent({ title: 'Zapisano urządzenie', detail: `${device.name} (${device.id}) dodano do listy urządzeń.`, kind: 'green-dot' });
  return response.status(201).json({ device });
});
router.delete('/devices/:id', (request, response) => {
  if (!deleteDevice(request.params.id)) return response.status(404).json({ error: 'Nie znaleziono urządzenia.' });
  addEvent({ title: 'Usunięto urządzenie', detail: `Urządzenie ${request.params.id} usunięto z listy.`, kind: 'yellow-dot' });
  return response.json({ ok: true });
});

router.post('/multimax/message', (request, response) => {
  const message = request.body;
  if (!message || !['announce', 'command'].includes(message.type)) return response.status(400).json({ error: 'Nieobsługiwany komunikat MultiMax.' });
  try {
    if (message.type === 'announce') {
      const device = registerAnnouncement(message.device, message.address);
      return response.status(201).json({ ok: true, device });
    }
    const device = processIncomingCommand(message.deviceId, message.command, message.payload, message.address);
    return response.json({ ok: true, accepted: true, deviceId: device.id });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});

router.post('/relays/:relay', async (request, response) => {
  if (!['relay1', 'relay2'].includes(request.params.relay) || typeof request.body?.state !== 'boolean') {
    return response.status(400).json({ error: 'Podaj przekaźnik i nowy stan true/false.' });
  }
  const result = await executeCommand('rackmanager', request.params.relay, request.body.state ? 'on' : 'off');
  if (!result.ok) {
    addEvent({ title: 'Nie udało się sterować przekaźnikiem', detail: `${request.params.relay}: ${result.error}`, kind: 'yellow-dot' });
    return response.status(503).json({ error: result.error });
  }
  addEvent({ title: 'Zmieniono stan przekaźnika', detail: `${request.params.relay}: ${request.body.state ? 'włączony' : 'wyłączony'}.`, kind: 'green-dot' });
  return response.json({ ok: true, state: request.body.state });
});

router.get('/events', (_request, response) => response.json({ events: getEvents() }));
router.post('/events', (request, response) => {
  if (!request.body?.title) return response.status(400).json({ error: 'Tytuł zdarzenia jest wymagany.' });
  const kind = ['green-dot', 'yellow-dot', 'blue-dot', 'red-dot'].includes(request.body.kind) ? request.body.kind : 'blue-dot';
  return response.status(201).json({ event: addEvent({ ...request.body, kind }) });
});
router.delete('/events', (_request, response) => {
  clearEvents();
  return response.json({ ok: true });
});

router.get('/automations', (_request, response) => response.json({ automations: getAutomations() }));
router.post('/automations', (request, response) => {
  const input = request.body;
  if (!input || !String(input.name || '').trim() || !input.trigger || !input.target || !input.command) {
    return response.status(400).json({ error: 'Nazwa, warunek, urządzenie i komenda są wymagane.' });
  }
  if (!['temperature', 'door', 'schedule', 'device-command'].includes(input.trigger)) return response.status(400).json({ error: 'Nieobsługiwany warunek automatyzacji.' });
  if (input.trigger === 'temperature' && (!['extTemp', 'intTemp1', 'intTemp2'].includes(input.sensor) || !['gt', 'lt'].includes(input.operator) || !Number.isFinite(Number(input.threshold)))) {
    return response.status(400).json({ error: 'Warunek temperatury jest nieprawidłowy.' });
  }
  if (input.trigger === 'schedule' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time || '')) return response.status(400).json({ error: 'Podaj prawidłową godzinę.' });
  if (input.trigger === 'device-command') {
    const sourceDevice = getDevices().find((device) => String(device.id) === String(input.sourceDevice));
    const commands = Array.isArray(sourceDevice?.commands) ? sourceDevice.commands : [];
    const sourceKnown = commands.some((entry) => String(typeof entry === 'string' ? entry : entry.id || entry.command || entry.name) === String(input.sourceCommand));
    if (!sourceDevice || !sourceKnown) return response.status(400).json({ error: 'Wybierz urządzenie i komendę z jego ogłoszonej listy.' });
  }
  if (input.target === 'rackmanager') {
    if (!['relay1', 'relay2'].includes(input.command) || !['on', 'off', 'toggle'].includes(input.action)) return response.status(400).json({ error: 'Nieprawidłowa komenda przekaźnika.' });
  } else {
    const deviceId = String(input.target).startsWith('device:') ? String(input.target).slice(7) : '';
    const device = getDevices().find((item) => String(item.id) === deviceId);
    const commands = device?.commands || device?.availableCommands || [];
    const knownCommand = Array.isArray(commands) && commands.some((entry) => String(typeof entry === 'string' ? entry : entry.id || entry.command || entry.name) === String(input.command));
    if (!device || !knownCommand || input.action !== 'execute') return response.status(400).json({ error: 'Urządzenie lub jego komenda nie jest dostępna.' });
  }
  const automation = saveAutomation(input);
  addEvent({ title: 'Zapisano automatyzację', detail: `${automation.name} jest zapisana po stronie serwera.`, kind: 'green-dot' });
  return response.status(201).json({ automation });
});
router.patch('/automations/:id', (request, response) => {
  const automation = setAutomationEnabled(request.params.id, request.body?.enabled);
  if (!automation) return response.status(404).json({ error: 'Nie znaleziono automatyzacji.' });
  addEvent({ title: automation.enabled ? 'Włączono automatyzację' : 'Wyłączono automatyzację', detail: automation.name, kind: automation.enabled ? 'green-dot' : 'yellow-dot' });
  return response.json({ automation });
});
router.delete('/automations/:id', (request, response) => {
  if (!deleteAutomation(request.params.id)) return response.status(404).json({ error: 'Nie znaleziono automatyzacji.' });
  addEvent({ title: 'Usunięto automatyzację', detail: request.params.id, kind: 'yellow-dot' });
  return response.json({ ok: true });
});

module.exports = router;
