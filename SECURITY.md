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
finished. Known-open security issues are tracked publicly rather than hidden:

**[open issues labelled `security`](https://github.com/2389-research/ai-marketing/issues?q=is%3Aissue+is%3Aopen+label%3Asecurity)**

Please check that list before reporting — it is the live one. A copy maintained
here would go stale, and a security document that is wrong about what is already
known is worse than one that says nothing.

## Supported versions

There are no releases. `main` is the only supported branch.
