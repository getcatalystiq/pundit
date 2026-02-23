# Contributing to Pundit

Thanks for your interest in contributing to Pundit!

## Getting Started

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) PostgreSQL database with pgvector enabled

### Local Development

```bash
# Clone the repository
git clone https://github.com/getcatalystiq/pundit.git
cd pundit

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local
# Edit .env.local with your values

# Run database migrations
npm run migrate

# Start dev server
npm run dev
```

The dev server runs at `http://localhost:3000` with Turbopack hot reload.

## Submitting Changes

### Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run `npm run build` to verify the production build
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

### Commit Messages

Write clear, concise commit messages:

```
Add OAuth token refresh endpoint

- Implement refresh token rotation
- Add token expiry validation
```

### Code Style

- Use TypeScript strict mode
- Prefer functional components for React
- Use existing UI components from `components/ui`
- Use `jsonResponse()` from `lib/utils.ts` instead of `Response.json()` (Turbopack requirement)
- Use lazy getters for environment variables (never validate at module level)

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected vs actual behavior
- Node.js version and OS
- Relevant logs

### Feature Requests

Describe:
- The problem you're solving
- Your proposed solution
- Alternative approaches considered

## Questions?

Open a GitHub Discussion for questions about the codebase or usage.
