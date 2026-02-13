const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');
const MetricsDB = require('./metrics-db');

const app = express();
const PORT = 3000;
const metricsDB = new MetricsDB();

// Mac Mini OpenClaw paths
const GATEWAY_PORT = 18789;
const GATEWAY_TOKEN = 'f288b9c5b75687f6dfc753d2fbafb801db422a34f60dc50b961712fa2ac4b78d';
const WORKSPACE = '/Users/robhoeller-claw/.openclaw/workspace';
const OPENCLAW_DIR = '/Users/robhoeller-claw/.openclaw';

// Core files to highlight
const CORE_FILES = [
  'MEMORY.md',
  'SOUL.md',
  'USER.md',
  'IDENTITY.md',
  'AGENTS.md',
  'TOOLS.md',
  'HEARTBEAT.md'
];

// Project tracking patterns
const PROJECT_PATTERNS = [
  { pattern: /\.csv$/, category: 'data' },
  { pattern: /\.py$/, category: 'script' },
  { pattern: /_analysis\.py$/, category: 'analysis' },
  { pattern: /_brief\.md$/, category: 'report' },
  { pattern: /^dashboard\//, category: 'dashboard' }
];

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
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Get session metrics
app.get('/api/sessions', async (req, res) => {
  try {
    // Use openclaw CLI to get session data
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    // Get session list with JSON output
    const { stdout } = await execAsync('openclaw sessions --json');
    const sessionsData = JSON.parse(stdout);
    
    // Transform to expected format
    const sessions = (sessionsData.sessions || []).map(s => ({
      sessionId: s.key,
      model: s.model || 'unknown',
      channel: s.kind || 'direct',
      displayName: 'Rob Hoeller',
      totalTokens: s.totalTokens || 0,
      contextTokens: s.contextTokens || 200000,
      messages: [{
        usage: {
          input: s.inputTokens || 0,
          output: s.outputTokens || 0,
          cost: {
            input: (s.inputTokens || 0) * 0.000003,
            output: (s.outputTokens || 0) * 0.000015,
            total: ((s.inputTokens || 0) * 0.000003) + ((s.outputTokens || 0) * 0.000015)
          }
        }
      }]
    }));
    
    res.json({ sessions });
  } catch (err) {
    console.error('Session fetch error:', err);
    res.status(500).json({ error: err.message, sessions: [] });
  }
});

// API: Get workspace files
app.get('/api/files', async (req, res) => {
  try {
    const files = await getFilesRecursive(WORKSPACE);
    
    // Categorize files
    const categorized = {
      core: files.filter(f => CORE_FILES.includes(f.name)),
      projects: files.filter(f => !CORE_FILES.includes(f.name)),
      stats: {
        total: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0),
        byCategory: {}
      }
    };
    
    // Count by project category
    PROJECT_PATTERNS.forEach(({ category }) => {
      categorized.stats.byCategory[category] = 0;
    });
    
    files.forEach(file => {
      for (const { pattern, category } of PROJECT_PATTERNS) {
        if (pattern.test(file.path)) {
          categorized.stats.byCategory[category]++;
          break;
        }
      }
    });
    
    res.json(categorized);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get file content
app.get('/api/file/:path(*)', async (req, res) => {
  try {
    const filePath = path.join(WORKSPACE, req.params.path);
    
    // Security: ensure path is within workspace
    if (!filePath.startsWith(WORKSPACE)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const content = await fs.readFile(filePath, 'utf8');
    const stats = await fs.stat(filePath);
    
    res.json({
      path: req.params.path,
      content,
      size: stats.size,
      modified: stats.mtime
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update file content
app.post('/api/file/:path(*)', async (req, res) => {
  try {
    const filePath = path.join(WORKSPACE, req.params.path);
    
    // Security: ensure path is within workspace
    if (!filePath.startsWith(WORKSPACE)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await fs.writeFile(filePath, req.body.content, 'utf8');
    
    res.json({ success: true, path: req.params.path });
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
      for (const file of files.filter(f => f.endsWith('.md')).sort().reverse()) {
        const content = await fs.readFile(path.join(memoryDir, file), 'utf8');
        result.dailyLogs.push({ name: file, content });
      }
    } catch {}
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get project status
app.get('/api/projects', async (req, res) => {
  try {
    const files = await getFilesRecursive(WORKSPACE);
    
    // Group by project (inferred from file naming)
    const projects = {};
    
    files.forEach(file => {
      // Extract project name from file path
      const match = file.path.match(/^([a-z_]+?)_/i) || 
                    file.path.match(/^(dashboard)\//);
      
      if (match) {
        const projectName = match[1];
        if (!projects[projectName]) {
          projects[projectName] = {
            name: projectName,
            files: [],
            lastModified: new Date(0)
          };
        }
        projects[projectName].files.push(file);
        
        if (new Date(file.modified) > projects[projectName].lastModified) {
          projects[projectName].lastModified = new Date(file.modified);
        }
      }
    });
    
    // Sort by most recent
    const sorted = Object.values(projects).sort((a, b) => 
      b.lastModified - a.lastModified
    );
    
    res.json({ projects: sorted });
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
    
    // Skip hidden files and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    
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

// API: Get metrics by date range
app.get('/api/metrics/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Default to month-to-date if not provided
    const end = endDate || new Date().toISOString().split('T')[0];
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    
    const [byDate, byModel, daily] = await Promise.all([
      metricsDB.getMetricsByDateRange(start, end),
      metricsDB.getModelSummary(start, end),
      metricsDB.getDailySummary(start, end)
    ]);
    
    res.json({
      startDate: start,
      endDate: end,
      byDate,
      byModel,
      daily
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Log current metrics (called by collector)
app.post('/api/metrics/log', async (req, res) => {
  try {
    await collectAndLogMetrics();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Metrics collector function
async function collectAndLogMetrics() {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    const { stdout } = await execAsync('openclaw sessions --json');
    const sessionsData = JSON.parse(stdout);
    
    for (const s of sessionsData.sessions || []) {
      // Calculate costs (Claude Sonnet 4.5 pricing)
      const costInput = (s.inputTokens || 0) * 0.000003;
      const costOutput = (s.outputTokens || 0) * 0.000015;
      const costTotal = costInput + costOutput;
      
      await metricsDB.logMetrics({
        sessionId: s.key,
        model: s.model || 'unknown',
        channel: s.kind || 'direct',
        inputTokens: s.inputTokens || 0,
        outputTokens: s.outputTokens || 0,
        totalTokens: s.totalTokens || 0,
        contextTokens: s.contextTokens || 200000,
        costInput,
        costOutput,
        costTotal
      });
    }
    
    console.log(`✓ Metrics logged: ${sessionsData.sessions?.length || 0} sessions`);
  } catch (err) {
    console.error('Metrics collection error:', err);
  }
}

// Start periodic metrics collection (every hour)
setInterval(collectAndLogMetrics, 60 * 60 * 1000);

// Collect initial metrics on startup
collectAndLogMetrics();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🕵️ Sherlock Dashboard running at http://localhost:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Gateway: localhost:${GATEWAY_PORT}`);
  console.log(`   Metrics: Collecting every hour`);
});
