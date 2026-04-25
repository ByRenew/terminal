#!/usr/bin/env node

const express = require('express');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';
const USERNAME = 'optimistic';
const PASSWORD = 'optimistic';

const app = express();
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Setup: install sudo and create user
console.log('\x1b[36m╔════════════════════════════════════════════╗\x1b[0m');
console.log('\x1b[36m║      Optimistic OS REAL Terminal           ║\x1b[0m');
console.log('\x1b[36m╚════════════════════════════════════════════╝\x1b[0m');

try {
  execSync('which sudo >/dev/null 2>&1 || (apt-get update -qq && apt-get install -y -qq sudo)');
  console.log('\x1b[32m✓\x1b[0m sudo installed');
} catch (e) {
  console.log('\x1b[33m⚠\x1b[0m sudo may already be installed');
}

try {
  execSync(`id ${USERNAME} >/dev/null 2>&1 || useradd -m -s /bin/bash ${USERNAME}`);
  execSync(`echo "${USERNAME}:${PASSWORD}" | chpasswd`);
  execSync(`echo "${USERNAME} ALL=(ALL) ALL" > /etc/sudoers.d/${USERNAME}`);
  execSync(`chmod 440 /etc/sudoers.d/${USERNAME}`);
  console.log(`\x1b[32m✓\x1b[0m User "${USERNAME}" created with sudo access`);
} catch (e) {
  console.log(`\x1b[33m⚠\x1b[0m User setup issue (may already exist)`);
}

const server = app.listen(PORT, HOST, () => {
  console.log(`\x1b[32m✓\x1b[0m Server running on http://${HOST}:${PORT}`);
  console.log(`\x1b[32m✓\x1b[0m WebSocket ready`);
  console.log(`\x1b[33mℹ\x1b[0m Login: ${USERNAME} / Password: ${PASSWORD}\n`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  console.log(`\x1b[32m✓\x1b[0m Client connected from ${req.socket.remoteAddress}`);
  
  // Spawn shell as the user (not root)
  const shell = pty.spawn('su', ['-', USERNAME], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: `/home/${USERNAME}`,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: `/home/${USERNAME}`,
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'
    }
  });
  
  shell.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  });
  
  shell.onExit(() => {
    ws.close();
  });
  
  ws.on('message', (message) => {
    const data = message.toString();
    
    try {
      const parsed = JSON.parse(data);
      
      if (parsed.type === 'command') {
        const command = parsed.command;
        console.log(`\x1b[36m$\x1b[0m ${command}`);
        shell.write(command + '\r');
      } else if (parsed.type === 'cwd') {
        // shell handles cwd internally via cd commands
      }
    } catch (e) {
      shell.write(data + '\r');
    }
  });
  
  ws.on('close', () => {
    shell.kill();
    console.log(`\x1b[31m✗\x1b[0m Client disconnected`);
  });
});

console.log(`\x1b[32m✓\x1b[0m Waiting for connections...`);
