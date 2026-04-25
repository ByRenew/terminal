#!/usr/bin/env node

const express = require('express');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

const app = express();
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Try to enable passwordless sudo for current user
try {
  const user = os.userInfo().username;
  const sudoersLine = `${user} ALL=(ALL) NOPASSWD: ALL\n`;
  try {
    execSync('echo "' + sudoersLine.trim() + '" | sudo tee /etc/sudoers.d/99-nopasswd > /dev/null');
    execSync('sudo chmod 440 /etc/sudoers.d/99-nopasswd');
    console.log('\x1b[32m✓\x1b[0m Passwordless sudo configured');
  } catch (e) {
    console.log('\x1b[33m⚠\x1b[0m Could not configure passwordless sudo (may already be set)');
  }
} catch (e) {
  // ignore
}

const server = app.listen(PORT, HOST, () => {
  console.log(`\x1b[36m╔════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[36m║      Optimistic OS REAL Terminal           ║\x1b[0m`);
  console.log(`\x1b[36m╚════════════════════════════════════════════╝\x1b[0m`);
  console.log(`\x1b[32m✓\x1b[0m Server running on http://${HOST}:${PORT}`);
  console.log(`\x1b[32m✓\x1b[0m WebSocket ready\n`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
  let currentDir = os.homedir();
  
  console.log(`\x1b[32m✓\x1b[0m Client connected from ${req.socket.remoteAddress}`);
  
  const shell = pty.spawn('/bin/bash', ['-l'], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: currentDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
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
        
        if (command.startsWith('cd ')) {
          const newDir = command.substring(3).replace('~', os.homedir());
          try {
            process.chdir(newDir);
            currentDir = process.cwd();
            ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'output',
              data: `bash: cd: ${command.substring(3)}: No such file or directory\r\n`
            }));
          }
          return;
        }
        
        if (command.trim() === 'clear') {
          ws.send(JSON.stringify({ type: 'clear' }));
          return;
        }
        
        shell.write(command + '\r');
        
      } else if (parsed.type === 'cwd') {
        ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
      }
      
    } catch (e) {
      shell.write(data + '\r');
    }
  });
  
  ws.on('close', () => {
    shell.kill();
    console.log(`\x1b[31m✗\x1b[0m Client disconnected`);
  });
  
  ws.send(JSON.stringify({
    type: 'ready',
    data: `\x1b[32m✓ Connected to REAL terminal\x1b[0m\r\n\x1b[36mTry: sudo apt update && sudo apt install neofetch -y\x1b[0m\r\n`
  }));
  
  ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
});

console.log(`\x1b[32m✓\x1b[0m Waiting for connections...`);
