'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let previousCpu = null;

function cpuUsage() {
  const cpus = os.cpus();
  const totals = cpus.map((cpu) => {
    const values = Object.values(cpu.times);
    return { idle: cpu.times.idle, total: values.reduce((sum, value) => sum + value, 0) };
  });
  const current = totals.reduce((sum, item) => ({ idle: sum.idle + item.idle, total: sum.total + item.total }), { idle: 0, total: 0 });
  const result = previousCpu && current.total > previousCpu.total
    ? Math.max(0, Math.min(100, 100 * (1 - (current.idle - previousCpu.idle) / (current.total - previousCpu.total))))
    : null;
  previousCpu = current;
  return result === null ? null : Number(result.toFixed(1));
}

function readCpuTemperature() {
  const candidates = ['/sys/class/thermal/thermal_zone0/temp', '/sys/class/hwmon/hwmon0/temp1_input'];
  for (const file of candidates) {
    try {
      const raw = Number(fs.readFileSync(file, 'utf8').trim());
      if (Number.isFinite(raw)) return Number((raw > 1000 ? raw / 1000 : raw).toFixed(1));
    } catch { /* Czujnik nie jest dostępny na tym systemie. */ }
  }
  if (process.platform === 'linux') {
    try {
      const raw = execFileSync('vcgencmd', ['measure_temp'], { timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const value = raw.match(/temp=([\d.]+)/)?.[1];
      if (value) return Number(Number(value).toFixed(1));
    } catch { /* vcgencmd jest opcjonalne na Raspberry Pi. */ }
  }
  return null;
}

function readDiskUsage() {
  if (process.platform === 'win32') {
    try {
      const root = path.parse(process.cwd()).root;
      const drive = root.replace(/\\$/, '');
      const result = execFileSync('wmic', ['logicaldisk', 'where', `DeviceID='${drive}'`, 'get', 'Size,FreeSpace', '/value'], { timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const size = Number(result.match(/Size=(\d+)/)?.[1]);
      const free = Number(result.match(/FreeSpace=(\d+)/)?.[1]);
      return size > 0 ? Number(((1 - free / size) * 100).toFixed(1)) : null;
    } catch { return null; }
  }
  try {
    const line = execFileSync('df', ['-Pk', '/'], { timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[1];
    const percent = line?.trim().split(/\s+/)[4]?.replace('%', '');
    return Number.isFinite(Number(percent)) ? Number(percent) : null;
  } catch { return null; }
}

function readSwapUsage() {
  if (process.platform !== 'linux') return null;
  try {
    const mem = fs.readFileSync('/proc/meminfo', 'utf8');
    const total = Number(mem.match(/^SwapTotal:\s+(\d+)/m)?.[1]);
    const free = Number(mem.match(/^SwapFree:\s+(\d+)/m)?.[1]);
    return total > 0 ? Number(((1 - free / total) * 100).toFixed(1)) : 0;
  } catch { return null; }
}

function readExternalTemperature() {
  const base = '/sys/bus/w1/devices';
  try {
    const device = fs.readdirSync(base).find((name) => name.startsWith('28-'));
    if (!device) return null;
    const content = fs.readFileSync(path.join(base, device, 'w1_slave'), 'utf8');
    if (!content.includes('YES')) return null;
    const raw = Number(content.match(/t=(-?\d+)/)?.[1]);
    return Number.isFinite(raw) ? Number((raw / 1000).toFixed(1)) : null;
  } catch { return null; }
}

function readSystemMetrics() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  return {
    cpuUsage: cpuUsage(),
    cpuTemp: readCpuTemperature(),
    ram: totalMemory ? Number(((1 - freeMemory / totalMemory) * 100).toFixed(1)) : null,
    swap: readSwapUsage(),
    disk: readDiskUsage(),
    extTemp: readExternalTemperature(),
    memory: { totalBytes: totalMemory, freeBytes: freeMemory },
    uptimeSeconds: Math.floor(os.uptime()),
    loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    hostname: os.hostname(),
    platform: `${os.platform()} ${os.arch()}`,
  };
}

module.exports = { readSystemMetrics };
