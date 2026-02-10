const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

const app = express();
const PORT = 3000;

// OpenClaw Gateway config
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = '4ea62445dd9a8c099819f9f1e23f8809a1aa95b72c757a7d';
const WORKSPACE = '/home/ubuntu/.openclaw/workspace';
const OPENCLAW_DIR = '/home/ubuntu/.openclaw';

// Helper to call OpenClaw gateway
async function callGateway(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: GATEWAY_PORT,
      path: endpoint,
      method,
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Get session metrics
app.get('/api/sessions', async (req, res) => {
  try {
    const result = await callGateway('/api/sessions?messageLimit=5');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get cron jobs
app.get('/api/cron', async (req, res) => {
  try {
    const result = await callGateway('/api/cron/jobs');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get workspace files
app.get('/api/files', async (req, res) => {
  try {
    const files = await getFilesRecursive(WORKSPACE);
    res.json({ files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get config (sanitized)
app.get('/api/config', async (req, res) => {
  try {
    const configPath = path.join(OPENCLAW_DIR, 'openclaw.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    // Sanitize sensitive data
    if (config.channels?.telegram?.botToken) {
      config.channels.telegram.botToken = '***REDACTED***';
    }
    if (config.gateway?.auth?.token) {
      config.gateway.auth.token = '***REDACTED***';
    }
    if (config.tools?.web?.search?.apiKey) {
      config.tools.web.search.apiKey = '***REDACTED***';
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get memory files content
app.get('/api/memory', async (req, res) => {
  try {
    const memoryDir = path.join(WORKSPACE, 'memory');
    const mainMemory = path.join(WORKSPACE, 'MEMORY.md');
    
    const result = { mainMemory: null, dailyLogs: [] };
    
    // Read main memory
    try {
      result.mainMemory = await fs.readFile(mainMemory, 'utf8');
    } catch {}
    
    // Read daily logs
    try {
      const files = await fs.readdir(memoryDir);
      for (const file of files.filter(f => f.endsWith('.md'))) {
        const content = await fs.readFile(path.join(memoryDir, file), 'utf8');
        result.dailyLogs.push({ name: file, content });
      }
    } catch {}
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recursive file listing helper
async function getFilesRecursive(dir, baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.name.startsWith('.')) continue; // Skip hidden
    
    if (entry.isDirectory()) {
      files.push(...await getFilesRecursive(fullPath, baseDir));
    } else {
      const stats = await fs.stat(fullPath);
      files.push({
        name: entry.name,
        path: relativePath,
        size: stats.size,
        modified: stats.mtime
      });
    }
  }
  
  return files;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🕵️ Sherlock Dashboard running at http://localhost:${PORT}`);
  console.log(`   Also accessible at http://<your-server-ip>:${PORT}`);
});
