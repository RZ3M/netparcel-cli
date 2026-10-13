#!/usr/bin/env python3
"""Create a vector 4x6 print copy without altering a purchased source label."""

import argparse
import hashlib
import io
import json
import os
import re
from pathlib import Path

import pdfplumber
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import RectangleObject

WIDTH, HEIGHT = 288.0, 432.0  # PDF points: exactly 4 x 6 inches.


def label_region(source, page_index=0, explicit_box=None, padding=4.0):
    with pdfplumber.open(source) as document:
        page = document.pages[page_index]
        width, height = float(page.width), float(page.height)
        if explicit_box:
            x0, top, x1, bottom = map(float, explicit_box)
            if not (0 <= x0 < x1 <= width and 0 <= top < bottom <= height):
                raise ValueError("The explicit box must lie inside the selected PDF page.")
            region = [x0, top, x1, bottom]
            layout = "explicit"
        elif abs(width - WIDTH) <= 1 and abs(height - HEIGHT) <= 1:
            return [0, 0, width, height], "already-4x6", (width, height)
        else:
            normalized = re.sub(r"\s+", "", (page.extract_text() or "").upper())
            if not (width > height and "TRACKEDPACKET" in normalized and
                    "USPSTRACKING" in normalized and "INSTRUCTIONS" in normalized and
                    "MANIFESTNOTREQ" in normalized):
                raise ValueError("Unrecognized label layout. Inspect the original and provide --box; do not blindly crop another carrier's document.")
            # The middle perforation and sender instructions are outside this panel.
            right = page.crop((width / 2 + 12, 0, width, height))
            objects = right.chars + right.rects + right.lines + right.curves + right.images
            objects = [obj for obj in objects if obj.get("x1", 0) > obj.get("x0", 0)
                       or obj.get("bottom", 0) > obj.get("top", 0)]
            if not objects:
                raise ValueError("No printable objects found on the right-hand label panel.")
            region = [min(obj["x0"] for obj in objects), min(obj["top"] for obj in objects),
                      max(obj["x1"] for obj in objects), max(obj["bottom"] for obj in objects)]
            layout = "canada-post-tracked-packet-right"
        return [region[0] - padding, region[1] - padding,
                region[2] + padding, region[3] + padding], layout, (width, height)


def crop_label(source, output, page_index=0, explicit_box=None, padding=4.0):
    source, output = Path(source).resolve(), Path(output).resolve()
    if source == output:
        raise ValueError("The print copy must be a different file from the original.")
    if not 0 <= padding <= 36:
        raise ValueError("Padding must be between 0 and 36 PDF points.")
    reader = PdfReader(source)
    if not 0 <= page_index < len(reader.pages):
        raise ValueError("Page number is outside the source document.")
    region, layout, size = label_region(source, page_index, explicit_box, padding)
    page = reader.pages[page_index]
    if page.rotation:
        page.transfer_rotation_to_content()
    x0, top, x1, bottom = region
    # Expand the frame to 2:3, rather than stretching or cutting off any content.
    frame_width, frame_height = x1 - x0, bottom - top
    if frame_width / frame_height > WIDTH / HEIGHT:
        extra = (frame_width * HEIGHT / WIDTH - frame_height) / 2
        top, bottom = top - extra, bottom + extra
    else:
        extra = (frame_height * WIDTH / HEIGHT - frame_width) / 2
        x0, x1 = x0 - extra, x1 + extra
    y0, y1 = size[1] - bottom, size[1] - top
    page.cropbox = RectangleObject([x0, y0, x1, y1])
    page.pop("/Annots", None)  # A print copy has no interactive page annotations.
    scale = WIDTH / (x1 - x0)
    transform = Transformation().translate(-x0, -y0).scale(scale)
    writer = PdfWriter()
    destination = writer.add_blank_page(width=WIDTH, height=HEIGHT)
    destination.merge_transformed_page(page, transform, expand=False)
    writer.add_metadata({"/Title": "Shipping label - 4x6 print copy",
                         "/Creator": "netparcel-cli / pypdf",
                         "/SourceSHA256": hashlib.sha256(source.read_bytes()).hexdigest()})
    buffer = io.BytesIO()
    writer.write(buffer)
    result = buffer.getvalue()
    output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if output.exists():
        if output.read_bytes() != result:
            raise FileExistsError("Refusing to overwrite a different print copy; choose a new filename.")
    else:
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(result)
    written = PdfReader(output)
    if len(written.pages) != 1 or list(map(float, written.pages[0].mediabox)) != [0, 0, WIDTH, HEIGHT]:
        raise ValueError("The saved print copy failed the 4x6 page-size check.")
    return {"output": str(output), "layout": layout, "page_inches": [4, 6],
            "source_page": page_index + 1, "uniform_scale": scale,
            "crop_box_top_left_points": [x0, top, x1, bottom]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--box", type=float, nargs=4, metavar=("X0", "TOP", "X1", "BOTTOM"))
    parser.add_argument("--padding", type=float, default=4.0)
    args = parser.parse_args()
    print(json.dumps(crop_label(args.source, args.output, args.page - 1, args.box, args.padding), indent=2))


if __name__ == "__main__":
    main()
