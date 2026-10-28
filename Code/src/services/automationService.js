'use strict';

const { randomUUID } = require('node:crypto');
const { readCollection, writeCollection } = require('./jsonFileStore');
const { addEvent } = require('./eventService');
const { executeCommand } = require('./commandService');
const FILE = 'automations.json';
const lastConditionState = new Map();
const lastScheduleRun = new Map();

function getAutomations() { return readCollection(FILE); }

function saveAutomation(input) {
  const automation = {
    ...input,
    id: String(input.id || randomUUID()),
    name: String(input.name || 'Nowa automatyzacja').slice(0, 100),
    enabled: input.enabled !== false,
    updatedAt: new Date().toISOString(),
  };
  const items = getAutomations();
  const index = items.findIndex((item) => item.id === automation.id);
  if (index >= 0) items[index] = { ...items[index], ...automation };
  else items.push(automation);
  writeCollection(FILE, items);
  return automation;
}

function deleteAutomation(id) {
  const items = getAutomations();
  const next = items.filter((item) => item.id !== id);
  writeCollection(FILE, next);
  lastConditionState.delete(id);
  lastScheduleRun.delete(id);
  return next.length !== items.length;
}

function setAutomationEnabled(id, enabled) {
  const items = getAutomations();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  items[index].enabled = Boolean(enabled);
  items[index].updatedAt = new Date().toISOString();
  writeCollection(FILE, items);
  lastConditionState.delete(id);
  return items[index];
}

function isTriggered(rule, system, peripherals, now) {
  if (rule.trigger === 'temperature') {
    const value = peripherals[rule.sensor];
    if (!Number.isFinite(value) || !Number.isFinite(Number(rule.threshold))) return false;
    return rule.operator === 'lt' ? value < Number(rule.threshold) : value > Number(rule.threshold);
  }
  if (rule.trigger === 'door') return peripherals.door === Boolean(rule.doorState);
  if (rule.trigger === 'schedule') {
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const key = `${day}:${rule.time}`;
    const current = now.toTimeString().slice(0, 5);
    if (current !== rule.time || lastScheduleRun.get(rule.id) === key) return false;
    lastScheduleRun.set(rule.id, key);
    return true;
  }
  return false;
}

function processAutomations(system, peripherals, now = new Date()) {
  for (const rule of getAutomations()) {
    if (!rule.enabled) continue;
    const triggered = isTriggered(rule, system, peripherals, now);
    if (!triggered) {
      if (rule.trigger !== 'schedule') lastConditionState.set(rule.id, false);
      continue;
    }
    if (lastConditionState.get(rule.id)) continue;
    lastConditionState.set(rule.id, true);
    void runRule(rule, `warunek ${rule.trigger} spełniony`);
  }
}

function processDeviceCommand(deviceId, command, payload) {
  for (const rule of getAutomations()) {
    if (!rule.enabled || rule.trigger !== 'device-command') continue;
    if (String(rule.sourceDevice) !== String(deviceId) || String(rule.sourceCommand) !== String(command)) continue;
    void runRule(rule, `odebrano komendę ${command}`);
  }
}

async function runRule(rule, reason) {
  const result = await executeCommand(rule.target, rule.command, rule.action, rule.parameters);
  addEvent({
    title: result.ok ? 'Wykonano automatyzację' : 'Komenda automatyzacji niewykonana',
    detail: `${rule.name}: ${reason}; ${result.ok ? 'komendę wykonano.' : result.error}`,
    kind: result.ok ? 'green-dot' : 'yellow-dot',
  });
}

module.exports = { getAutomations, saveAutomation, deleteAutomation, setAutomationEnabled, processAutomations, processDeviceCommand };
