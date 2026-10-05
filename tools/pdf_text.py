"""Dependency-free PDF text extractor (works on simple FlateDecode PDFs).

Usage: python3 tools/pdf_text.py file.pdf
"""
import re
import sys
import zlib


def inflate_streams(data: bytes):
    out = []
    for m in re.finditer(rb"stream\r?\n", data):
        start = m.end()
        end = data.find(b"endstream", start)
        if end == -1:
            continue
        raw = data[start:end]
        for candidate in (raw, raw.rstrip(b"\r\n")):
            try:
                out.append(zlib.decompress(candidate))
                break
            except zlib.error:
                try:
                    d = zlib.decompressobj()
                    out.append(d.decompress(candidate))
                    break
                except zlib.error:
                    continue
    return out


def unescape(s: bytes) -> str:
    out = bytearray()
    i = 0
    while i < len(s):
        c = s[i]
        if c == 0x5C and i + 1 < len(s):
            i += 1
            n = s[i]
            simple = {0x6E: 10, 0x72: 13, 0x74: 9, 0x62: 8, 0x66: 12}
            if n in simple:
                out.append(simple[n])
            elif 0x30 <= n <= 0x37:
                digits = chr(n)
                i += 1
                while i < len(s) and 0x30 <= s[i] <= 0x37 and len(digits) < 3:
                    digits += chr(s[i])
                    i += 1
                i -= 1
                out.append(int(digits, 8) & 0xFF)
            elif n in (0x28, 0x29, 0x5C):
                out.append(n)
        else:
            out.append(c)
        i += 1
    return out.decode("latin-1")


STR = re.compile(rb"\((?:\\.|[^\\()])*\)")
HEX = re.compile(rb"<([0-9A-Fa-f\s]+)>")
POS = re.compile(rb"(Td|TD|T\*|ET|BT|Tm)")


def extract_text(content: bytes) -> str:
    parts = []
    i = 0
    for m in re.finditer(rb"\((?:\\.|[^\\()])*\)|<([0-9A-Fa-f\s]+)>|Td|TD|T\*|ET|BT", content):
        tok = m.group(0)
        if tok.startswith(b"("):
            parts.append(unescape(tok[1:-1]))
        elif tok.startswith(b"<"):
            hx = re.sub(rb"\s", b"", tok[1:-1])
            if len(hx) % 2:
                hx += b"0"
            try:
                raw = bytes.fromhex(hx.decode("ascii"))
            except ValueError:
                continue
            # CID-encoded text: 2 bytes per glyph -> keep low byte if printable
            if len(raw) > 2 and all(raw[j + 1] == 0 for j in range(0, min(len(raw), 8) - 1, 2)):
                raw = raw[0::2]
            parts.append(raw.decode("latin-1"))
        else:
            parts.append("\n")
    return "".join(parts)


def main():
    path = sys.argv[1]
    data = open(path, "rb").read()
    streams = inflate_streams(data)
    chunks = []
    for s in streams:
        if b"Tj" in s or b"TJ" in s or b"BT" in s:
            chunks.append(extract_text(s))
    text = "\n".join(chunks)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    print(text)


if __name__ == "__main__":
    main()
