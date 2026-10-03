const privatePath =
  /(^|\/)(?:\.env(?:\..*)?|research|labels|shipments|\.netparcel|local|tmp|node_modules|coverage)(?:\/|$)/i;
const privateExtension = /\.(?:pdf|pem|key|tgz|sqlite|db)$/i;

// Only paths and finding categories are reported; contents are never echoed.
export function auditPublicFile(filename, contents, knownSecrets = []) {
  const name = filename.replaceAll('\\', '/');
  const findings = [];
  if ((privatePath.test(name) && name !== '.env.example') || privateExtension.test(name)) {
    findings.push('private or generated file');
  }
  const text = contents.toString('utf8');
  if (knownSecrets.some((secret) => secret && contents.includes(Buffer.from(secret)))) {
    findings.push('local API credential');
  }
  if (/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(text)) {
    findings.push('GitHub token');
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    findings.push('private key');
  }
  if (/"base64_encoded_string"\s*:\s*"[A-Za-z0-9+/=]{80,}"/.test(text)) {
    findings.push('embedded shipment document');
  }
  return findings;
}
