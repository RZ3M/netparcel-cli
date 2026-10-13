# Contributing

Use Node.js 22 or newer and Git. API commands and Node.js tests have no package dependencies.

```sh
npm ci --ignore-scripts
npm run hooks
npm run check
npm test
npm run check:package
```

For the optional PDF cropper, use Python 3.12 or newer and run:

```sh
python -m pip install -r requirements-pdf-test.txt
python -m unittest discover -s tests -p "test_*.py" -v
```

PDF tests generate synthetic documents and verify exact page size, preservation of the source, safe output handling, and barcode decoding after rendering at 300 DPI.

The hooks audit staged files before commits and Git history before pushes. CI runs Node.js checks on Linux and Windows using versions 22 and 24, plus PDF checks on both platforms using Python 3.12. GitHub Actions versions are pinned to commit hashes and updated by Dependabot.

Use two-space indentation for JavaScript and four-space indentation for Python, LF endings, and the conventions in `.editorconfig`. Keep changes focused and include tests for changes that affect request submission, purchase recovery, output paths, or credential handling.

Tests must use injected mock API responses. Never add a test that purchases a live shipment, cancels an order, or requires production credentials. Keep fixtures synthetic. Do not commit real labels, account response captures, credentials, customer details, or order/tracking identifiers.

Open a pull request explaining the resulting behavior and relevant validation. Report security vulnerabilities privately using [the security policy](SECURITY.md).
