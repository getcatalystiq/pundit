# Contributing to Pundit

Thanks for your interest in contributing to Pundit!

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 20+
- Docker
- AWS CLI configured
- SAM CLI (`pip install aws-sam-cli`)

### Local Development

```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/pundit.git
cd pundit

# Start local development (PostgreSQL + SAM API + Admin UI)
./scripts/local-dev.sh

# Or run components individually
./scripts/local-dev.sh --db   # PostgreSQL only
./scripts/local-dev.sh --api  # SAM Local API (port 3000)
./scripts/local-dev.sh --ui   # Admin UI (port 5173)
```

### Admin UI Development

```bash
cd admin-ui
npm install
npm run dev
```

## Submitting Changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Test locally with `./scripts/local-dev.sh`
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

### Commit Messages

Write clear, concise commit messages:

```
Add OAuth token refresh endpoint

- Implement refresh token rotation
- Add token expiry validation
- Update tests
```

### Code Style

**Python:**
- Follow PEP 8
- Use type hints
- Keep functions focused and small

**TypeScript:**
- Use TypeScript strict mode
- Prefer functional components
- Use existing UI components from `src/components/ui`

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (AWS region, Python version)
- Relevant logs

### Feature Requests

Describe:
- The problem you're solving
- Your proposed solution
- Alternative approaches considered

## Questions?

Open a GitHub Discussion for questions about the codebase or usage.
