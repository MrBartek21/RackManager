'use strict';

const { randomUUID } = require('node:crypto');
const { readCollection, writeCollection } = require('./jsonFileStore');
const FILE = 'events.json';
const MAX_EVENTS = 5000;

function getEvents() { return readCollection(FILE); }

function addEvent(input) {
  const event = {
    id: randomUUID(),
    title: String(input.title || 'Zdarzenie'),
    detail: String(input.detail || ''),
    kind: String(input.kind || 'blue-dot'),
    at: input.at || new Date().toISOString(),
  };
  const events = getEvents();
  events.unshift(event);
  writeCollection(FILE, events.slice(0, MAX_EVENTS));
  return event;
}

function clearEvents() { writeCollection(FILE, []); }

module.exports = { getEvents, addEvent, clearEvents };
