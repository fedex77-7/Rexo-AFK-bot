const bedrock = require('bedrock-protocol');
const express = require('express');
const http = require('http');
const https = require('https');
const config = require('./settings.json');

const app = express();
const PORT = Number(process.env.PORT || 5000);

let client = null;
let reconnectTimer = null;
let messageTimer = null;
let startTime = Date.now();
let state = {
  connected: false,
  spawned: false,
  reconnectAttempts: 0,
  lastError: null,
  lastMessage: null,
  position: null
};

function uptime() {
  return Math.floor((Date.now() - startTime) / 1000);
}

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function log(message) {
  console.log(`[BedrockBot] ${message}`);
}

function clearTimers() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (messageTimer) clearInterval(messageTimer);
  reconnectTimer = null;
  messageTimer = null;
}

function scheduleReconnect(reason) {
  if (reconnectTimer) return;

  state.connected = false;
  state.spawned = false;
  state.reconnectAttempts++;

  const base = Number(config.reconnect.baseDelayMs || 3000);
  const max = Number(config.reconnect.maxDelayMs || 30000);
  const delay = Math.min(
    base + (state.reconnectAttempts - 1) * 2000,
    max
  );

  log(`Reconnect in ${Math.ceil(delay / 1000)}s (${reason || 'connection ended'})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    createBot();
  }, delay);
}

function sendChat(message) {
  if (!client || !state.connected || !state.spawned) return;

  try {
    client.queue('text', {
      type: 'chat',
      needs_translation: false,
      source_name: client.username,
      xuid: '',
      platform_chat_id: '',
      filtered_message: '',
      message: String(message)
    });
    state.lastMessage = String(message);
    log(`Chat: ${message}`);
  } catch (err) {
    log(`Chat error: ${err.message}`);
  }
}

function startAntiIdleChat() {
  if (messageTimer) clearInterval(messageTimer);

  if (!config.antiIdle.enabled || !config.antiIdle.messages.length) return;

  const interval = Math.max(
    30000,
    Number(config.antiIdle.intervalSeconds || 300) * 1000
  );

  let index = 0;

  messageTimer = setInterval(() => {
    if (!state.connected || !state.spawned) return;

    sendChat(config.antiIdle.messages[index]);
    index = (index + 1) % config.antiIdle.messages.length;
  }, interval);
}

function createBot() {
  clearTimers();

  if (client) {
    try { client.close(); } catch (_) {}
    client = null;
  }

  const server = config.server;

  log(`Connecting to ${server.host}:${server.port}`);

  const options = {
    host: server.host,
    port: Number(server.port),
    username: config.bot.username,
    offline: Boolean(config.bot.offline),
    connectTimeout: Number(config.server.connectTimeoutMs || 15000),
    batchingInterval: 20
  };

  // Leave version empty to let bedrock-protocol negotiate the server version.
  if (server.version) options.version = server.version;

  // Optional Microsoft/Xbox authentication.
  if (!config.bot.offline) {
    options.onMsaCode = (data) => {
      console.log('\n=== Microsoft/Xbox Login Required ===');
      console.log(`Open: ${data.verification_uri}`);
      console.log(`Code: ${data.user_code}`);
      console.log('Complete the login once; credentials/tokens are handled by bedrock-protocol.');
      console.log('======================================\n');
    };
  }

  try {
    client = bedrock.createClient(options);

    client.on('connect', () => {
      log('Network connection established.');
    });

    client.on('join', () => {
      state.connected = true;
      log('Joined Bedrock server.');
    });

    client.on('spawn', () => {
      state.connected = true;
      state.spawned = true;
      state.reconnectAttempts = 0;
      log('Bot spawned successfully.');
      startAntiIdleChat();
    });

    client.on('start_game', (packet) => {
      if (packet && packet.player_position) {
        state.position = packet.player_position;
      }
      if (packet && packet.runtime_entity_id !== undefined) {
        log(`Runtime entity ID received: ${String(packet.runtime_entity_id)}`);
      }
    });

    client.on('move_player', (packet) => {
      if (packet && packet.position) {
        state.position = packet.position;
      }
    });

    client.on('text', (packet) => {
      if (!packet) return;
      const source = packet.source_name || 'Server';
      const message = packet.message || '';
      log(`${source}: ${message}`);
    });

    client.on('kick', (reason) => {
      state.lastError = `Kicked: ${JSON.stringify(reason)}`;
      log(state.lastError);
    });

    client.on('error', (err) => {
      state.lastError = err && err.message ? err.message : String(err);
      log(`Error: ${state.lastError}`);
    });

    client.on('close', () => {
      state.connected = false;
      state.spawned = false;
      clearTimers();
      scheduleReconnect('connection closed');
    });
  } catch (err) {
    state.lastError = err.message;
    log(`Create client failed: ${err.message}`);
    scheduleReconnect('client creation failed');
  }
}

// Dashboard
app.get('/', (req, res) => {
  res.type('html').send(`
<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${config.name}</title>
<style>
body{margin:0;background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{width:min(430px,90%);background:#1e293b;border:1px solid #334155;border-radius:18px;padding:28px;box-shadow:0 20px 60px #0006}
h1{margin-top:0}
.row{background:#0f172a;border-radius:12px;padding:14px;margin:10px 0}
.label{font-size:11px;text-transform:uppercase;color:#94a3b8}
.value{font-size:17px;font-weight:bold;margin-top:5px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#ef4444;margin-right:8px}
.ok{background:#22c55e}
small{color:#64748b}
</style>
</head>
<body>
<div class="card">
<h1><span id="dot" class="dot"></span>${config.name}</h1>
<div class="row"><div class="label">Status</div><div id="status" class="value">Loading...</div></div>
<div class="row"><div class="label">Uptime</div><div id="uptime" class="value">--</div></div>
<div class="row"><div class="label">Server</div><div class="value">${serverSafe(config.server.host)}:${Number(config.server.port)}</div></div>
<div class="row"><div class="label">Position</div><div id="position" class="value">Unknown</div></div>
<div class="row"><div class="label">Last error</div><div id="error" class="value">None</div></div>
<small>Bedrock protocol client • Auto reconnect enabled</small>
</div>
<script>
async function update(){
  try{
    const r=await fetch('/health'); const d=await r.json();
    document.getElementById('status').textContent=d.spawned?'Online & Spawned':(d.connected?'Connected':'Reconnecting...');
    document.getElementById('dot').className='dot '+(d.spawned?'ok':'');
    document.getElementById('uptime').textContent=d.uptimeFormatted;
    document.getElementById('position').textContent=d.position?
      [d.position.x,d.position.y,d.position.z].map(v=>Math.round(v)).join(', '):'Unknown';
    document.getElementById('error').textContent=d.lastError||'None';
  }catch(e){}
}
setInterval(update,1000); update();
</script>
</body>
</html>`);
});

function serverSafe(value) {
  return String(value).replace(/[<>&"]/g, '');
}

app.get('/health', (req, res) => {
  res.json({
    status: state.spawned ? 'connected' : (state.connected ? 'joined' : 'disconnected'),
    connected: state.connected,
    spawned: state.spawned,
    uptime: uptime(),
    uptimeFormatted: formatUptime(uptime()),
    position: state.position,
    reconnectAttempts: state.reconnectAttempts,
    lastError: state.lastError,
    lastMessage: state.lastMessage
  });
});

app.get('/ping', (req, res) => res.send('pong'));

app.listen(PORT, '0.0.0.0', () => {
  log(`HTTP dashboard listening on port ${PORT}`);
});

// Optional Render self-ping. This does NOT guarantee that a hosting provider
// will keep a free service alive; it only performs a normal HTTP request.
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => {
    const url = `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/ping`;
    const protocol = url.startsWith('https://') ? https : http;
    protocol.get(url).on('error', () => {});
  }, 10 * 60 * 1000);
}

process.on('uncaughtException', (err) => {
  state.lastError = `Uncaught: ${err.message}`;
  log(state.lastError);
  scheduleReconnect('uncaught exception');
});

process.on('unhandledRejection', (reason) => {
  state.lastError = `Unhandled rejection: ${String(reason)}`;
  log(state.lastError);
});

startTime = Date.now();
createBot();
