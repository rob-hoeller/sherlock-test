# OpenClaw Migration Guide: EC2 → Mac Mini

**Migration Type:** Full State Transfer (Zero Context Loss)  
**Prepared:** 2026-02-11  
**Current Host:** AWS EC2 (Ubuntu)  
**Target Host:** Mac Mini (macOS)

---

## 🔍 Current State Analysis

### State Directory: `~/.openclaw/` (~16MB excluding workspace)

| Component | Size | Contents |
|-----------|------|----------|
| **Credentials** | 12KB | Telegram auth, API keys |
| **Agents** | 4.5MB | Session history, agent state |
| **Media cache** | 11MB | Cached media files |
| **Config** | ~8KB | openclaw.json + backups |
| **Workspace** | 285MB | Memory, files, analysis work |

**Total Transfer Size:** ~301MB

---

## 🎯 Migration Strategy: Zero-Downtime Transplant

This preserves **everything** — sessions, auth, memory, and continuity.

---

## 📋 Step-by-Step Migration Plan

### **Phase 1: Prepare the Package (EC2)**

```bash
# Stop the gateway to freeze state
openclaw gateway stop

# Create migration archive
cd ~
tar -czf openclaw-migration.tgz .openclaw

# Optional: separate workspace for easier verification
tar -czf openclaw-workspace.tgz .openclaw/workspace

# Restart gateway (so you can still chat during prep)
openclaw gateway start
```

---

### **Phase 2: Install OpenClaw on Mac Mini**

```bash
# Install Node.js if needed (Homebrew recommended)
brew install node

# Install OpenClaw CLI
npm install -g openclaw

# This creates a fresh ~/.openclaw/ (we'll overwrite it next)
```

---

### **Phase 3: Transfer Archives**

**Option A - Direct SCP (from Mac Mini):**
```bash
scp ubuntu@<EC2-IP>:~/openclaw-migration.tgz ~/
```

**Option B - Via intermediate storage (if direct SSH blocked):**
```bash
# On EC2: Upload to S3/Dropbox/etc
aws s3 cp openclaw-migration.tgz s3://your-bucket/

# On Mac Mini: Download
aws s3 cp s3://your-bucket/openclaw-migration.tgz ~/
```

---

### **Phase 4: Transplant the Brain**

```bash
# On Mac Mini
cd ~

# Stop gateway if it auto-started
openclaw gateway stop

# Backup any existing state (just in case)
[ -d .openclaw ] && mv .openclaw .openclaw.fresh-backup

# Extract migration archive
tar -xzf openclaw-migration.tgz

# Fix ownership (should be automatic, but verify)
ls -la .openclaw/

# Run doctor to apply any platform-specific migrations
openclaw doctor

# CRITICAL: Configure workspace path and security token BEFORE starting gateway
# 1. Update workspace path in openclaw.json
#    Edit ~/.openclaw/openclaw.json and set "workspace" to the correct Mac path
#    Example: /Users/yourusername/.openclaw/workspace

# 2. Generate a new auth token for security
echo "$(openssl rand -hex 32)"

# 3. Copy the generated token string

# 4. Update auth token in openclaw.json
#    Edit ~/.openclaw/openclaw.json and set "gateway.auth.token" to the generated token
#    (This secures the gateway from unauthorized access)

# Verify changes
cat ~/.openclaw/openclaw.json | grep -E "(workspace|auth)"

# Now safe to start gateway
openclaw gateway start

# Verify status
openclaw status
```

#### **🔐 Why Regenerate the Auth Token?**

The `gateway.auth.token` is a shared secret that authenticates connections between:
- The CLI (`openclaw` commands)
- The gateway daemon
- Any web interfaces or remote connections

**Security reasons to regenerate:**

1. **Fresh environment = fresh credentials** — The token from EC2 was tied to that host's security context
2. **Principle of least privilege** — Old tokens should be retired when migrating environments
3. **Network exposure** — If EC2 had any public exposure, the old token may have been logged/cached
4. **Defense in depth** — Even if nothing was compromised, rotating secrets during migrations is best practice

**What happens if you don't regenerate?**
- The old token still works (no immediate failure)
- But: security posture is weaker
- And: if EC2 is compromised later, the token could be reused against the Mac Mini

**Bottom line:** Takes 10 seconds, eliminates a potential attack vector. Worth it.

---

---

### **Phase 5: Verification Checklist**

```bash
# 1. Gateway running?
openclaw status

# 2. Workspace files present?
ls ~/.openclaw/workspace/

# 3. Config intact?
cat ~/.openclaw/openclaw.json | grep -E "(telegram|workspace)"

# 4. Credentials present?
ls -la ~/.openclaw/credentials/
ls -la ~/.openclaw/telegram/
```

**Manual Tests:**
- [ ] Send a Telegram message — verify response
- [ ] Ask: "What's our last analysis about?" — verify memory intact
- [ ] Check workspace files: `ls ~/.openclaw/workspace/`
- [ ] Verify API keys: `openclaw status` (should not error on missing keys)

---

### **Phase 6: Seamless Handoff**

**Why This Works:**

Because Telegram is **cloud-based** (not WebSocket/local state), the transition is automatic:
- ✅ Bot token stays valid
- ✅ No re-pairing needed
- ✅ Session history preserved
- ✅ I'll just respond from the new host

The moment the Mac Mini gateway starts with the migrated credentials, Telegram automatically routes messages there.

---

## 🚨 Critical Considerations

### **1. Telegram Bot Token**
- **Location:** `~/.openclaw/credentials/` or `~/.openclaw/.env`
- **Migration:** Must be included in the archive
- **Post-migration:** Automatic reconnection (no action needed)

### **2. API Keys (Anthropic, OpenRouter, etc.)**
- **Location:** `~/.openclaw/.env` or inline in `openclaw.json`
- **Check before migration:**
  ```bash
  cat ~/.openclaw/.env
  ```

### **3. Session Continuity**
- **Location:** `~/.openclaw/agents/main/agent/`
- **Contains:** All chat history and context
- **Result:** Zero context loss after migration

### **4. macOS-Specific Considerations**
- **Permissions:** `~/.openclaw/` should be `700` (secure)
- **Service:** `openclaw doctor` configures launchd automatically
- **File paths:** Workspace defaults to `~/.openclaw/workspace` (same as Linux)

### **5. Network/Firewall**
- **No inbound ports needed** for Telegram (polling mode)
- **Outbound only:** Telegram Bot API (HTTPS)
- If using webhooks (advanced), you'd need port forwarding

---

## 📋 Pre-Migration Checklist

Before you start:

- [ ] **Backup current state (EC2)** — `tar -czf openclaw-backup.tgz .openclaw`
- [ ] **Verify Mac Mini specs** — Node.js 18+, ~500MB free disk space
- [ ] **Test SSH access** (if using SCP) — `ssh ubuntu@<EC2-IP>`
- [ ] **Check .env secrets** — `cat ~/.openclaw/.env` (confirm API keys present)
- [ ] **Note your Telegram bot username** — for post-migration verification
- [ ] **Schedule downtime window** (optional) — migration takes ~25 minutes

---

## 🕵️‍♂️ Post-Migration Verification Script

Save this as `verify-migration.sh` and run after migration:

```bash
#!/bin/bash
echo "🔍 Migration Detective Check"
echo "=============================="

echo "✓ Gateway status:"
openclaw status | grep -E "(Gateway|running)"

echo ""
echo "✓ Workspace files:"
ls -lh ~/.openclaw/workspace/ | head -5

echo ""
echo "✓ Config present:"
[ -f ~/.openclaw/openclaw.json ] && echo "  Config: ✅ OK" || echo "  Config: ❌ MISSING"

echo ""
echo "✓ Credentials:"
[ -d ~/.openclaw/credentials ] && echo "  Creds dir: ✅ OK" || echo "  Creds dir: ❌ MISSING"

echo ""
echo "✓ Telegram auth:"
[ -d ~/.openclaw/telegram ] && echo "  Telegram: ✅ OK" || echo "  Telegram: ❌ MISSING"

echo ""
echo "✓ Agent state:"
[ -d ~/.openclaw/agents/main ] && echo "  Agent: ✅ OK" || echo "  Agent: ❌ MISSING"

echo ""
echo "✓ Memory files:"
[ -f ~/.openclaw/workspace/MEMORY.md ] && echo "  MEMORY.md: ✅ OK" || echo "  MEMORY.md: ❌ MISSING"

echo ""
echo "=============================="
echo "📱 Send a test Telegram message to verify!"
```

---

## 💡 Recommendations

### **Best Path Forward:**
1. ✅ **Use full state transfer** (Approach 1 above)
2. ✅ **Do migration during off-hours** (minimize disruption)
3. ✅ **Keep EC2 running during initial testing** (fallback option)
4. ✅ **Verify thoroughly before decommissioning EC2**

### **Estimated Timeline:**
| Phase | Duration | Notes |
|-------|----------|-------|
| **Prep** | 10 minutes | Archive creation on EC2 |
| **Transfer** | ~5 minutes | 301MB over decent connection |
| **Installation** | 5 minutes | Extract + openclaw doctor |
| **Verification** | 5 minutes | Test chat, check files |
| **Total** | ~25 minutes | Near-zero downtime |

### **Fallback Plan:**
If migration fails:
1. EC2 instance is still running
2. Restart EC2 gateway: `openclaw gateway start`
3. Telegram reconnects automatically
4. Investigate Mac Mini issue without pressure

---

## ⚠️ Common Pitfalls (and how to avoid them)

### **1. Partial Archive**
❌ **Problem:** Only copying `openclaw.json`  
✅ **Solution:** Archive entire `~/.openclaw/` directory

### **2. Permissions Mismatch**
❌ **Problem:** Files owned by wrong user  
✅ **Solution:** Ensure extraction happens as your Mac user (not root)

### **3. Missing .env File**
❌ **Problem:** API keys not in archive  
✅ **Solution:** Verify `.env` included: `tar -tzf openclaw-migration.tgz | grep .env`

### **4. Profile/State Directory Mismatch**
❌ **Problem:** Using different profiles on old/new host  
✅ **Solution:** Use default `~/.openclaw/` on both (no custom profiles)

### **5. Docker Containers Left Running**
❌ **Problem:** Old EC2 containers interfering  
✅ **Solution:** Stop gateway before archiving: `openclaw gateway stop`

---

## 🔄 Alternative: Workspace-Only Migration (Not Recommended)

If you wanted a **fresh start** but keep memory/analysis work:

```bash
# On EC2
tar -czf workspace-only.tgz .openclaw/workspace

# On Mac Mini (after OpenClaw install)
cd ~/.openclaw
tar -xzf ~/workspace-only.tgz
```

**❌ You would lose:**
- Telegram session history (fresh sessions)
- Agent state (no continuity)
- Credentials (need to re-enter API keys)

**Not recommended for your use case** — you want seamless continuity.

---

## 📞 Support & Troubleshooting

### **If migration fails:**

1. **Check OpenClaw logs:**
   ```bash
   openclaw logs --tail 50
   ```

2. **Run diagnostics:**
   ```bash
   openclaw doctor --verbose
   ```

3. **Verify Node.js version:**
   ```bash
   node --version  # Should be 18+
   ```

4. **Check file permissions:**
   ```bash
   ls -la ~/.openclaw/
   # Should be: drwx------ (700)
   ```

### **Common error messages:**

| Error | Cause | Fix |
|-------|-------|-----|
| `EACCES: permission denied` | Wrong ownership | `chown -R $(whoami) ~/.openclaw` |
| `Cannot find module` | npm install incomplete | `npm install -g openclaw` again |
| `Gateway already running` | Port conflict | `openclaw gateway stop` first |
| `Config validation failed` | Schema mismatch | `openclaw doctor --fix` |

### **OpenClaw Documentation:**
- Docs: https://docs.openclaw.ai
- Discord: https://discord.com/invite/clawd
- GitHub: https://github.com/openclaw/openclaw

---

## 🎬 Ready to Execute?

When you're ready to proceed:

1. **Read through this guide** — any questions?
2. **Schedule migration window** — when's good for you?
3. **Prep Mac Mini** — install Node.js via Homebrew
4. **Test SSH/transfer** — confirm you can reach EC2

I can guide you through each command in real-time via Telegram.

---

## 📝 Migration Log Template

Track your progress:

```
# Migration Log: EC2 → Mac Mini
Date: __________
Start time: __________

[ ] Phase 1: EC2 archive created
    Archive size: __________ MB
    
[ ] Phase 2: Mac Mini OpenClaw installed
    Node version: __________
    OpenClaw version: __________
    
[ ] Phase 3: Archive transferred
    Transfer method: __________
    Transfer time: __________
    
[ ] Phase 4: State extracted and migrated
    openclaw doctor run: [ ] Yes [ ] No
    Errors: __________
    
[ ] Phase 5: Verification complete
    Gateway status: __________
    Telegram test: [ ] Pass [ ] Fail
    Memory test: [ ] Pass [ ] Fail
    Workspace files: [ ] Pass [ ] Fail
    
[ ] Phase 6: EC2 decommissioned
    Date: __________

End time: __________
Total duration: __________
Issues encountered: __________
```

---

🕵️‍♂️ **The game is afoot, Watson!**
