const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;  // Railway uses dynamic port, default to 8080

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Create HTTP server first
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on port ${PORT}`);
});

// Attach WebSocket to the same server
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let currentDir = os.homedir();
  let shell = null;
  
  console.log('Client connected');
  
  shell = spawn('/bin/bash', ['-l'], {
    cwd: currentDir,
    env: { ...process.env, TERM: 'xterm-256color', PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' }
  });
  
  shell.stdout.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
  });
  
  shell.stderr.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'output', data: `\x1b[31m${data.toString()}\x1b[0m` }));
  });
  
  shell.on('close', () => {
    ws.close();
  });
  
  ws.on('message', (msg) => {
    const cmd = msg.toString();
    
    if (cmd === '__cwd__') {
      ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
      return;
    }
    
    if (cmd.startsWith('__cd__:')) {
      const newDir = cmd.substring(7).replace('~', os.homedir());
      try {
        process.chdir(newDir);
        currentDir = process.cwd();
        ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
      } catch(e) {}
      return;
    }
    
    if (shell && shell.stdin) {
      shell.stdin.write(cmd + '\n');
    }
  });
  
  ws.on('close', () => {
    if (shell) shell.kill();
    console.log('Client disconnected');
  });
});

// Log that server is ready
console.log(`Terminal server starting on port ${PORT}`);
