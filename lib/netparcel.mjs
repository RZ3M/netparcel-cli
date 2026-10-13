import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const endpoint = 'https://api.netparcel.com/shipping_service';

export function createClient({ username, password, fetchImpl = fetch }) {
  if (!username || !password) throw new Error('Missing API_USERNAME or API_PASSWORD.');
  return {
    async request(payload) {
      // A purchase is never automatically retried, including after a timeout.
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          API_USERNAME: username,
          API_PASSWORD: password,
        },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(60000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`NetParcel returned HTTP ${response.status}.`);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('NetParcel returned a non-JSON response.');
      }
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('NetParcel returned an invalid JSON response.');
      const clean = (value, key) => {
        if (typeof value === 'string') {
          // Preserve document bytes: these are saved privately, never printed as raw JSON.
          if (key === 'base64_encoded_string') return value;
          for (const secret of [username, password]) value = value.split(secret).join('[redacted]');
          return value;
        }
        if (Array.isArray(value)) return value.map((item) => clean(item));
        if (value && typeof value === 'object')
          return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, clean(v, key)]));
        return value;
      };
      return clean(data);
    },
  };
}

export function errors(data) {
  return [
    ...(Array.isArray(data?.errors) ? data.errors : []),
    ...(Array.isArray(data?.errorMessages) ? data.errorMessages : []),
  ].map((error) =>
    typeof error === 'string' ? error : (error?.errorMessage ?? JSON.stringify(error)),
  );
}

export function quoteRequest(ship) {
  if (ship.customs_invoice) validateCustomsInvoice(ship.customs_invoice);
  return {
    rate: {
      origin: ship.origin,
      destination: ship.destination,
      packaging_information: ship.packaging_information,
      ...(ship.ship_date ? { ship_date: ship.ship_date } : {}),
      ...(ship.special_services ? { special_services: ship.special_services } : {}),
      ...(ship.customs_invoice ? { customs_invoice: ship.customs_invoice } : {}),
      ...(ship.pick_up ? { pick_up: ship.pick_up } : {}),
      items: [],
      breakdown_rates: true,
    },
  };
}

export function validateCustomsInvoice(invoice) {
  const missing = [];
  const present = (value) =>
    typeof value === 'string' && value.trim() && !/REPLACE|<[^>]+>/i.test(value);
  if (!invoice || typeof invoice !== 'object' || Array.isArray(invoice))
    throw new Error('Complete customs_invoice before quoting or buying.');
  for (const field of ['reason_for_export', 'bill_to']) {
    if (!present(invoice[field])) missing.push(`customs_invoice.${field}`);
  }
  if (!/^[A-Z]{3}$/.test(invoice.invoice_currency ?? ''))
    missing.push('customs_invoice.invoice_currency');
  if (!Array.isArray(invoice.items) || !invoice.items.length) missing.push('customs_invoice.items');
  for (const [index, item] of (Array.isArray(invoice.items) ? invoice.items : []).entries()) {
    const prefix = `customs_invoice.items[${index}]`;
    if (!present(item?.description)) missing.push(`${prefix}.description`);
    if (!/^\d{4}\.\d{2}(?:\.\d{2}|\.\d{4}|\.\d{2}\.\d{2})?$/.test(item?.harmonized_code ?? ''))
      missing.push(`${prefix}.harmonized_code (dotted HS format, for example 3926.90)`);
    if (!/^[A-Z]{2}$/.test(item?.origin_country_code ?? ''))
      missing.push(`${prefix}.origin_country_code`);
    if (!Number.isInteger(item?.quantity) || item.quantity <= 0) missing.push(`${prefix}.quantity`);
    for (const field of ['unit_price', 'weight']) {
      if (!Number.isFinite(item?.[field]) || item[field] <= 0) missing.push(`${prefix}.${field}`);
    }
    if (!present(item?.weightUnit)) missing.push(`${prefix}.weightUnit`);
  }
  if (missing.length)
    throw new Error(
      `Complete these customs fields before quoting or buying: ${missing.join(', ')}`,
    );
}

export function validateShipment(ship) {
  const missing = [];
  const present = (value) =>
    typeof value === 'string' && value.trim() && !/REPLACE|<[^>]+>/i.test(value);
  for (const addressName of ['origin', 'destination']) {
    const address = ship[addressName];
    for (const field of [
      'country',
      'postal_code',
      'city',
      'name',
      'address1',
      'phone',
      'company_name',
    ]) {
      if (!present(address?.[field])) missing.push(`${addressName}.${field}`);
    }
    if (['CA', 'US'].includes(address?.country) && !present(address.province))
      missing.push(`${addressName}.province`);
  }
  const parsedDate = new Date(ship.ship_date ?? '');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(ship.ship_date ?? '') ||
    Number.isNaN(parsedDate.valueOf()) ||
    parsedDate.toISOString().slice(0, 10) !== ship.ship_date
  )
    missing.push('ship_date (valid YYYY-MM-DD)');
  const packages = ship.packaging_information?.packages;
  if (
    !present(ship.packaging_information?.packaging_type) ||
    !Array.isArray(packages) ||
    !packages.length
  )
    missing.push('packaging_information');
  for (const [index, pkg] of (Array.isArray(packages) ? packages : []).entries()) {
    for (const field of ['weight', 'length', 'width', 'height']) {
      if (!Number.isFinite(pkg[field]) || pkg[field] <= 0)
        missing.push(`packages[${index}].${field}`);
    }
    if (!present(pkg.description)) missing.push(`packages[${index}].description`);
    if (pkg.weightUnit !== 'lbs')
      missing.push(`packages[${index}].weightUnit (this client uses lbs)`);
  }
  if (ship.origin?.country !== ship.destination?.country && !ship.customs_invoice?.items?.length)
    missing.push('customs_invoice.items for cross-border shipments');
  if (missing.length) throw new Error(`Complete these fields before buying: ${missing.join(', ')}`);
  if (ship.customs_invoice) validateCustomsInvoice(ship.customs_invoice);
}

export function saveDocuments(record, directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const paths = [];
  for (const [index, doc] of (record.documents ?? []).entries()) {
    if (!doc.base64_encoded_string) continue;
    const bytes = Buffer.from(doc.base64_encoded_string, 'base64');
    if (bytes.subarray(0, 5).toString() !== '%PDF-')
      throw new Error(
        `Document ${index + 1} is not a PDF. The saved response retains its original data.`,
      );
    const name =
      String(doc.document_name ?? 'document')
        .replace(/[^a-z0-9_-]/gi, '-')
        .slice(0, 80) || 'document';
    let output = path.join(directory, `${name}-${index + 1}.pdf`);
    if (fs.existsSync(output)) {
      if (!fs.readFileSync(output).equals(bytes)) {
        // NetParcel regenerates PDFs with a new creation timestamp on retrieval.
        // Preserve the previous download and retain this distinct version too.
        const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
        output = path.join(directory, `${name}-${index + 1}-${hash}.pdf`);
      }
    }
    if (!fs.existsSync(output)) {
      fs.writeFileSync(output, bytes, { flag: 'wx', mode: 0o600 });
    } else if (!fs.readFileSync(output).equals(bytes)) {
      throw new Error(`Refusing to overwrite a different document: ${output}`);
    }
    paths.push(output);
  }
  return paths;
}

export async function buyLabel({ client, ship, serviceCode, maxPrice, currency, key, outputRoot }) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/i.test(key ?? ''))
    throw new Error(
      'Provide --key with a unique order reference using letters, numbers, hyphens, or underscores.',
    );
  if (!Number.isFinite(maxPrice) || maxPrice <= 0 || !/^[A-Z]{3}$/.test(currency ?? ''))
    throw new Error('Provide a positive --max-price and three-letter --currency.');
  if (
    !/^\d+$/.test(String(serviceCode ?? '')) ||
    !Number.isSafeInteger(Number(serviceCode)) ||
    Number(serviceCode) <= 0
  )
    throw new Error('Provide --service with the NetParcel service code returned by quote.');
  validateShipment(ship);
  const directory = path.resolve(outputRoot, key);
  const attemptFile = path.join(directory, 'purchase-attempt.json');
  if (fs.existsSync(attemptFile))
    throw new Error(
      `This key already has a purchase attempt. Inspect ${attemptFile} and your NetParcel history before creating another label.`,
    );

  const quoteData = await client.request(quoteRequest(ship));
  const selected = quoteData.rates?.find(
    (rate) => String(rate.service_code) === String(serviceCode),
  );
  if (!selected)
    throw new Error(`Selected service is not available. ${errors(quoteData).join('; ')}`);
  const quotedPrice = Number(selected.total_price);
  if (
    !Number.isFinite(quotedPrice) ||
    quotedPrice <= 0 ||
    selected.currency !== currency ||
    quotedPrice > maxPrice
  ) {
    throw new Error(
      `Quoted price ${selected.currency} ${selected.total_price} does not meet the ${currency} ${maxPrice} limit.`,
    );
  }
  const purchase = structuredClone(ship);
  purchase.service = {
    service_code: Number(selected.service_code),
    service_name: selected.service_name,
  };
  // The workflow generates a local label; it does not send a confirmation email.
  purchase.destination.send_email_confirmation = false;
  const references = purchase.references ?? [];
  if (!references.some((reference) => reference.reference_value === key) && references.length < 3) {
    purchase.references = [...references, { reference_name: 'Client order', reference_value: key }];
  }
  const payload = { ship: purchase };
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const attempt = {
    created_at: new Date().toISOString(),
    state: 'submission_started',
    key,
    endpoint,
    quote: selected,
    quoted_price_limit: { maxPrice, currency },
    request_sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
    request: payload,
  };
  // Exclusive creation prevents two processes from submitting the same local key.
  fs.writeFileSync(attemptFile, JSON.stringify(attempt, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  let data;
  try {
    data = await client.request(payload);
  } catch {
    // Leave the submission record in place. The remote purchase outcome is unknown.
    throw new Error(
      `Purchase outcome is unknown. Do not retry: check NetParcel history and ${attemptFile}.`,
    );
  }
  fs.writeFileSync(path.join(directory, 'response.json'), JSON.stringify(data, null, 2) + '\n', {
    flag: 'wx',
    mode: 0o600,
  });
  const record = data.shipment;
  if (!record?.order_id) {
    fs.writeFileSync(
      attemptFile,
      JSON.stringify({ ...attempt, state: 'api_error', errors: errors(data) }, null, 2) + '\n',
    );
    throw new Error(
      `No shipment confirmed: ${errors(data).join('; ') || 'missing order_id'}. See the saved response.`,
    );
  }
  // Record the paid order before decoding PDFs, so a document error cannot hide a successful purchase.
  fs.writeFileSync(
    attemptFile,
    JSON.stringify(
      {
        ...attempt,
        state: 'shipment_confirmed',
        order_id: record.order_id,
        total_price: record.total_price,
        currency: record.currency,
      },
      null,
      2,
    ) + '\n',
  );
  const documents = saveDocuments(record, directory);
  if (!documents.length)
    throw new Error(
      `Shipment ${record.order_id} was created but no PDF was returned. Use the order command to retrieve it; do not buy again.`,
    );
  return {
    record,
    documents,
    quote: selected,
    actualPriceExceededQuoteLimit:
      Number(record.total_price) > maxPrice || record.currency !== currency,
  };
}
