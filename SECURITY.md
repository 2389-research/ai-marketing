# Security Policy

## Reporting a vulnerability

Please report security issues privately, not as a public issue.

**Preferred:** use GitHub's private vulnerability reporting — the **Security** tab
on this repository → **Report a vulnerability**. That opens a private advisory
visible only to the maintainers.

**Alternative:** email <security@2389.ai> with "SECURITY" in the subject.

Please include what you found, how to reproduce it, and what an attacker could do
with it. We will acknowledge within a few business days. This is a small team
maintaining an internal tool in the open, so please don't expect a same-day
response or a bounty.

Do not run automated scanners, brute-force tooling, or destructive tests against
any hosted instance you do not own.

## Known issues — read before deploying

This is an internal tool developed in the open, and its tenancy boundary is not
finished. The open security issues are tracked publicly rather than hidden:

- [#1](https://github.com/2389-research/ai-marketing/issues/1) — row-level
  security is not enabled; the schema in `sql/` grants full CRUD to the Supabase
  `anon` role on every table.
- [#2](https://github.com/2389-research/ai-marketing/issues/2) — per-tenant social
  API tokens are stored in that same anon-readable table.
- [#6](https://github.com/2389-research/ai-marketing/issues/6) — the legacy
  shared-password login stores the master token as the session cookie.

[Issue #25](https://github.com/2389-research/ai-marketing/issues/25) is the full
codebase review and the recommended order of work;
[#26](https://github.com/2389-research/ai-marketing/issues/26) is the migration
that supersedes much of it.

**Treat a deployment of this code as having a public database until #1 is
closed.** Reports about anything already listed above are appreciated but
redundant — reports of anything else very much are not.

## Supported versions

There are no releases. `main` is the only supported branch.
