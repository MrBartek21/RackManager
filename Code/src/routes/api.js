'use strict';

const express = require('express');
const config = require('../config');
const { getStatus } = require('../services/statusService');

const router = express.Router();
router.get('/health', (_request, response) => response.json({ ok: true, name: 'RackManager', timestamp: new Date().toISOString() }));
router.get('/status', (_request, response) => response.json(getStatus()));
router.get('/config', (_request, response) => response.json({ demoMode: config.demoMode, updateIntervalMs: config.updateIntervalMs }));

module.exports = router;
