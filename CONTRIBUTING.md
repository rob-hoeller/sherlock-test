# Contributing to Sherlock Test

## Development Workflow

### Branch Strategy
1. All work starts from `staging` branch
2. Create feature branches: `feature/your-feature-name`
3. Submit PR to merge back into `staging`
4. After review and approval, branch is deleted

### .gitignore
This project uses a standard Node.js .gitignore that excludes:
- `node_modules/` - Dependencies
- `.env*` - Environment variables
- Build outputs and logs
- IDE configuration files

### Testing Locally
```bash
npm install
node server.js
```

Dashboard runs on http://localhost:3000
