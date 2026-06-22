# Security Policy

This repository is a public CI mirror — it runs deterministic core-proof tests for the underlying private translation product.

## Reporting Security Issues

Report privately via GitHub's private vulnerability reporting:
→ https://github.com/2133611700c-sudo/uscis-helper-ci/security/advisories/new

Do not open public issues for security concerns.

## Scope
- Workflow security (action poisoning, secret exfiltration paths)
- Supply chain risks in this mirror's dependency tree
- CI logic bugs in core-proof.yml

## Out of scope
- Issues in the private source product (route to owner directly)
- Test fixture content (synthetic by design)
