/**
 * 🐝 HoneyChain Render 24/7 Keepalive Auto-Pinger Bot
 * 
 * Usage:
 *   node scripts/keepalive-bot.js
 *   TARGET_URL=https://your-honeychain-service.onrender.com node scripts/keepalive-bot.js
 */

const https = require('https');
const http = require('http');

const target = process.env.TARGET_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5002';
const cleanUrl = target.replace(/\/+$/, '');
const endpoint = `${cleanUrl}/health`;
const INTERVAL_MS = (parseInt(process.env.PING_INTERVAL_MINUTES) || 10) * 60 * 1000;

console.log('----------------------------------------------------');
console.log('🚀 HoneyChain 24/7 Keepalive Auto-Pinger Bot Active');
console.log(`🎯 Target Endpoint: ${endpoint}`);
console.log(`⏱️  Frequency: Every ${INTERVAL_MS / 60000} minutes`);
console.log('----------------------------------------------------');

let pingCount = 0;

function ping() {
  const startTime = Date.now();
  const client = endpoint.startsWith('https') ? https : http;

  const req = client.get(endpoint, (res) => {
    pingCount++;
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toLocaleTimeString()}] ✅ Ping #${pingCount} succeeded (HTTP ${res.statusCode} in ${duration}ms)`);
  });

  req.on('error', (err) => {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Ping failed: ${err.message}`);
  });

  req.setTimeout(15000, () => {
    console.warn(`[${new Date().toLocaleTimeString()}] ⚠️ Ping timed out (>15s)`);
    req.abort();
  });
}

// Immediate first ping
ping();

// Recurring keepalive loop
setInterval(ping, INTERVAL_MS);
