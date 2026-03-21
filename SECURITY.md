# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| < 0.8   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in AgentFlow, please report it responsibly.

**Do not open a public issue.** Instead, email **clemence.chee@gmail.com** with:

- A description of the vulnerability
- Steps to reproduce
- Affected version(s)
- Impact assessment (if known)

You should receive an acknowledgement within 48 hours. We will work with you to understand the issue and coordinate a fix before any public disclosure.

## Security Practices

- All packages publish only compiled `dist/` artifacts — no source, config, or test files
- Environment variables (API keys, tokens) are runtime-only and never baked into builds
- TypeScript strict mode is enforced across all packages
- Dependencies are monitored via Dependabot for known vulnerabilities
- CI runs `npm audit` on every push and pull request
