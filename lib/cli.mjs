import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { createClient, buyLabel, quoteRequest, saveDocuments, errors } from './netparcel.mjs';

const version = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
const help = `Usage: netparcel <command>

  quote <shipment.json>
  order <order-id>
  buy <shipment.json> --service <code> --max-price <amount> --currency CAD --key <unique-reference>
  --help
  --version

quote and order are read-only. buy submits a paid shipment and downloads PDFs.
Credentials: API_USERNAME and API_PASSWORD from the environment or .env in the
current working directory. Environment variables take precedence.
Data directory: NETPARCEL_DATA_DIR, default ./labels. Keep purchase records private
and use the same data directory to preserve local duplicate-submission protection.`;

function summary(record) {
  return {
    order_id: record.order_id,
    service: record.service_name,
    price: record.total_price,
    currency: record.currency,
    status: record.status?.status_name,
    tracking_number: record.master_tracking_num,
  };
}

export async function runCli(
  argv,
  {
    cwd = process.cwd(),
    env = process.env,
    fetchImpl = fetch,
    stdout = (text) => console.log(text),
    stderr = (text) => console.error(text),
  } = {},
) {
  let username;
  let password;
  const redact = (text) => {
    for (const secret of [username, password]) {
      if (secret) text = text.split(secret).join('[redacted]');
    }
    return text;
  };
  try {
    const [command, input, ...options] = argv;
    if (!command || ['help', '--help', '-h'].includes(command)) {
      stdout(help);
      return 0;
    }
    if (command === '--version') {
      stdout(version);
      return 0;
    }
    if (!['quote', 'order', 'buy'].includes(command) || !input) throw new Error(help);
    if (command !== 'buy' && options.length)
      throw new Error('Unexpected arguments. Run with --help.');
    const flags = {};
    for (let index = 0; index < options.length; index += 2) {
      if (
        !['--service', '--max-price', '--currency', '--key'].includes(options[index]) ||
        !options[index + 1] ||
        flags[options[index]]
      ) {
        throw new Error('Invalid or duplicate buy options. Run with --help.');
      }
      flags[options[index]] = options[index + 1];
    }
    const envPath = path.resolve(cwd, '.env');
    const fileEnv = fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};
    username = env.API_USERNAME || fileEnv.API_USERNAME;
    password = env.API_PASSWORD || fileEnv.API_PASSWORD;
    const outputRoot = path.resolve(
      cwd,
      env.NETPARCEL_DATA_DIR || fileEnv.NETPARCEL_DATA_DIR || 'labels',
    );
    const client = createClient({ username, password, fetchImpl });
    if (command === 'order') {
      if (!/^\d+$/.test(input) || !Number.isSafeInteger(Number(input)) || Number(input) <= 0) {
        throw new Error('Order ID must be a positive integer belonging to your account.');
      }
      const data = await client.request({ order: { order_id: Number(input) } });
      if (!data.order) throw new Error(errors(data).join('; ') || 'No order returned.');
      const directory = path.join(outputRoot, input);
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
      fs.writeFileSync(
        path.join(directory, 'order-response.json'),
        redact(JSON.stringify(data, null, 2)) + '\n',
        { mode: 0o600 },
      );
      const documents = saveDocuments(data.order, directory);
      stdout(redact(JSON.stringify({ ...summary(data.order), documents }, null, 2)));
    } else {
      const payload = JSON.parse(fs.readFileSync(path.resolve(cwd, input), 'utf8'));
      if (!payload?.ship || Object.keys(payload).some((key) => key !== 'ship')) {
        throw new Error('Input must contain a single ship object.');
      }
      const ship = payload.ship;
      if (command === 'quote') {
        const data = await client.request(quoteRequest(ship));
        for (const warning of errors(data)) stderr(redact(`Carrier warning: ${warning}`));
        if (!Array.isArray(data.rates) || !data.rates.length) throw new Error('No rates returned.');
        const rates = data.rates.toSorted((a, b) => Number(a.total_price) - Number(b.total_price));
        stdout(
          redact(
            JSON.stringify(
              rates.map((rate) => ({
                service: rate.service_name,
                code: rate.service_code,
                price: rate.total_price,
                currency: rate.currency,
                days: rate.transit_days,
              })),
              null,
              2,
            ),
          ),
        );
      } else {
        const result = await buyLabel({
          client,
          ship,
          serviceCode: flags['--service'],
          maxPrice: Number(flags['--max-price']),
          currency: flags['--currency'],
          key: flags['--key'],
          outputRoot,
        });
        stdout(
          redact(
            JSON.stringify({ ...summary(result.record), documents: result.documents }, null, 2),
          ),
        );
        if (result.actualPriceExceededQuoteLimit) {
          stderr(
            'The purchased total differs from the quote limit. The limit checks quotes locally; NetParcel does not document a server-side price ceiling. Review the saved charges.',
          );
        }
      }
    }
    return 0;
  } catch (error) {
    stderr(redact(error.message));
    return 1;
  }
}
