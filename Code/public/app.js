'use strict';

const byId = (id) => document.getElementById(id);
const histories = new Map();
const MAX_POINTS = 24;
let socket;
let reconnectTimer;
let firstStatus = true;

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '—';
  return (bytes / 1024 ** 3).toLocaleString('pl-PL', { maximumFractionDigits: 1 });
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
  byId('date-label').textContent = new Intl.DateTimeFormat('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
}

function setConnection(connected) {
  byId('connection').classList.toggle('connected', connected);
  byId('connection').classList.toggle('disconnected', !connected);
  byId('connection-label').textContent = connected ? 'Połączono' : 'Ponowne łączenie';
  byId('unit-status').textContent = connected ? 'ONLINE' : 'OFFLINE';
  byId('unit-status').classList.toggle('online-chip', connected);
  byId('last-update').textContent = connected ? 'Dane aktualizują się na żywo' : 'Brak połączenia z serwerem';
}

function addHistory(key, value) {
  if (!Number.isFinite(value)) return;
  if (!histories.has(key)) histories.set(key, []);
  const values = histories.get(key);
  values.push(value);
  if (values.length > MAX_POINTS) values.shift();
  drawChart(`${key}-chart`, values);
}

function drawChart(id, values) {
  const canvas = byId(id);
  if (!canvas) return;
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(64, canvas.clientWidth || 64);
  const height = Math.max(24, canvas.clientHeight || 24);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  context.beginPath();
  values.forEach((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - 3 - ((value - min) / (max - min || 1)) * (height - 7);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  const gradient = context.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, '#5367ff');
  gradient.addColorStop(1, '#42c8bd');
  context.strokeStyle = gradient;
  context.lineWidth = 1.8;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();
}

function updateMetric(id, value, suffix = '') {
  byId(id).textContent = Number.isFinite(value) ? `${formatNumber(value)}${suffix}` : '—';
}

function addEvent(title, detail, kind = 'blue-dot') {
  const list = byId('event-list');
  const item = document.createElement('div');
  item.className = 'event-item';
  const dot = document.createElement('span');
  dot.className = `event-dot ${kind}`;
  const copy = document.createElement('span');
  copy.className = 'event-copy';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const description = document.createElement('small');
  description.textContent = detail;
  copy.append(heading, description);
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('pl-PL');
  item.append(dot, copy, time);
  list.prepend(item);
  while (list.children.length > 5) list.lastElementChild.remove();
}

function renderStatus(message) {
  if (!message || message.type !== 'status' || !message.system) return;
  const data = message.system;
  byId('demo-notice').hidden = !message.demoMode;

  updateMetric('cpu-temp', data.cpuTemp);
  updateMetric('cpu-usage', data.cpuUsage);
  updateMetric('ram', data.ram);
  updateMetric('disk', data.disk);
  updateMetric('swap', data.swap);
  updateMetric('ext-temp', data.extTemp, ' °C');
  byId('ext-temp').classList.toggle('sensor-unavailable', !Number.isFinite(data.extTemp));
  byId('temp-sensor-state').textContent = Number.isFinite(data.extTemp) ? 'AKTYWNY' : 'NIEPODŁ.';
  byId('temp-sensor-state').classList.toggle('active-state', Number.isFinite(data.extTemp));
  byId('door').textContent = data.door === true ? 'Otwarte' : data.door === false ? 'Zamknięte' : '—';
  byId('door-state').textContent = data.door === null ? 'NIEPODŁ.' : 'AKTYWNY';
  byId('door-state').classList.toggle('active-state', data.door !== null);
  byId('cpu-temp-caption').textContent = Number.isFinite(data.cpuTemp) ? (data.cpuTemp >= 70 ? 'Podwyższona temperatura' : 'Temperatura nominalna') : 'Odczyt niedostępny';
  byId('cpu-temp-state').classList.toggle('warning', Number.isFinite(data.cpuTemp) && data.cpuTemp >= 70);

  byId('ram-progress').style.width = `${Math.max(0, Math.min(100, data.ram || 0))}%`;
  byId('disk-progress').style.width = `${Math.max(0, Math.min(100, data.disk || 0))}%`;
  byId('swap-progress').style.width = `${Math.max(0, Math.min(100, data.swap || 0))}%`;
  byId('memory-caption').textContent = `${formatBytes(data.memory?.totalBytes)} GB łącznie`;
  byId('free-memory').innerHTML = `${formatBytes(data.memory?.freeBytes)}<small> GB</small>`;
  byId('hostname').textContent = data.hostname || 'RackManager';
  byId('platform').textContent = data.platform || 'System operacyjny';
  byId('uptime').textContent = formatUptime(data.uptimeSeconds);
  byId('host-chip').textContent = data.platform || '—';
  byId('node-count').textContent = `${message.devices?.length || 0} urządzeń`;
  byId('device-count').textContent = String(message.devices?.length || 0);
  byId('load-average').textContent = Array.isArray(data.loadAverage) ? data.loadAverage[0].toFixed(2) : '—';
  byId('last-update').textContent = `Ostatnia aktualizacja: ${new Date(message.timestamp).toLocaleTimeString('pl-PL')}`;

  addHistory('cpu-temp', data.cpuTemp);
  addHistory('cpu', data.cpuUsage);
  addHistory('ram', data.ram);
  addHistory('disk', data.disk);

  if (firstStatus) {
    addEvent(message.demoMode ? 'Uruchomiono tryb demonstracyjny' : 'Odczytano dane systemowe', `Host: ${data.hostname || 'RackManager'}`, 'green-dot');
    firstStatus = false;
  }
}

function connect() {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
  socket.addEventListener('open', () => setConnection(true));
  socket.addEventListener('message', (event) => {
    try { renderStatus(JSON.parse(event.data)); }
    catch { addEvent('Nieprawidłowe dane', 'Serwer wysłał wiadomość, której nie można odczytać.', 'yellow-dot'); }
  });
  socket.addEventListener('close', () => {
    setConnection(false);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, 2500);
  });
  socket.addEventListener('error', () => socket.close());
}

updateClock();
setInterval(updateClock, 1000);
connect();
