# Security policy

## Supported version

Security fixes are provided for the latest commit on `main`. This is an early-stage, unofficial client. A Canada Post Tracked Packet – USA purchase has been verified against the production API; other carrier-specific behavior may differ.

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/RZ3M/netparcel-cli/security/advisories/new). Do not include credentials, customer addresses, phone numbers, real order or tracking IDs, or label documents in public issues or pull requests.

## Credentials and customer data

- Keep credentials in the process environment or a private `.env` in your working directory. The example file contains empty values.
- `labels/` holds shipment requests, responses, tracking information, purchase records, and PDFs. `shipments/` is intended for private input files. Both are ignored by Git in this repository.
- A custom `NETPARCEL_DATA_DIR` must also be kept private and excluded from any repository that contains it. Keep its path stable to preserve purchase-attempt records.
- `.gitignore` and the audit scripts are guardrails. Review staged changes before pushing; they cannot recognize every possible form of personal information.
- Git hooks are opt-in for contributors. CI runs the public-file and package audits without production API credentials.
- The client redacts configured API credentials in output, refuses redirects, and never automatically retries a purchase. Responses and labels still contain customer data.
- New files use owner-only POSIX permissions where supported. Windows access is governed by the directory's ACLs.
- Cropped print copies contain the same customer information as the original label. Keep them private alongside the original documents and any personal automation profiles.

If a purchase times out, inspect the provider's shipment history before taking another purchase action. Reusing the same local key is blocked, but the provider does not document server-side idempotency.
