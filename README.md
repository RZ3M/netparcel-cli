# NetParcel CLI

[![CI](https://github.com/RZ3M/netparcel-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/RZ3M/netparcel-cli/actions/workflows/ci.yml)

An unofficial Node.js CLI for NetParcel's direct JSON shipping API. Compare account rates, buy a label, download original PDFs, and create a 4 × 6 print copy. API commands have no package dependencies; PDF cropping uses optional Python packages.

**Status:** live quotes, a paid Canada Post Tracked Packet – USA shipment, and original label/customs PDF retrieval are verified. Other carriers and services have not been verified by purchasing labels. Automated tests use synthetic data and never buy shipments. This project is not affiliated with NetParcel.

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

Copy [the domestic template](examples/shipment.template.json) or [the international template](examples/international-shipment.template.json) to a private file such as `shipments/shipment.json`. Fill the contact/address fields, package measurements, contents description, and ship date. For international shipments, also fill every customs item using its actual description, origin, quantity, value, weight, and dotted HS code.

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

### Create a 4 × 6 print copy

Install Python 3.12 or newer and the optional PDF packages from a source checkout:

```sh
python -m pip install -r requirements-pdf.txt
netparcel crop labels/ORDER_ID/ORIGINAL.pdf --out labels/ORDER_ID/print-4x6.pdf
```

With a global installation, the equivalent dependency command is `python -m pip install pdfplumber==0.11.9 pypdf==6.10.0`. Set `NETPARCEL_PYTHON` to your Python executable if necessary.

The cropper recognizes the Canada Post Tracked Packet – USA landscape layout and extracts its right-hand shipping label, including the customs declaration. It preserves vector content and the original PDF, uses uniform scaling, and produces one exact 4 × 6 inch page. It also accepts an existing 4 × 6 page. Other layouts require inspection and an explicit crop region; see [printing instructions](docs/PRINTING.md). Print at actual size on 4 × 6 paper and retain the original customs documents.

## Shipment details and limits

- Templates use pounds (`weightUnit: "lbs"`) and package dimensions in inches, as used in the verified purchase. Convert measurements before filling the input.
- Cross-border goods require accurate customs-invoice details. The client checks dotted HS codes, positive item weights with units, quantities, values, and country/currency codes. See [API notes](docs/API.md).
- Pickup is sent only when included in the input. Pickup defaults, cancellation/refunds, return labels, and carrier-specific formats have not been verified.
- Original PDFs are saved exactly as returned. `crop` creates a local print copy; no provider-side format or ZPL selector is implemented.
- Credentials are redacted from output. Shipment summaries, response files, and PDFs still contain customer information; keep them private.

## Development

Node.js commands and tests require no package dependencies. Optional PDF tests require the packages in `requirements-pdf-test.txt`.

```sh
npm ci --ignore-scripts
npm run hooks
npm run check
npm test
npm run check:package
```

Tests use mock responses and do not call NetParcel or purchase labels. CI audits tracked files and the distributable package. Optional Git hooks audit staged files and history, including against local API credentials when available.

Personal automation skills, sender profiles, private defaults, and shipment documents belong outside the public package.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [API research notes](docs/API.md), and [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE).
