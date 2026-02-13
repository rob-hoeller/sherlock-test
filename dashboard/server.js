const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const http = require('http');

const app = express();
const PORT = 3000;

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
    const result = await callGateway('/api/sessions?messageLimit=5');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🕵️ Sherlock Dashboard running at http://localhost:${PORT}`);
  console.log(`   Workspace: ${WORKSPACE}`);
  console.log(`   Gateway: localhost:${GATEWAY_PORT}`);
});
