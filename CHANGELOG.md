# Changelog

## 0.2.0

- Record a verified paid Canada Post Tracked Packet – USA shipment and PDF retrieval.
- Validate customs item weights, units, positive values, quantities, and dotted HS formats before quoting or purchasing.
- Add an international shipment template and clarify shipper billing behavior.
- Add optional `crop` support for exact 4 × 6 vector print copies, preserving original PDFs and refusing unsupported layouts without an explicit region.
- Add synthetic barcode-preservation PDF tests and Linux/Windows Python CI.

## 0.1.0

- Direct JSON API commands for quotes, purchases, and existing-order/PDF retrieval.
- Environment and working-directory configuration; installable `netparcel` command.
- Fresh quote selection, local price/currency checks, and persistent purchase-attempt protection.
- PDF version preservation and recovery using confirmed order IDs.
- Offline tests, public-file/package audits, Git hooks, and cross-platform CI.

At the initial release, production rates and existing-order/PDF retrieval were verified; complete paid shipment verification followed in 0.2.0.
