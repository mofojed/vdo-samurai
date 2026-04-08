#!/usr/bin/env node
/**
 * Debug script to query Electron renderer state via CDP
 * Usage: node scripts/debug-electron-cdp.js [expression]
 */
import http from 'http';
import { WebSocket } from 'ws';

const expression = process.argv[2] || `
(function() {
  try {
    const result = {
      url: window.location.href,
      selfId: window.__TRYSTERO_SELF_ID || 'unknown',
      lastSession: JSON.parse(localStorage.getItem('vdo-samurai-last-session') || '{}'),
      hash: window.location.hash,
    };
    return JSON.stringify(result, null, 2);
  } catch(e) {
    return JSON.stringify({error: e.message});
  }
})()
`;

function getCDPTargets() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function evaluateInPage(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true }
      }));
    });
    ws.on('message', (msg) => {
      const resp = JSON.parse(msg.toString());
      if (resp.id === 1) {
        resolve(resp.result);
        ws.close();
      }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 5000);
  });
}

try {
  const targets = await getCDPTargets();
  const page = targets.find(t => t.type === 'page');
  if (!page) {
    console.error('No page target found');
    process.exit(1);
  }
  console.log('Target:', page.url);
  const result = await evaluateInPage(page.webSocketDebuggerUrl, expression);
  if (result?.result?.value) {
    console.log(result.result.value);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} catch (e) {
  console.error('Error:', e.message);
}
