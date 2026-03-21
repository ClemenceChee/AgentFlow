# Contributing to AgentFlow

Thank you for your interest in contributing to AgentFlow.

## Getting Started

```bash
git clone https://github.com/ClemenceChee/AgentFlow.git
cd AgentFlow
npm install
npm run build
npm test
```

AgentFlow is a monorepo with packages in `packages/`:

| Package | Description |
|---------|-------------|
| `agentflow-core` | Core monitoring, alerting, and process auditing |
| `agentflow-dashboard` | Real-time web dashboard |
| `agentflow-otel` | OpenTelemetry exporter |
| `agentflow-storage` | SQLite-backed trace storage and querying |
| `soma` | Organizational intelligence layer |
| `agentflow-python` | Python integration |

## Development

- **Build**: `npm run build` (all packages)
- **Test**: `npm test`
- **Lint**: `npm run lint` (uses Biome)
- **Typecheck**: `npm run typecheck`

## Pull Requests

1. Fork the repo and create a branch from `master`
2. Make your changes
3. Ensure `npm run build && npm test && npm run typecheck && npm run lint` all pass
4. Write a clear PR description explaining what and why

## Reporting Issues

- **Bugs**: Open a GitHub issue with steps to reproduce
- **Security vulnerabilities**: See [SECURITY.md](SECURITY.md) — do not open a public issue

## License

By contributing, you agree that your contributions will be licensed under the project's [Apache 2.0 + Commons Clause](LICENSE) license.
