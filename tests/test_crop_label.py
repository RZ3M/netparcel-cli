"""Offline PDF checks using synthetic documents, never real shipping labels."""

import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pypdfium2
import zxingcpp
from pypdf import PdfReader
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode.code128 import Code128

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("crop_label", ROOT / "scripts/crop-label.py")
cropper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cropper)


def synthetic_document(path, landscape=True):
    document = canvas.Canvas(str(path), pagesize=(792, 612) if landscape else (288, 432))
    if landscape:
        document.drawString(36, 550, "Tracked Packet - USA")
        document.drawString(36, 500, "Instructions")
        document.rect(470, 96, 278, 444)
        document.drawString(480, 520, "Tracked Packet - USA")
        document.drawString(480, 495, "MANIFEST NOT REQ")
        document.drawString(480, 400, "SYNTHETIC RECIPIENT")
        document.drawString(480, 365, "USPS TRACKING")
        Code128("TEST123456789", barWidth=1, barHeight=52).drawOn(document, 480, 295)
        document.drawString(480, 110, "SYNTHETIC CUSTOMS DATA")
    else:
        document.drawString(20, 390, "SYNTHETIC 4x6 LABEL")
        Code128("TEST123456789", barWidth=1, barHeight=52).drawOn(document, 20, 150)
    document.showPage()
    document.setPageSize((595, 842))
    document.drawString(36, 800, "SYNTHETIC CUSTOMS INVOICE")
    document.save()


def barcode_payloads(path):
    document = pypdfium2.PdfDocument(str(path))
    page = document[0]
    bitmap = page.render(scale=300 / 72)
    image = bitmap.to_pil()
    try:
        return {barcode.bytes for barcode in zxingcpp.read_barcodes(image)}
    finally:
        image.close()
        bitmap.close()
        page.close()
        document.close()


class CropTests(unittest.TestCase):
    def setUp(self):
        parent = ROOT / "tmp/pdf-tests"
        parent.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="synthetic-", dir=parent)
        self.directory = Path(self.temporary.name).resolve()
        if self.directory.parent != parent.resolve():
            raise RuntimeError("Unexpected temporary test directory")
        self.source = self.directory / "source.pdf"
        self.output = self.directory / "print.pdf"
        synthetic_document(self.source)

    def tearDown(self):
        self.temporary.cleanup()

    def test_vector_crop_preserves_source_barcode_and_exact_size(self):
        digest = hashlib.sha256(self.source.read_bytes()).hexdigest()
        result = cropper.crop_label(self.source, self.output)
        reader = PdfReader(self.output)
        self.assertEqual(len(reader.pages), 1)
        self.assertEqual(list(map(float, reader.pages[0].mediabox)), [0, 0, 288, 432])
        self.assertEqual(result["layout"], "canada-post-tracked-packet-right")
        self.assertTrue(reader.pages[0]["/Resources"]["/Font"])
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), digest)
        self.assertEqual(barcode_payloads(self.source), {b"TEST123456789"})
        self.assertEqual(barcode_payloads(self.output), barcode_payloads(self.source))

    def test_original_and_invoice_cannot_be_automatically_overwritten_or_cropped(self):
        with self.assertRaises(ValueError):
            cropper.crop_label(self.source, self.source)
        with self.assertRaises(ValueError):
            cropper.crop_label(self.source, self.output, page_index=1)
        self.assertFalse(self.output.exists())

    def test_existing_4x6_and_repeat_output_are_safe(self):
        source = self.directory / "already.pdf"
        synthetic_document(source, landscape=False)
        result = cropper.crop_label(source, self.output)
        self.assertEqual(result["layout"], "already-4x6")
        first = self.output.read_bytes()
        cropper.crop_label(source, self.output)
        self.assertEqual(self.output.read_bytes(), first)
        self.assertEqual(barcode_payloads(self.output), {b"TEST123456789"})

    def test_conflicting_print_copy_is_preserved(self):
        self.output.write_bytes(b"existing content")
        with self.assertRaises(FileExistsError):
            cropper.crop_label(self.source, self.output)
        self.assertEqual(self.output.read_bytes(), b"existing content")

    def test_explicit_region_is_checked_before_any_output(self):
        with self.assertRaises(ValueError):
            cropper.crop_label(self.source, self.output, explicit_box=(-1, 0, 10, 10))
        self.assertFalse(self.output.exists())

    def test_cli_crop_does_not_need_an_api_account(self):
        environment = {**os.environ, "NETPARCEL_PYTHON": sys.executable}
        environment.pop("API_USERNAME", None)
        environment.pop("API_PASSWORD", None)
        result = subprocess.run(["node", str(ROOT / "scripts/netparcel.mjs"), "crop", str(self.source), "--out", str(self.output)], cwd=self.directory, env=environment, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["page_inches"], [4, 6])
        self.assertEqual(barcode_payloads(self.output), {b"TEST123456789"})


if __name__ == "__main__":
    unittest.main()
