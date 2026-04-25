#!/usr/bin/env node

const WebSocket = require('ws');
const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3001;
const HOST = "0.0.0.0";

// Store terminal sessions
const sessions = new Map();
let sessionCounter = 0;

const wss = new WebSocket.Server({ port: PORT, host: HOST });

console.log("\x1b[36m╔════════════════════════════════════════════╗\x1b[0m");
console.log("\x1b[36m║      Optimistic OS REAL Terminal           ║\x1b[0m");
console.log("\x1b[36m╚════════════════════════════════════════════╝\x1b[0m");
console.log(`\x1b[32m✓\x1b[0m WebSocket server running on ws://${HOST}:${PORT}`);
console.log(`\x1b[33m⚠\x1b[0m This terminal can ACTUALLY install packages!\n`);

wss.on('connection', (ws, req) => {
  const sessionId = ++sessionCounter;
  let currentDir = os.homedir();
  let shellProcess = null;
  let isAlive = true;
  let outputBuffer = '';
  
  console.log(`\x1b[32m✓\x1b[0m [Session ${sessionId}] Connected from ${req.socket.remoteAddress}`);
  
  // Spawn real bash shell
  shellProcess = spawn('/bin/bash', ['--norc', '--noediting'], {
    cwd: currentDir,
    env: { 
      ...process.env, 
      TERM: 'xterm-256color',
      PS1: '' // We handle prompt ourselves
    },
    shell: false
  });
  
  // Handle stdout
  shellProcess.stdout.on('data', (data) => {
    if (isAlive) {
      const output = data.toString();
      ws.send(JSON.stringify({
        type: 'output',
        data: output
      }));
    }
  });
  
  // Handle stderr
  shellProcess.stderr.on('data', (data) => {
    if (isAlive) {
      const output = data.toString();
      ws.send(JSON.stringify({
        type: 'output',
        data: `\x1b[31m${output}\x1b[0m`
      }));
    }
  });
  
  // Handle shell exit
  shellProcess.on('close', (code) => {
    console.log(`\x1b[33m⚠\x1b[0m [Session ${sessionId}] Shell exited with code ${code}`);
    if (isAlive) {
      ws.send(JSON.stringify({
        type: 'output',
        data: `\n\x1b[31mShell terminated with code ${code}\x1b[0m\n`
      }));
    }
  });
  
  // Handle incoming commands
  ws.on('message', (message) => {
    const data = message.toString();
    
    try {
      const parsed = JSON.parse(data);
      
      if (parsed.type === 'command') {
        const command = parsed.command;
        console.log(`\x1b[36m[Session ${sessionId}] $ ${command}\x1b[0m`);
        
        // Handle CD command specially
        if (command.startsWith('cd ')) {
          const newDir = command.substring(3).replace('~', os.homedir());
          try {
            process.chdir(newDir);
            currentDir = process.cwd();
            shellProcess.cwd = currentDir;
            ws.send(JSON.stringify({
              type: 'cwd',
              data: currentDir
            }));
          } catch (err) {
            ws.send(JSON.stringify({
              type: 'output',
              data: `bash: cd: ${command.substring(3)}: No such file or directory\n`
            }));
          }
          return;
        }
        
        // Send command to shell
        if (shellProcess && shellProcess.stdin) {
          shellProcess.stdin.write(command + '\n');
        }
      } else if (parsed.type === 'cwd') {
        ws.send(JSON.stringify({
          type: 'cwd',
          data: currentDir
        }));
      } else if (parsed.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (e) {
      // Not JSON, treat as raw command
      if (shellProcess && shellProcess.stdin) {
        shellProcess.stdin.write(data + '\n');
      }
    }
  });
  
  // Handle disconnect
  ws.on('close', () => {
    isAlive = false;
    if (shellProcess && !shellProcess.killed) {
      shellProcess.kill();
    }
    sessions.delete(sessionId);
    console.log(`\x1b[31m✗\x1b[0m [Session ${sessionId}] Disconnected`);
  });
  
  ws.on('error', (err) => {
    console.error(`\x1b[31m✗\x1b[0m [Session ${sessionId}] Error: ${err.message}`);
  });
  
  sessions.set(sessionId, { ws, shell: shellProcess });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'ready',
    data: `\x1b[32m✓ Connected to REAL terminal backend\x1b[0m\n\x1b[36mYou can now run ACTUAL commands!\x1b[0m\n\x1b[33mTry: sudo apt update && sudo apt install neofetch -y\x1b[0m\n`
  }));
  
  // Send current directory
  ws.send(JSON.stringify({
    type: 'cwd',
    data: currentDir
  }));
});

console.log(`\x1b[32m✓\x1b[0m Waiting for connections...`);
