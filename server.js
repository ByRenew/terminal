const express = require('express');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[36m════════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[32mOptimistic GNU Terminal Server\x1b[0m`);
  console.log(`\x1b[36m════════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[32m✓\x1b[0m HTTP: http://0.0.0.0:${PORT}`);
  console.log(`\x1b[32m✓\x1b[0m WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`\x1b[32m✓\x1b[0m Shell: /bin/bash`);
  console.log(`\x1b[32m✓\x1b[0m Ready for connections\n`);
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  let currentDir = os.homedir();
  let shell = null;
  let shellHistory = [];
  
  console.log(`\x1b[32m✓\x1b[0m New terminal session`);
  
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    SHELL: '/bin/bash',
    HOME: os.homedir(),
    USER: os.userInfo().username,
    LOGNAME: os.userInfo().username,
    PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games',
    PS1: ''
  };
  
  shell = spawn('/bin/bash', ['--norc', '--noediting'], {
    cwd: currentDir,
    env: env,
    shell: false
  });
  
  shell.stdout.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
  });
  
  shell.stderr.on('data', (data) => {
    ws.send(JSON.stringify({ type: 'output', data: `\x1b[31m${data.toString()}\x1b[0m` }));
  });
  
  shell.on('close', (code) => {
    console.log(`\x1b[33m⚠\x1b[0m Shell exited with code ${code}`);
    ws.close();
  });
  
  shell.on('error', (err) => {
    console.log(`\x1b[31m✗\x1b[0m Shell error: ${err.message}`);
    ws.send(JSON.stringify({ type: 'output', data: `\x1b[31mShell error: ${err.message}\x1b[0m\n` }));
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
      } catch(e) {
        ws.send(JSON.stringify({ type: 'output', data: `bash: cd: ${cmd.substring(7)}: No such file or directory\n` }));
      }
      return;
    }
    
    if (shell && shell.stdin && !shell.stdin.destroyed) {
      shell.stdin.write(cmd + '\n');
      shellHistory.push(cmd);
    }
  });
  
  ws.on('close', () => {
    if (shell && !shell.killed) {
      shell.kill('SIGTERM');
    }
    console.log(`\x1b[31m✗\x1b[0m Session closed`);
  });
  
  ws.on('error', (err) => {
    console.log(`\x1b[31m✗\x1b[0m WebSocket error: ${err.message}`);
  });
  
  ws.send(JSON.stringify({ type: 'ready', message: 'GNU Terminal ready' }));
  ws.send(JSON.stringify({ type: 'cwd', data: currentDir }));
});
