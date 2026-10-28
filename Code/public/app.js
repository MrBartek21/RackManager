'use strict';

const byId = (id) => document.getElementById(id);
//const histories = new Map();
const MAX_POINTS = 24;
let socket;
let reconnectTimer;
//let firstStatus = true;
let eventHistory = [];
let knownDevices = [];
let automations = [];
let automationTargetsSignature = '';
const relayStates = { relay1: null, relay2: null };

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return (bytes / 1024 ** 3).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
}

function formatMegabytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return (bytes / 1_000_000).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return 'Uptime: —';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `Uptime: ${days ? `${days} d ` : ''}${hours} godz. ${minutes} min`;
}

function updateClock() {
  const now = new Date();
  byId('clock').textContent = now.toLocaleTimeString('pl-PL');
}

async function updateGithubVersionStatus() {
  const label = byId('github-update-status');
  const dot = byId('github-update-dot');
  if (!label || !dot) return;
  try {
    const response = await fetch('/api/update-status', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Status GitHuba jest niedostępny');
    const result = await response.json();
    const isUpdateAvailable = result.state === 'update';
    label.textContent = isUpdateAvailable ? 'Dostępna aktualizacja' : 'Wersja aktualna';
    label.href = result.latestUrl || 'https://github.com/MrBartek21/RackManager';
    label.title = isUpdateAvailable ? 'Otwórz najnowszy commit na GitHubie' : 'Sprawdź repozytorium RackManager';
    dot.classList.toggle('update-available', isUpdateAvailable);
    dot.classList.toggle('up-to-date', result.state === 'current');
    dot.classList.toggle('checking', result.state === 'unavailable');
    if (result.state === 'unavailable') label.textContent = 'Nie można sprawdzić GitHuba';
  } catch {
    label.textContent = 'Nie można sprawdzić GitHuba';
    label.href = 'https://github.com/MrBartek21/RackManager';
    dot.classList.remove('update-available', 'up-to-date');
    dot.classList.add('checking');
  }
}

function setConnection(connected) {
  byId('connection').classList.toggle('connected', connected);
  byId('connection').classList.toggle('disconnected', !connected);
  byId('connection-label').textContent = connected ? 'Połączono' : 'Ponowne łączenie';
  byId('last-update').textContent = connected ? 'Dane na żywo' : 'Brak nowych danych';
}

function updateMetric(id, value, suffix = '') {
  byId(id).textContent = Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : '—';
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Błąd komunikacji z serwerem.');
  return result;
}

function drawEvent(event) {
  const item = document.createElement('div');
  item.className = 'event-item';
  const dot = document.createElement('span');
  dot.className = `event-dot ${event.kind || 'blue-dot'}`;
  const copy = document.createElement('span');
  copy.className = 'event-copy';
  const heading = document.createElement('strong');
  heading.textContent = event.title;
  const description = document.createElement('small');
  description.textContent = event.detail || '';
  copy.append(heading, description);
  const time = document.createElement('time');
  time.dateTime = event.at || event.timestamp || '';
  const date = new Date(event.at || event.timestamp);
  time.textContent = Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pl-PL');
  item.append(dot, copy, time);
  return item;
}

function renderEvents() {
  const recent = byId('event-list');
  if (recent) recent.replaceChildren(...eventHistory.slice(0, 5).map(drawEvent));
  const full = byId('all-event-list');
  if (full) full.replaceChildren(...eventHistory.map(drawEvent));
  const empty = byId('events-empty');
  if (empty) empty.hidden = eventHistory.length > 0;
}

async function addEvent(title, detail, kind = 'blue-dot') {
  try {
    const result = await apiRequest('/events', { method: 'POST', body: JSON.stringify({ title, detail, kind }) });
    eventHistory.unshift(result.event);
    renderEvents();
  } catch (error) {
    console.error('Nie udało się zapisać zdarzenia:', error);
  }
}

function renderDevices(devices = [], listId = 'device-list', emptyId = 'device-empty') {
  const list = byId(listId);
  const emptyState = byId(emptyId);
  list.replaceChildren();
  const items = Array.isArray(devices) ? devices : [];

  for (const device of items) {
    const card = document.createElement('article');
    card.className = 'network-device-card';

    const icon = document.createElement('span');
    icon.className = 'network-device-icon';
    const iconGlyph = document.createElement('i');
    iconGlyph.className = 'bi bi-motherboard';
    iconGlyph.setAttribute('aria-hidden', 'true');
    icon.append(iconGlyph);

    const details = document.createElement('div');
    details.className = 'network-device-details';
    const nameRow = document.createElement('div');
    nameRow.className = 'network-device-name-row';
    const name = document.createElement('strong');
    name.textContent = device.name || device.hostname || 'Urządzenie Multimax';
    nameRow.append(name);
    if (device.example) {
      const example = document.createElement('span');
      example.className = 'network-device-example';
      example.textContent = 'PRZYKŁAD';
      nameRow.append(example);
    }
    const metadata = document.createElement('div');
    metadata.className = 'network-device-metadata';
    const lastSeen = device.lastSeen ? new Date(device.lastSeen) : null;
    const lastSeenText = lastSeen && !Number.isNaN(lastSeen.getTime())
      ? lastSeen.toLocaleString('pl-PL')
      : device.lastSeen;
    /*const fields2 = [
      ['ID urządzenia', device.id],
      ['Typ', device.type],
      ['Firmware', device.firmwareVersion],
      ['Hardware', device.hardwareVersion],
      ['Protokół', device.protocol],
      ['Magistrala', device.interface],
      ['Adres RS-485', device.address],
      ['Numer seryjny', device.serialNumber],
      ['Ostatnia komunikacja', lastSeenText],
    ];*/

    const fields = [
      ['ID urządzenia', device.id],
      ['Typ', device.type],
      ['Firmware', device.firmwareVersion],
      ['Hardware', device.hardwareVersion],
      ['Adres RS-485', device.address],
      ['Ostatnia komunikacja', lastSeenText],
    ];

    for (const [label, value] of fields) {
      if (value === undefined || value === null || value === '') continue;
      const field = document.createElement('div');
      field.className = 'network-device-field';
      const fieldLabel = document.createElement('span');
      fieldLabel.textContent = label;
      const fieldValue = document.createElement('strong');
      fieldValue.textContent = String(value);
      field.append(fieldLabel, fieldValue);
      metadata.append(field);
    }
    const rawCommands = Array.isArray(device.commands || device.availableCommands) ? (device.commands || device.availableCommands) : [];
    if (rawCommands.length) {
      const commands = document.createElement('div');
      commands.className = 'network-device-commands';
      for (const entry of rawCommands) {
        const command = document.createElement('span');
        command.textContent = typeof entry === 'string' ? entry : entry.label || entry.title || entry.name || entry.id || entry.command;
        commands.append(command);
      }
      details.append(nameRow, metadata, commands);
    } else {
      details.append(nameRow, metadata);
    }

    const status = document.createElement('span');
    const online = device.status === 'online' || device.status === 'connected' || device.online === true;
    status.className = `network-device-status ${online ? 'is-online' : 'is-offline'}`;
    status.textContent = online ? 'ONLINE' : 'OFFLINE';
    card.append(icon, details, status);
    list.append(card);
  }

  list.hidden = items.length === 0;
  emptyState.hidden = items.length > 0;
  if (listId === 'device-list') {
    byId('node-count').textContent = `${items.length} ${items.length === 1 ? 'urządzenie' : 'urządzeń'}`;
    byId('device-count').textContent = String(items.length);
  }
}

function renderDeviceTable(devices = []) {
  const body = byId('device-table-body');
  if (!body) return;
  const items = Array.isArray(devices) ? devices : [];
  body.replaceChildren();
  for (const device of items) {
    const row = document.createElement('tr');
    const online = device.status === 'online' || device.status === 'connected' || device.online === true;
    const deviceCommands = Array.isArray(device.commands || device.availableCommands) ? (device.commands || device.availableCommands) : [];
    const values = [
      { text: online ? 'ONLINE' : 'OFFLINE', className: `network-device-status ${online ? 'is-online' : 'is-offline'}` },
      { text: device.name || device.hostname || 'Urządzenie MultiMax' },
      { text: device.id },
      { text: device.type },
      { text: device.firmwareVersion },
      { text: device.hardwareVersion },
      { text: device.protocol },
      { text: device.interface },
      { text: device.address },
      { text: device.serialNumber },
      { text: deviceCommands.map((command) => typeof command === 'string' ? command : command.label || command.name || command.id || command.command).join(', ') || '—' },
      { text: device.lastSeen ? new Date(device.lastSeen).toLocaleString('pl-PL') : '—' },
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value.text == null ? '—' : String(value.text);
      if (value.className) {
        const badge = document.createElement('span');
        badge.className = value.className;
        badge.textContent = value.text;
        cell.append(badge);
      }
      row.append(cell);
    }
    const actionCell = document.createElement('td');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.title = 'Usuń zapisane urządzenie';
    remove.setAttribute('aria-label', `Usuń urządzenie ${device.name || device.id}`);
    remove.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
    remove.addEventListener('click', async () => {
      if (!confirm(`Usunąć urządzenie ${device.name || device.id} z bazy?`)) return;
      try {
        await apiRequest(`/devices/${encodeURIComponent(device.id)}`, { method: 'DELETE' });
        await loadDeviceRecords();
      } catch (error) { alert(error.message); }
    });
    actionCell.append(remove);
    row.append(actionCell);
    body.append(row);
  }
  const empty = byId('device-table-empty');
  if (empty) empty.hidden = items.length > 0;
  const count = byId('devices-page-count');
  if (count) count.textContent = `${items.length} ${items.length === 1 ? 'urządzenie' : 'urządzeń'}`;
  const navCount = byId('device-count');
  if (navCount) navCount.textContent = String(items.length);
}

async function loadDeviceRecords() {
  const result = await apiRequest('/devices');
  const devices = result.devices || [];
  knownDevices = devices;
  if (byId('device-list')) renderDevices(devices);
  renderDeviceTable(devices);
  if (byId('automation-target')) refreshAutomationTargets(devices);
}

function refreshAutomationTargets(devices) {
  const target = byId('automation-target');
  knownDevices = Array.isArray(devices) ? devices : [];
  const signature = JSON.stringify(knownDevices.map((device) => [device.id, device.name, device.commands || device.availableCommands || []]));
  if (signature === automationTargetsSignature) return;
  automationTargetsSignature = signature;
  const selectedTarget = target.value || 'rackmanager';
  target.replaceChildren(new Option('RackManager', 'rackmanager'));
  for (const device of knownDevices) {
    const option = new Option(device.name || device.id || 'Urządzenie Multimax', `device:${device.id}`);
    target.add(option);
  }
  target.value = [...target.options].some((option) => option.value === selectedTarget) ? selectedTarget : 'rackmanager';
  byId('automation-target').dispatchEvent(new Event('change'));
  const source = byId('automation-source-device');
  if (source) {
    const selectedSource = source.value;
    source.replaceChildren();
    for (const device of knownDevices) source.add(new Option(device.name || device.id, String(device.id)));
    source.value = [...source.options].some((option) => option.value === selectedSource) ? selectedSource : source.options[0]?.value || '';
    updateSourceCommands();
  }
}

function updateSourceCommands() {
  const sourceDevice = byId('automation-source-device');
  const sourceCommand = byId('automation-source-command');
  if (!sourceDevice || !sourceCommand) return;
  sourceCommand.replaceChildren();
  const device = knownDevices.find((item) => String(item.id) === sourceDevice.value);
  const commands = Array.isArray(device?.commands) ? device.commands : [];
  for (const entry of commands) {
    const value = typeof entry === 'string' ? entry : entry.id || entry.command || entry.name;
    const label = typeof entry === 'string' ? entry : entry.label || entry.title || entry.name || value;
    if (value) sourceCommand.add(new Option(label, value));
  }
  if (!sourceCommand.options.length) sourceCommand.add(new Option('Brak zgłoszonych komend', ''));
}

function renderAutomations() {
  const list = byId('automation-list');
  list.replaceChildren();
  for (const automation of automations) {
    const card = document.createElement('article');
    card.className = 'panel automation-card';
    const summary = document.createElement('div');
    summary.className = 'automation-card-copy';
    const title = document.createElement('strong');
    title.textContent = automation.name;
    const detail = document.createElement('span');
    detail.textContent = `${automation.when} → ${automation.actionLabel}`;
    summary.append(title, detail);
    const controls = document.createElement('div');
    controls.className = 'automation-card-controls';
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'check-field';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = automation.enabled;
    toggle.setAttribute('aria-label', `Włącz automatyzację ${automation.name}`);
    toggle.addEventListener('change', () => {
      apiRequest(`/automations/${encodeURIComponent(automation.id)}`, { method: 'PATCH', body: JSON.stringify({ enabled: toggle.checked }) })
        .then(({ automation: updated }) => {
          automations = automations.map((item) => item.id === updated.id ? updated : item);
          renderAutomations();
        })
        .catch((error) => { toggle.checked = automation.enabled; alert(error.message); });
    });
    toggleLabel.append(toggleLabel.ownerDocument.createTextNode('Aktywna '), toggle);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button';
    remove.setAttribute('aria-label', `Usuń automatyzację ${automation.name}`);
    remove.innerHTML = '<i class="bi bi-trash3" aria-hidden="true"></i>';
    remove.addEventListener('click', () => {
      apiRequest(`/automations/${encodeURIComponent(automation.id)}`, { method: 'DELETE' })
        .then(() => {
          automations = automations.filter((item) => item.id !== automation.id);
          renderAutomations();
        })
        .catch((error) => alert(error.message));
    });
    controls.append(toggleLabel, remove);
    card.append(summary, controls);
    list.append(card);
  }
  byId('automations-empty').hidden = automations.length > 0;
}

function updateAutomationForm() {
  const trigger = byId('automation-trigger').value;
  byId('automation-sensor-field').hidden = trigger !== 'temperature';
  byId('automation-condition-row').hidden = trigger !== 'temperature';
  byId('automation-door-field').hidden = trigger !== 'door';
  byId('automation-time-field').hidden = trigger !== 'schedule';
  byId('automation-source-device-field').hidden = trigger !== 'device-command';
  byId('automation-source-command-field').hidden = trigger !== 'device-command';
}

function updateAutomationCommands() {
  const target = byId('automation-target').value;
  const command = byId('automation-command');
  const actionSelect = byId('automation-action');
  command.replaceChildren();
  if (target === 'rackmanager') {
    command.add(new Option('EXT_RLY — przekaźnik zewnętrzny', 'relay1'));
    command.add(new Option('POWER_RLY — przekaźnik zasilania', 'relay2'));
    actionSelect.replaceChildren(new Option('Włącz', 'on'), new Option('Wyłącz', 'off'), new Option('Zmień stan', 'toggle'));
    return;
  }
  const deviceId = target.slice('device:'.length);
  const device = knownDevices.find((item) => String(item.id) === deviceId);
  const commands = device?.commands || device?.availableCommands || [];
  for (const entry of Array.isArray(commands) ? commands : []) {
    const value = typeof entry === 'string' ? entry : entry.id || entry.command || entry.name;
    const label = typeof entry === 'string' ? entry : entry.label || entry.title || entry.name || value;
    if (value) command.add(new Option(label, value));
  }
  if (!command.options.length) command.add(new Option('Brak komend zgłoszonych', ''));
  actionSelect.replaceChildren(new Option('Wykonaj komendę', 'execute'));
  byId('automation-parameters-field').hidden = false;
}

function saveAutomation() {
  const name = byId('automation-name').value.trim();
  if (!name) {
    byId('automation-name').focus();
    byId('automation-name').setCustomValidity('Wpisz nazwę automatyzacji.');
    byId('automation-name').reportValidity();
    byId('automation-name').setCustomValidity('');
    return;
  }
  const trigger = byId('automation-trigger').value;
  const triggerLabel = trigger === 'temperature' ? 'Temperatura' : trigger === 'door' ? 'Stan drzwi' : 'Harmonogram';
  const target = byId('automation-target').selectedOptions[0]?.textContent || 'RackManager';
  const command = byId('automation-command').selectedOptions[0]?.textContent || 'Komenda';
  let when = triggerLabel;
  if (trigger === 'temperature') {
    const sensor = byId('automation-sensor').selectedOptions[0]?.textContent;
    const operator = byId('automation-operator').value === 'gt' ? 'powyżej' : 'poniżej';
    when = `${sensor} ${operator} ${byId('automation-threshold').value}°C`;
  } else if (trigger === 'door') {
    when = `Drzwi ${byId('automation-door-state').value === 'true' ? 'otwarte' : 'zamknięte'}`;
  } else if (trigger === 'device-command') {
    const sourceName = byId('automation-source-device').selectedOptions[0]?.textContent || 'Urządzenie';
    const sourceCommand = byId('automation-source-command').selectedOptions[0]?.textContent || 'Komenda';
    when = `${sourceName} wyśle komendę ${sourceCommand}`;
  } else {
    when = `Codziennie o ${byId('automation-time').value}`;
  }
  const action = byId('automation-action').value;
  let parameters = {};
  try {
    parameters = JSON.parse(byId('automation-parameters').value || '{}');
    if (!parameters || Array.isArray(parameters) || typeof parameters !== 'object') throw new Error('Parametry muszą być obiektem JSON.');
  } catch (error) {
    byId('automation-parameters').setCustomValidity(error.message || 'Nieprawidłowy JSON.');
    byId('automation-parameters').reportValidity();
    byId('automation-parameters').setCustomValidity('');
    return;
  }
  const actionVerb = { on: 'Włącz', off: 'Wyłącz', toggle: 'Zmień stan', execute: 'Wykonaj' }[action];
  const automation = {
    name, trigger,
    sensor: byId('automation-sensor').value,
    operator: byId('automation-operator').value,
    threshold: Number(byId('automation-threshold').value),
    doorState: byId('automation-door-state').value === 'true',
    sourceDevice: byId('automation-source-device')?.value,
    sourceCommand: byId('automation-source-command')?.value,
    time: byId('automation-time').value,
    target: byId('automation-target').value,
    command: byId('automation-command').value,
    action,
    parameters,
    when,
    actionLabel: `${actionVerb} ${target} · ${command}`,
    enabled: byId('automation-enabled').checked,
  };
  apiRequest('/automations', { method: 'POST', body: JSON.stringify(automation) })
    .then(({ automation: saved }) => {
      automations.unshift(saved);
      renderAutomations();
      byId('automation-name').value = '';
      byId('automation-parameters').value = '{}';
    })
    .catch((error) => alert(error.message));
}

async function loadServerCollections() {
  const [deviceResult, eventResult] = await Promise.all([apiRequest('/devices'), apiRequest('/events')]);
  knownDevices = deviceResult.devices || [];
  if (byId('device-list')) renderDevices(knownDevices);
  renderDeviceTable(knownDevices);
  if (byId('automation-target')) refreshAutomationTargets(knownDevices);
  eventHistory = eventResult.events || [];
  renderEvents();
  if (byId('automation-list')) {
    const automationResult = await apiRequest('/automations');
    automations = automationResult.automations || [];
    renderAutomations();
  }
}

async function refreshServerEvents() {
  try {
    const result = await apiRequest('/events');
    eventHistory = result.events || [];
    renderEvents();
  } catch (error) { console.error('Nie udało się pobrać dziennika:', error); }
}

function initializePage() {
  const page = document.documentElement.dataset.page;
  if (page === 'automations') {
    byId('automation-trigger').addEventListener('change', updateAutomationForm);
    byId('automation-target').addEventListener('change', updateAutomationCommands);
    byId('automation-source-device').addEventListener('change', updateSourceCommands);
    byId('save-automation').addEventListener('click', saveAutomation);
    updateAutomationForm();
    updateAutomationCommands();
  }
  if (page === 'events') {
    byId('clear-events').addEventListener('click', async () => {
      try {
        await apiRequest('/events', { method: 'DELETE' });
        eventHistory = [];
        renderEvents();
      } catch (error) { alert(error.message); }
    });
  }
  if (page === 'devices') {
    byId('refresh-devices').addEventListener('click', () => loadDeviceRecords().catch((error) => alert(error.message)));
    for (const relay of ['relay1', 'relay2']) {
      byId(`${relay}-page-toggle`).addEventListener('click', async () => {
        const current = relayStates[relay];
        if (current === null || current === undefined) {
          byId('relay-control-note').textContent = 'Nie można przełączyć przekaźnika bez aktualnego odczytu jego stanu.';
          return;
        }
        try {
          await apiRequest(`/relays/${relay}`, { method: 'POST', body: JSON.stringify({ state: !current }) });
          byId('relay-control-note').textContent = 'Polecenie wysłano do RackManager.';
        } catch (error) { byId('relay-control-note').textContent = error.message; }
      });
    }
  }
}

function renderStatus(message) {
  if (!message || message.type !== 'status' || !message.system) return;
  const data = message.system;
  const peripherals = message.peripherals || {};
  const page = document.documentElement.dataset.page;
  const navCount = byId('device-count');


  //if (navCount) navCount.textContent = String((message.devices || []).length);
  if (page === 'devices') {
    renderDeviceTable(message.devices || []);
    const multiMaxBadge = byId('multimax-status');
    multiMaxBadge.textContent = message.multiMax?.connected ? 'MULTIMAX ONLINE' : message.multiMax?.configured ? 'PORT MULTIMAX OFFLINE' : 'USTAW PORT MULTIMAX';
    multiMaxBadge.dataset.status = message.multiMax?.connected ? 'ok' : 'danger';
    for (const relay of ['relay1', 'relay2']) {
      const value = peripherals[relay];
      relayStates[relay] = typeof value === 'boolean' ? value : null;
      byId(`${relay}-page-state`).textContent = value === true ? 'Włączony' : value === false ? 'Wyłączony' : 'Brak danych';
      byId(`${relay}-page-toggle`).textContent = !message.relayControlConfigured ? 'GPIO nieustawione' : value === true ? 'Wyłącz' : value === false ? 'Włącz' : 'Brak odczytu';
      byId(`${relay}-page-toggle`).disabled = !message.relayControlConfigured || typeof value !== 'boolean';
    }
    byId('relay-control-note').textContent = message.relayControlConfigured
      ? 'Sterowanie działa przez skonfigurowane wyjścia GPIO RackManager.'
      : 'Ustaw RACKMANAGER_RELAY1_GPIO i RACKMANAGER_RELAY2_GPIO w pliku .env po sprawdzeniu pinoutu płytki.';
    return;
  }
  if (page === 'automations') {
    refreshAutomationTargets(message.devices || []);
    return;
  }
  if (page !== 'overview') return;


  byId('demo-notice').hidden = !message.demoMode;

  updateMetric('cpu-temp', data.cpuTemp);
  updateMetric('cpu-usage', data.cpuUsage);
  updateMetric('ram', data.ram);
  updateMetric('disk', data.disk);
  byId('network-sent').textContent = formatMegabytes(data.network?.sentBytes);
  byId('network-received').textContent = formatMegabytes(data.network?.receivedBytes);



  //TEMP SENSORS
  updateMetric('ext-temp', peripherals.extTemp, ' °C');
  byId('ext-temp').classList.toggle('sensor-unavailable', !Number.isFinite(peripherals.extTemp));
  byId('ext-temp-sensor-state').textContent = Number.isFinite(peripherals.extTemp) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('ext-temp-sensor-state').classList.toggle('active-state', Number.isFinite(peripherals.extTemp));

  updateMetric('int-temp-1', peripherals.intTemp1, ' °C');
  byId('int-temp-1').classList.toggle('sensor-unavailable', !Number.isFinite(peripherals.intTemp1));
  byId('int-temp-1-sensor-state').textContent = Number.isFinite(peripherals.intTemp1) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('int-temp-1-sensor-state').classList.toggle('active-state', Number.isFinite(peripherals.intTemp1));

  updateMetric('int-temp-2', peripherals.intTemp2, ' °C');
  byId('int-temp-2').classList.toggle('sensor-unavailable', !Number.isFinite(peripherals.intTemp2));
  byId('int-temp-2-sensor-state').textContent = Number.isFinite(peripherals.intTemp2) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('int-temp-2-sensor-state').classList.toggle('active-state', Number.isFinite(peripherals.intTemp2));


  //DOOR
  byId('door').textContent = peripherals.door === true ? 'Otwarte' : peripherals.door === false ? 'Zamknięte' : '—';
  byId('door-state').textContent = peripherals.door === null ? 'NIEPODŁ.' : 'AKTYWNY';
  byId('door-state').classList.toggle('active-state', peripherals.door !== null);

  if(peripherals.door === true){
    byId('door').classList.toggle('active-state', peripherals.door !== null);
  }else{
    byId('door').classList.toggle('nonactive-state', peripherals.door !== null);
  }


  //POWER
  updateMetric('power-volt', peripherals['power-volt'], ' V');
  byId('power-volt').classList.toggle('sensor-unavailable', !Number.isFinite(peripherals['power-volt']));
  byId('power-volt-state').textContent = Number.isFinite(peripherals['power-volt']) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('power-volt-state').classList.toggle('active-state', Number.isFinite(peripherals['power-volt']));

  updateMetric('power-watt', peripherals['power-watt'], ' W');
  byId('power-watt').classList.toggle('sensor-unavailable', !Number.isFinite(peripherals['power-watt']));
  byId('power-watt-state').textContent = Number.isFinite(peripherals['power-watt']) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('power-watt-state').classList.toggle('active-state', Number.isFinite(peripherals['power-watt']));


  //RELAYS
  byId('relay1').textContent = peripherals.relay1 === true ? 'Włączony' : peripherals.relay1 === false ? 'Wyłączony' : '—';
  byId('relay1-state').textContent = peripherals.relay1 === null ? 'NIEPODŁ.' : 'AKTYWNY';
  byId('relay1-state').classList.toggle('active-state', peripherals.relay1 !== null);

  byId('relay2').textContent = peripherals.relay2 === true ? 'Włączony' : peripherals.relay2 === false ? 'Wyłączony' : '—';
  byId('relay2-state').textContent = peripherals.relay2 === null ? 'NIEPODŁ.' : 'AKTYWNY';
  byId('relay2-state').classList.toggle('active-state', peripherals.relay2 !== null);

  if(peripherals.relay1 === true){
    byId('relay1').classList.toggle('active-state', peripherals.relay1 !== null);
  }else{
    byId('relay1').classList.toggle('nonactive-state', peripherals.relay1 !== null);
  }

  if(peripherals.relay2 === true){
    byId('relay2').classList.toggle('active-state', peripherals.relay2 !== null);
  }else{
    byId('relay2').classList.toggle('nonactive-state', peripherals.relay2 !== null);
  }



  byId('host-chip').textContent = data.platform || '—';
  updateMetric('swap', data.swap);
  byId('swap-progress').style.width = `${Math.max(0, Math.min(100, data.swap || 0))}%`;
  byId('free-memory').innerHTML = `${formatBytes(data.memory?.freeBytes)}<small> GB</small>`;
  byId('load-average').textContent = Array.isArray(data.loadAverage) ? data.loadAverage[0].toFixed(2) : '—';


  byId('hostname').textContent = data.hostname || 'RackManager';
  byId('platform').textContent = data.platform || 'System operacyjny';
  byId('uptime').textContent = formatUptime(data.uptimeSeconds);
  renderDevices(message.devices);
}

function connect() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${scheme}//${window.location.host}/ws`);

  socket.addEventListener('message', (event) => {
    try { renderStatus(JSON.parse(event.data)); }
    catch { addEvent('Nieprawidłowe dane', 'Serwer wysłał wiadomość, której nie można odczytać.', 'yellow-dot'); }
  });

  socket.addEventListener('open', () => setConnection(true));
  socket.addEventListener('close', () => {
    setConnection(false);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2500);
  });
  socket.addEventListener('error', () => socket.close());
}

async function startApp() {
  updateClock();
  setInterval(updateClock, 1000);
  updateGithubVersionStatus();
  setInterval(updateGithubVersionStatus, 10 * 60 * 1000);
  try {
    initializePage();
    await loadServerCollections();
    connect();
    if (document.documentElement.dataset.page === 'events' || document.documentElement.dataset.page === 'overview') {
      setInterval(refreshServerEvents, 5000);
    }
  } catch (error) {
    document.querySelector('.main-content').insertAdjacentText('beforeend', `Nie udało się uruchomić panelu: ${error.message}`);
    console.error(error);
  }
}

startApp();
