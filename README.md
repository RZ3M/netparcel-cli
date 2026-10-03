# NetParcel CLI

[![CI](https://github.com/RZ3M/netparcel-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/RZ3M/netparcel-cli/actions/workflows/ci.yml)

An unofficial, dependency-free Node.js CLI for NetParcel's direct JSON shipping API. Compare account rates, submit an intended shipment, and download existing labels and customs documents as PDFs.

**Status:** live quotes and existing-order/PDF retrieval are verified. New shipment creation is documented and its live validation handler responds, but a complete new paid shipment has not yet been tested. Purchase success and recovery are covered by offline mock tests. This project is not affiliated with NetParcel.

## Install

Requires Node.js 22 or newer. CI checks Node.js 22 and 24 on Linux and Windows.

Install directly from GitHub:

```sh
npm install --global github:RZ3M/netparcel-cli
netparcel --help
```

Or use the source checkout without installing packages:

```sh
git clone https://github.com/RZ3M/netparcel-cli.git
cd netparcel-cli
node scripts/netparcel.mjs --help
```

The package is marked `private` to prevent accidental publication to the npm registry. The GitHub repository is public.

## Configure

In the directory where you will run the CLI, create a private `.env` using [.env.example](.env.example):

```dotenv
API_USERNAME=
API_PASSWORD=
NETPARCEL_DATA_DIR=./labels
```

Fill the two credential values from NetParcel My Account. Process environment variables take precedence over `.env`. The CLI reads configuration from your working directory, including when globally installed.

Keep the data directory stable across purchases. It stores private requests, responses, purchase-attempt records, and PDFs. Use an absolute `NETPARCEL_DATA_DIR` if you run the CLI from multiple directories. The repository ignores `.env`, `labels/`, `shipments/`, research captures, and temporary files; exclude a custom data directory from any repository that contains it.

## Commands

The examples below use the globally installed command. From a source checkout, replace `netparcel` with `node scripts/netparcel.mjs`.

### Quote an intended shipment

Copy [examples/shipment.template.json](examples/shipment.template.json) to a private file such as `shipments/shipment.json`. Fill the contact/address fields, package measurements, contents description, and ship date.

```sh
netparcel quote shipments/shipment.json
```

Output is JSON with service names, numeric service codes, prices, currencies, and transit estimates. Carrier warnings go to stderr without discarding other successful quotes.

### Download an existing label

Supply an order ID belonging to your NetParcel account:

```sh
netparcel order ORDER_ID
```

This saves the response and original PDFs in `labels/ORDER_ID/` by default. The command prints the order summary and saved document paths as JSON. Distinct regenerated PDF versions are retained.

### Buy a label

Choose a service from the quote, set a price/currency limit, and assign a unique reference to the intended shipment:

```sh
netparcel buy shipments/shipment.json --service SERVICE_CODE --max-price MAX_PRICE --currency CAD --key UNIQUE_REFERENCE
```

**`buy` creates a paid shipment.** It obtains a fresh quote, checks the selected service and local price limit, records the attempt, submits once, and saves the returned order and PDFs. Recipient confirmation email is disabled.

`--max-price` limits the quote accepted by this client. NetParcel does not document a server-side maximum price field; the returned purchase total may differ. Any returned total/currency outside the quote limit is reported and saved.

Every attempt retains its local key. A timeout may follow a successful remote purchase, so the client never automatically retries. Check NetParcel's shipment history and the saved attempt before taking another purchase action. If an order ID is confirmed but PDF processing fails, recover with `order ORDER_ID`.

Local attempt records prevent duplicate submissions using the same key and data directory. They do not provide provider-side idempotency or protection across separate data directories.

## Shipment details and limits

- The template is for domestic goods using pounds (`weightUnit: "lbs"`). The guide does not clearly state a dimension unit; confirm the account's convention before the first intended purchase.
- Cross-border goods require accurate customs-invoice details. See [API notes](docs/API.md) and the linked provider guide.
- Pickup is sent only when included in the input. Pickup defaults, cancellation/refunds, return labels, and carrier-specific formats have not been verified.
- PDFs are saved in the format NetParcel returns. A 4×6 or ZPL selector is not implemented.
- Credentials are redacted from output. Shipment summaries, response files, and PDFs still contain customer information; keep them private.

## Development

No runtime or development package dependencies are required.

```sh
npm ci --ignore-scripts
npm run hooks
npm run check
npm test
npm run check:package
```

Tests use mock responses and do not call NetParcel or purchase labels. CI audits tracked files and the distributable package. Optional Git hooks audit staged files and history, including against local API credentials when available.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [API research notes](docs/API.md), and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
