# Contributing

Use Node.js 22 or newer and Git. The project has no runtime or development package dependencies.

```sh
npm ci --ignore-scripts
npm run hooks
npm run check
npm test
npm run check:package
```

The hooks audit staged files before commits and Git history before pushes. CI also runs checks on Linux and Windows using Node.js 22 and 24. GitHub Actions versions are pinned to commit hashes and updated by Dependabot.

Use two-space indentation, LF endings, and the conventions in `.editorconfig`. Keep changes focused and include tests for changes that affect request submission, purchase recovery, output paths, or credential handling.

Tests must use injected mock API responses. Never add a test that purchases a live shipment, cancels an order, or requires production credentials. Keep fixtures synthetic. Do not commit real labels, account response captures, credentials, customer details, or order/tracking identifiers.

Open a pull request explaining the resulting behavior and relevant validation. Report security vulnerabilities privately using [the security policy](SECURITY.md).
