# Printing shipping labels

Keep the original PDFs downloaded by `buy` or `order`. The cropper creates a separate print copy locally and does not contact NetParcel or buy another label.

## Setup

Use Python 3.12 or newer. From a source checkout:

```sh
python -m pip install -r requirements-pdf.txt
```

For a global CLI installation, install the same dependencies with:

```sh
python -m pip install pdfplumber==0.11.9 pypdf==6.10.0
```

If Python is outside your PATH or installed in a virtual environment, set `NETPARCEL_PYTHON` to its executable path in your environment or private `.env`. Credentials are not needed for cropping.

## Supported layouts

```sh
netparcel crop labels/ORDER_ID/ORIGINAL.pdf --out labels/ORDER_ID/print-4x6.pdf
```

From a checkout, replace `netparcel` with `node scripts/netparcel.mjs`. Use `--page 2` to select the second page if the shipping label is there; the default is page 1.

Automatic detection supports the Canada Post Tracked Packet – USA landscape layout with a shipping label on the right and instructions on the left. It retains the shipping label's customs declaration and barcodes. An existing 4 × 6 page is also accepted. Unknown layouts, including a standalone customs invoice, are refused.

The output is one page measuring exactly 288 × 432 PDF points (4 × 6 inches). The cropper adds a small margin, expands the crop frame to a 2:3 ratio, and scales uniformly. It preserves vector text and barcodes instead of rasterizing the page. It never overwrites the original or a different existing print copy. Repeating the same conversion is safe.

Review the print copy, select 4 × 6 paper and actual-size/100% printing, and disable any additional printer scaling. Keep and follow any separate customs documents or carrier instructions that apply to the shipment.

## Other layouts

Inspect the original first. From a source checkout, the Python helper can take an explicit bounding box:

```sh
python scripts/crop-label.py ORIGINAL.pdf PRINT-4X6.pdf --page 1 --box X0 TOP X1 BOTTOM
```

Replace the four values with the full label's bounds in PDF points, measured from the page's top-left corner. Include every address, barcode, routing mark, and required customs section. The box must lie within the selected page; margins and uniform scaling are applied afterward. Do not reuse coordinates from another carrier or page layout.

Use a separate output filename for a revised crop. Source documents and print copies contain customer information and belong in a private, Git-ignored directory.
