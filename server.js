const express = require('express');
const WebSocket = require('ws');
const pty = require('node-pty');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HTTP server running on port ${PORT}`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let currentDir = os.homedir();
  
  console.log('Client connected');
  
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
    ws.send(JSON.stringify({ type: 'output', data }));
  });
  
  shell.onExit(() => {
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
    
    shell.write(cmd + '\r');
  });
  
  ws.on('close', () => {
    shell.kill();
    console.log('Client disconnected');
  });
});
