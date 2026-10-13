# Direct JSON API notes

This is an unofficial client. Its contract was researched using NetParcel's provider-authored JSON guide and independently checked against the live API. No account responses or customer documents are distributed with the project.

## Transport

```text
POST https://api.netparcel.com/shipping_service
Content-Type: application/json
API_USERNAME: <API username>
API_PASSWORD: <API password>
```

The client uses HTTPS, refuses redirects, sets a request timeout, and performs no automatic retries.

| Top-level body           | Operation                  | Response                                                         |
| ------------------------ | -------------------------- | ---------------------------------------------------------------- |
| `rate`                   | Compare quotes             | `rates` array; may also contain carrier errors                   |
| `ship`                   | Submit a paid shipment     | `shipment`, including order ID, charges, tracking, and documents |
| `order` with `order_id`  | Retrieve an existing order | `order`, including status and documents                          |
| `cancel` with `order_id` | Request cancellation       | Documented; deliberately absent from this CLI                    |

HTTP 200 does not mean success. Application errors may appear under `errors` or `errorMessages`. A populated `shipment.order_id` is needed to confirm a created order. Carrier warnings can coexist with useful quotes.

## Shipment input

The CLI accepts one top-level `ship` object. Start with [the domestic template](../examples/shipment.template.json) or [the international template](../examples/international-shipment.template.json). For purchases, the CLI supplies `service.service_code` as a number from the fresh quote.

The shipment includes origin and destination contact/address fields, a `YYYY-MM-DD` ship date, and `packaging_information` with a packaging type and packages. Each package supplies positive numeric weight and dimensions, a contents description, and `weightUnit: "lbs"`.

The guide does not clearly state the dimension unit. The verified Canada-to-US purchase used inches and omitted pickup for drop-off. Pickup scheduling remains unverified.

Cross-border goods need a `customs_invoice`. Its fields include export reason, billing party, currency, and items with description, HS code, origin country, quantity, unit value, and weight. NetParcel validates the complete carrier-specific requirements. Do not copy fictitious customs values into a real shipment.

The live API established requirements that the older guide does not describe reliably:

- Each customs item needs a positive `weight` and a `weightUnit`; the verified request used `"lbs"`. Omitting the weight caused an opaque `Unable to parse JSON Request null` rate error.
- Purchase validation requires dotted HS formats: `####.##`, `####.##.##`, `####.##.####`, or `####.##.##.##`. A six-digit code without dots was rejected. The client validates the format and preserves the supplied code in both quote and purchase requests.
- `customs_invoice.bill_to: "Shipper"` was accepted, despite the guide's narrower billing-party enum. This selects the invoice billing party; it does not establish that every applicable duty or tax is prepaid or included in a quote.

The client validates provided customs details before requesting rates or creating a purchase attempt. It requires nonempty export reason and billing party, uppercase currency/country codes, integer item quantities, and positive numeric item values and weights. Rate-only requests may omit customs details; cross-border purchases may not.

Optional fields include insurance, special services, pickup details, and up to three references. The client sets recipient confirmation email to false and adds the local purchase key as a reference when space is available.

## Documents and recovery

Documents contain `document_name` and `base64_encoded_string`. The client decodes PDF bytes, checks their PDF signature, and saves the original response before decoding. The document names are sanitized before becoming filenames. A refreshed download can have a new PDF timestamp; different versions receive a content-hash suffix.

The original PDF bytes remain unchanged when creating a [4 × 6 print copy](PRINTING.md). Keep any separate customs-invoice pages. Provider-generated documents may round measurements or declared values and shorten descriptions; review the returned documents against the submitted shipment.

A confirmed order is recorded before PDF processing. If PDF saving fails or no PDF is returned, use the `order` command with the confirmed ID. A timeout is an uncertain purchase outcome: check the provider's history and retain the existing local purchase key. The local price ceiling is applied to quotes; no server-side maximum price or idempotency field was found in the guide.

## Verification and references

Live checks verified rate requests, existing-order retrieval, and a complete paid Canada Post Tracked Packet – USA shipment. Returned label and customs PDFs were decoded, viewed, and compared with the original response bytes. The right-hand shipping label was successfully converted to a vector 4 × 6 print copy with matching barcode payloads. This verifies that service and layout; it does not establish purchase behavior for every carrier. Automated purchase/recovery tests use mock responses, and PDF tests use synthetic documents.

- [NetParcel JSON API Developer Guide v1.4, public third-party copy](https://github.com/PeonCrystal/Shipping-systems/blob/main/Docs/netParcel_JSON_API_Developer_Guide_v1.4.pdf). The PDF identifies NetParcel as its author and carries a 2021 copyright. It is linked, not redistributed.
- [NetParcel ShippingService WSDL](https://api.netparcel.com/services/ShippingService?wsdl).
- [NetParcel SOAP service index](https://api.netparcel.com/services).

The old guide's `www.netparcel.com/shipping_service` hostname is stale; the working `api.netparcel.com` endpoint was verified independently. SOAP POST controls returned XML faults for unqualified XML but HTML 403 for namespaced XML, even without credentials. This suggests request filtering; the exact rule is unconfirmed. The JSON client does not depend on SOAP.
