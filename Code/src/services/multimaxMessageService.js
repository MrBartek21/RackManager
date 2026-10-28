'use strict';

const { getDevices, saveDevice } = require('./deviceService');
const { addEvent } = require('./eventService');
const { processDeviceCommand } = require('./automationService');

function registerAnnouncement(input, address) {
  if (!input?.id || !input?.name || !input?.type || !Array.isArray(input.commands)) {
    throw new Error('Ogłoszenie urządzenia musi zawierać id, name, type i tablicę commands.');
  }
  if (address !== undefined && (!Number.isInteger(Number(address)) || Number(address) < 1 || Number(address) > 65534)) {
    throw new Error('Adres MultiMax musi należeć do zakresu 1–65534.');
  }
  const existing = getDevices();
  if (address !== undefined) {
    const conflict = existing.find((device) => String(device.id) !== String(input.id)
      && Number.parseInt(String(device.address), 0) === Number(address));
    if (conflict) throw new Error(`Adres ${address} jest już przypisany do urządzenia ${conflict.id}.`);
  }
  const previous = existing.find((device) => String(device.id) === String(input.id));
  const device = saveDevice({
    ...input,
    protocol: 'MultiMax',
    protocolVersion: 1,
    interface: 'RS-485',
    example: false,
    ...(address === undefined ? {} : { address: `0x${Number(address).toString(16).padStart(2, '0')}` }),
    status: 'online',
    lastSeen: new Date().toISOString(),
  });
  if (!previous) addEvent({ title: 'Wykryto urządzenie MultiMax', detail: `${device.name} (${device.id}) zgłosiło ${device.commands.length} komend.`, kind: 'green-dot' });
  else if (JSON.stringify(previous.commands) !== JSON.stringify(device.commands)) addEvent({ title: 'Zmieniono komendy urządzenia', detail: `${device.name} zgłosiło nową listę komend.`, kind: 'blue-dot' });
  return device;
}

function processIncomingCommand(deviceId, command, payload = {}, address) {
  if (!deviceId || !command) throw new Error('Komunikat command wymaga deviceId i command.');
  const device = getDevices().find((item) => String(item.id) === String(deviceId));
  if (!device) throw new Error('Urządzenie nie zostało wcześniej ogłoszone.');
  if (address !== undefined && Number.parseInt(String(device.address), 0) !== Number(address)) throw new Error('Adres ramki nie zgadza się z adresem zapisanego urządzenia.');
  const commands = Array.isArray(device.commands) ? device.commands : [];
  const knownCommand = commands.some((entry) => String(typeof entry === 'string' ? entry : entry.id || entry.command || entry.name) === String(command));
  if (!knownCommand) throw new Error('Urządzenie wysłało komendę spoza ogłoszonej listy.');
  saveDevice({ ...device, status: 'online', lastSeen: new Date().toISOString() });
  addEvent({ title: 'Odebrano komendę MultiMax', detail: `${device.name}: ${command}.`, kind: 'blue-dot' });
  processDeviceCommand(deviceId, command, payload);
  return device;
}

function updateDeviceHeartbeat(deviceId, state, address) {
  const device = getDevices().find((item) => String(item.id) === String(deviceId));
  if (!device) return null;
  if (address !== undefined && Number.parseInt(String(device.address), 0) !== Number(address)) return null;
  return saveDevice({ ...device, ...(state && typeof state === 'object' ? { state } : {}), status: 'online', lastSeen: new Date().toISOString() });
}

module.exports = { registerAnnouncement, processIncomingCommand, updateDeviceHeartbeat };
