<!-- description: Pre-ship security checklist. Verify these before any code reaches production — input handling, dependency hygiene, HTTP headers, and data exposure checks. -->

# Security — Audit Checklist

> Run this checklist before every deployment. Not after the incident.

---

## Input and output

- [ ] All user input is validated before use — schema validation at the API boundary
- [ ] All user input is sanitized before being stored or rendered
- [ ] No raw SQL string concatenation — parameterized queries or ORM only
- [ ] HTML output is escaped — no raw `innerHTML` with user data
- [ ] File uploads: type checked, size limited, stored outside the web root
- [ ] API responses never include fields that were not explicitly selected

## Authentication and sessions

- [ ] All protected routes verify authentication before any business logic runs
- [ ] Session tokens are rotated on privilege escalation (login, role change)
- [ ] Passwords are hashed with bcrypt, argon2, or scrypt — never MD5 or SHA1
- [ ] Password reset tokens are single-use and expire within 15–60 minutes
- [ ] MFA is available for admin and privileged accounts

## Authorization

- [ ] Every route and action checks that the authenticated user is permitted to perform it
- [ ] Authorization is checked in the service layer, not only at the route level
- [ ] Horizontal privilege escalation is impossible — user A cannot access user B's resources by guessing IDs
- [ ] Admin routes are separate from user routes and have their own auth middleware

## HTTP and headers

- [ ] `Content-Security-Policy` header is set
- [ ] `X-Content-Type-Options: nosniff` is set
- [ ] `X-Frame-Options: DENY` (or `SAMEORIGIN`) is set
- [ ] `Strict-Transport-Security` is set for HTTPS deployments
- [ ] CORS policy explicitly lists allowed origins — no wildcard `*` on credentialed endpoints
- [ ] Rate limiting is applied to auth endpoints and any endpoint that sends emails or SMS

## Secrets and configuration

- [ ] No secrets in source control (current or historical commits)
- [ ] All secrets are in environment variables, accessed through the config module
- [ ] `.env` files are in `.gitignore`
- [ ] CI/CD environment secrets are stored in the platform's secrets manager, not in config files
- [ ] API keys and tokens have the minimum required permissions (principle of least privilege)

## Dependencies

- [ ] `npm audit` passes with no critical or high vulnerabilities
- [ ] Dependencies are pinned to exact versions in `package.json` (not ranges in production)
- [ ] No abandoned or unverified packages used for security-critical operations (crypto, auth, JWT)

## Data exposure

- [ ] PII fields (email, phone, address) are identified and access-logged
- [ ] Passwords and tokens are never returned in API responses
- [ ] Error messages returned to clients do not include stack traces, query text, or file paths
- [ ] Database credentials are not logged anywhere