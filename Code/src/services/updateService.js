'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const repository = 'MrBartek21/RackManager';
const projectRoot = path.resolve(__dirname, '../../..');
const CACHE_MS = 10 * 60 * 1000;
let cachedResult;
let cachedAt = 0;
let pendingCheck;

function getInstalledCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
  } catch {
    return null;
  }
}

async function checkForUpdates() {
  const installedCommit = getInstalledCommit();
  if (!installedCommit) return { state: 'unavailable' };

  const response = await fetch(`https://api.github.com/repos/${repository}/compare/${installedCommit}...main`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'RackManager-update-check' },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const comparison = await response.json();
  return {
    state: comparison.status === 'behind' || comparison.status === 'diverged' ? 'update' : 'current',
    latestUrl: comparison.base_commit?.html_url || `https://github.com/${repository}/commits/main`,
  };
}

async function getUpdateStatus() {
  if (Date.now() - cachedAt < CACHE_MS && cachedResult) return cachedResult;
  if (pendingCheck) return pendingCheck;

  pendingCheck = checkForUpdates()
    .catch(() => ({ state: 'unavailable' }))
    .then((result) => {
      cachedResult = result;
      cachedAt = Date.now();
      pendingCheck = null;
      return result;
    });
  return pendingCheck;
}

module.exports = { getUpdateStatus };
