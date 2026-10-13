import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createClient, buyLabel, saveDocuments, quoteRequest } from '../lib/netparcel.mjs';

fs.mkdirSync('tmp/tests', { recursive: true });
const root = fs.mkdtempSync(path.resolve('tmp/tests/run-'));
const example = {
  origin: {
    country: 'CA',
    province: 'ON',
    city: 'Toronto',
    postal_code: 'M5H2N2',
    name: 'Test sender',
    address1: 'Test address',
    phone: '4165550100',
    company_name: 'Test sender',
  },
  destination: {
    country: 'CA',
    province: 'ON',
    city: 'Ottawa',
    postal_code: 'K1P1J1',
    name: 'Test recipient',
    address1: 'Test address',
    phone: '6135550100',
    company_name: 'Test recipient',
    send_email_confirmation: true,
  },
  ship_date: '2026-10-05',
  packaging_information: {
    packaging_type: 'My Packaging',
    packages: [
      {
        length: 10,
        width: 8,
        height: 4,
        weight: 1,
        weightUnit: 'lbs',
        description: 'Test contents',
      },
    ],
  },
};
const rate = {
  service_code: '204',
  service_name: 'UPS Standard',
  total_price: '15.21',
  currency: 'CAD',
};
const pdf = Buffer.from('%PDF-1.4\nmock PDF bytes\n').toString('base64');
const shipment = {
  order_id: 123,
  total_price: 15.21,
  currency: 'CAD',
  documents: [{ document_name: 'labels', base64_encoded_string: pdf }],
};
function options(client, key) {
  return {
    client,
    key,
    ship: structuredClone(example),
    serviceCode: '204',
    maxPrice: 20,
    currency: 'CAD',
    outputRoot: root,
  };
}

test('HTTP 200 JSON responses are parsed and echoed credentials are redacted', async () => {
  let calls = 0;
  const client = createClient({
    username: 'secret-user',
    password: 'secret-password',
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.netparcel.com/shipping_service');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.API_PASSWORD, 'secret-password');
      return new Response(
        JSON.stringify({ errors: [{ errorMessage: 'secret-user secret-password' }] }),
        { status: 200 },
      );
    },
  });
  const data = await client.request({ order: { order_id: -1 } });
  assert.equal(calls, 1);
  assert.equal(data.errors[0].errorMessage, '[redacted] [redacted]');
});

test('missing shipment fields prevent all network activity', async () => {
  const opts = options({ request: () => assert.fail('Network must not run') }, 'missing');
  opts.ship.destination.address1 = 'REPLACE';
  await assert.rejects(buyLabel(opts), /destination.address1/);
});

function internationalOptions(client, key) {
  const result = options(client, key);
  result.ship.destination = {
    ...result.ship.destination,
    country: 'US',
    province: 'WA',
    city: 'Seattle',
    postal_code: '98101',
  };
  result.ship.customs_invoice = {
    reason_for_export: 'Sale',
    bill_to: 'Shipper',
    invoice_currency: 'CAD',
    items: [
      {
        description: 'Synthetic plastic item',
        harmonized_code: '3926.90',
        origin_country_code: 'CA',
        quantity: 1,
        unit_price: 10,
        weight: 1,
        weightUnit: 'lbs',
      },
    ],
  };
  return result;
}

test('customs validation prevents invalid HS codes and missing item weights before any request or purchase record', async () => {
  for (const [name, modify, expected] of [
    ['undotted-hs', (item) => (item.harmonized_code = '392690'), /harmonized_code/],
    ['missing-weight', (item) => delete item.weight, /\.weight/],
    ['missing-weight-unit', (item) => delete item.weightUnit, /weightUnit/],
    ['missing-origin', (item) => (item.origin_country_code = ''), /origin_country_code/],
    ['missing-value', (item) => (item.unit_price = 0), /unit_price/],
  ]) {
    const opts = internationalOptions({ request: () => assert.fail('Network must not run') }, name);
    modify(opts.ship.customs_invoice.items[0]);
    assert.throws(() => quoteRequest(opts.ship), expected);
    await assert.rejects(buyLabel(opts), expected);
    assert.equal(fs.existsSync(path.join(root, name, 'purchase-attempt.json')), false);
  }
});

test('valid dotted HS formats and shipper billing survive a cross-border purchase unchanged', async () => {
  for (const [index, code] of [
    '3926.90',
    '3926.90.99',
    '3926.90.9989',
    '3926.90.99.89',
  ].entries()) {
    let purchases = 0;
    const client = {
      request: async (payload) => {
        if (payload.rate) return { rates: [rate] };
        purchases++;
        assert.equal(payload.ship.customs_invoice.bill_to, 'Shipper');
        assert.equal(payload.ship.customs_invoice.items[0].harmonized_code, code);
        return { shipment };
      },
    };
    const opts = internationalOptions(client, `valid-customs-${index}`);
    opts.ship.customs_invoice.items[0].harmonized_code = code;
    await buyLabel(opts);
    assert.equal(purchases, 1);
  }
});

test('credential redaction preserves original Base64 document bytes', async () => {
  const bytes = Buffer.from('%PDF-1.4\noriginal document\n').toString('base64');
  const username = bytes.slice(0, 8);
  const client = createClient({
    username,
    password: 'dummy-password',
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          order: { documents: [{ base64_encoded_string: bytes }] },
          errors: [{ errorMessage: username }],
        }),
        { status: 200 },
      ),
  });
  const data = await client.request({ order: { order_id: 123 } });
  assert.equal(data.order.documents[0].base64_encoded_string, bytes);
  assert.equal(data.errors[0].errorMessage, '[redacted]');
});

test('price and currency mismatch prevent a purchase', async () => {
  for (const [key, quoted] of [
    ['price', { ...rate, total_price: '20.01' }],
    ['currency', { ...rate, currency: 'USD' }],
  ]) {
    let calls = 0;
    const client = {
      request: async (payload) => {
        calls++;
        assert.ok(payload.rate);
        return { rates: [quoted] };
      },
    };
    await assert.rejects(buyLabel(options(client, key)), /does not meet/);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(path.join(root, key, 'purchase-attempt.json')), false);
  }
});

test('successful purchase saves its order and PDF after selecting a fresh rate', async () => {
  const calls = [];
  const client = {
    request: async (payload) => {
      calls.push(payload);
      return payload.rate ? { rates: [rate] } : { shipment };
    },
  };
  const result = await buyLabel(options(client, 'success'));
  assert.equal(calls.length, 2);
  assert.equal(calls[1].ship.service.service_code, 204);
  assert.equal(calls[1].ship.destination.send_email_confirmation, false);
  assert.equal(calls[1].ship.references[0].reference_value, 'success');
  assert.equal(fs.readFileSync(result.documents[0], 'utf8'), '%PDF-1.4\nmock PDF bytes\n');
  const attempt = JSON.parse(fs.readFileSync(path.join(root, 'success', 'purchase-attempt.json')));
  assert.equal(attempt.state, 'shipment_confirmed');
  assert.equal(attempt.order_id, 123);
  assert.equal(result.actualPriceExceededQuoteLimit, false);
});

test('purchase timeout is not retried and its local key cannot submit again', async () => {
  let calls = 0;
  const client = {
    request: async (payload) => {
      calls++;
      if (payload.rate) return { rates: [rate] };
      throw new Error('Timeout');
    },
  };
  await assert.rejects(buyLabel(options(client, 'timeout')), /outcome is unknown/);
  assert.equal(calls, 2);
  await assert.rejects(buyLabel(options(client, 'timeout')), /already has a purchase attempt/);
  assert.equal(calls, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'timeout', 'purchase-attempt.json'))).state,
    'submission_started',
  );
});

test('concurrent purchase attempts with the same key submit at most once', async () => {
  let purchases = 0;
  const client = {
    request: async (payload) => {
      if (payload.rate) return { rates: [rate] };
      purchases++;
      return { shipment };
    },
  };
  const results = await Promise.allSettled([
    buyLabel(options(client, 'concurrent')),
    buyLabel(options(client, 'concurrent')),
  ]);
  assert.equal(purchases, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
});

test('HTTP 200 API errors do not count as a created shipment', async () => {
  const client = {
    request: async (payload) =>
      payload.rate ? { rates: [rate] } : { errors: [{ errorMessage: 'Invalid address' }] },
  };
  await assert.rejects(
    buyLabel(options(client, 'provider-error')),
    /No shipment confirmed: Invalid address/,
  );
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'provider-error', 'purchase-attempt.json'))).state,
    'api_error',
  );
});

test('a PDF error retains the purchased order and prevents another submission', async () => {
  const bad = {
    ...shipment,
    documents: [
      {
        document_name: 'labels',
        base64_encoded_string: Buffer.from('bad document').toString('base64'),
      },
    ],
  };
  const client = {
    request: async (payload) => (payload.rate ? { rates: [rate] } : { shipment: bad }),
  };
  await assert.rejects(buyLabel(options(client, 'bad-pdf')), /not a PDF/);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(root, 'bad-pdf', 'purchase-attempt.json'))).order_id,
    123,
  );
  await assert.rejects(buyLabel(options(client, 'bad-pdf')), /already has a purchase attempt/);
});

test('document filenames cannot escape their output directory and repeated downloads are harmless', () => {
  const directory = path.join(root, 'document-path');
  const record = { documents: [{ document_name: '../../escape', base64_encoded_string: pdf }] };
  const first = saveDocuments(record, directory);
  assert.equal(path.dirname(first[0]), directory);
  assert.deepEqual(saveDocuments(record, directory), first);
});

test('regenerated PDFs preserve the earlier file and reuse identical versions', () => {
  const directory = path.join(root, 'regenerated-document');
  const first = saveDocuments(shipment, directory);
  const newerBytes = Buffer.from('%PDF-1.4\nnew creation timestamp\n');
  const newer = {
    documents: [{ document_name: 'labels', base64_encoded_string: newerBytes.toString('base64') }],
  };
  const second = saveDocuments(newer, directory);
  assert.notEqual(first[0], second[0]);
  assert.equal(fs.readFileSync(first[0]).toString('base64'), pdf);
  assert.deepEqual(fs.readFileSync(second[0]), newerBytes);
  assert.deepEqual(saveDocuments(newer, directory), second);
});
