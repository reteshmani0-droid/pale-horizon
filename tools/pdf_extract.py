"""PDF text extractor: object parser + ObjStm + ToUnicode CMaps + line reflow.

Usage: python3 tools/pdf_extract.py file.pdf
"""
import re
import sys
import zlib

# ---------------------------------------------------------------- tokenizer ---

TOK = re.compile(
    rb"""
      (?P<ws>\s+)
    | (?P<comment>%[^\r\n]*)
    | (?P<dictopen><<)
    | (?P<dictclose>>>)
    | (?P<arropen>\[)
    | (?P<arrclose>\])
    | (?P<hexstr><[0-9A-Fa-f\s]*>)
    | (?P<litstr>\((?:[^\\()]|\\.)*\))
    | (?P<name>/[^\s()<>\[\]{}/%]*)
    | (?P<num>[-+]?(?:\d+\.\d*|\.\d+|\d+))
    | (?P<word>[A-Za-z*'"][A-Za-z0-9*'"]*)
    """,
    re.X,
)

KNOWN_OPS = {b"Tf", b"Tm", b"Td", b"TD", b"T*", b"Tj", b"'", b'"', b"TJ", b"BT", b"ET"}


class Ref:
    __slots__ = ("num",)

    def __init__(self, num):
        self.num = num

    def __repr__(self):
        return f"Ref({self.num})"


def tokenize(data: bytes):
    pos = 0
    n = len(data)
    while pos < n:
        m = TOK.match(data, pos)
        if not m:
            pos += 1
            continue
        pos = m.end()
        kind = m.lastgroup
        if kind in ("ws", "comment"):
            continue
        yield kind, m.group(0)


class PDF:
    def __init__(self, data: bytes):
        self.data = data
        self.objs = {}
        self.cache = {}
        self._scan()

    # ------------------------------------------------------------- scanning --
    def _scan(self):
        for m in re.finditer(rb"(\d+)\s+\d+\s+obj\b(.*?)endobj", self.data, re.S):
            self.objs[int(m.group(1))] = m.group(2)
        # object streams
        for num, body in list(self.objs.items()):
            sm = re.search(rb"stream\r?\n", body)
            if not sm or b"/ObjStm" not in body:
                continue
            head = body[: sm.start()]
            m = re.search(rb"/N\s+(\d+)", head)
            mf = re.search(rb"/First\s+(\d+)", head)
            if not (m and mf):
                continue
            stream = inflate(body[sm.end():])
            if not stream:
                continue
            count, first = int(m.group(1)), int(mf.group(1))
            header = stream[:first]
            nums = [int(x) for x in re.findall(rb"\d+", header)]
            for i in range(count):
                try:
                    onum, off = nums[2 * i], nums[2 * i + 1]
                except IndexError:
                    break
                end = nums[2 * i + 3] + first if 2 * i + 3 < len(nums) else len(stream)
                self.objs.setdefault(onum, stream[first + off:end])

    # ------------------------------------------------------------- resolving --
    def get(self, num):
        if num in self.cache:
            return self.cache[num]
        body = self.objs.get(num)
        if body is None:
            return None
        val = self._parse_obj(body)
        self.cache[num] = val
        return val

    def resolve(self, obj, depth=0):
        while depth < 32:
            if isinstance(obj, Ref):
                obj = self.get(obj.num)
            elif isinstance(obj, int) and not isinstance(obj, bool):
                obj = self.get(obj)
            else:
                break
            depth += 1
        return obj

    def stream_of(self, obj):
        obj = self.resolve(obj)
        if obj is None:
            return None
        if isinstance(obj, tuple):  # (dict, stream)
            return obj[1]
        return None

    def dict_of(self, obj):
        obj = self.resolve(obj)
        if isinstance(obj, tuple):
            return obj[0]
        if isinstance(obj, dict):
            return obj
        return {}

    def _parse_obj(self, body: bytes):
        toks = list(tokenize(body))
        i, val = parse_value(toks, 0)
        # stream?
        sm = re.search(rb"stream\r?\n", body)
        if sm:
            stream = stream_bytes(body[sm.end():])
            return (val if isinstance(val, dict) else {}, stream)
        return val


# ------------------------------------------------------------ value parsing ---

def parse_value(toks, i):
    kind, raw = toks[i]
    if kind == "dictopen":
        d = {}
        i += 1
        while i < len(toks) and toks[i][0] != "dictclose":
            kk, kraw = toks[i]
            if kk != "name":
                i += 1
                continue
            i += 1
            i, v = parse_value_after_key(toks, i)
            d[kraw[1:].decode("latin-1")] = v
        return i + 1, d
    if kind == "arropen":
        arr = []
        i += 1
        while i < len(toks) and toks[i][0] != "arrclose":
            i, v = parse_value_after_key(toks, i)
            arr.append(v)
        return i + 1, arr
    return parse_value_after_key(toks, i)


def parse_value_after_key(toks, i):
    if i >= len(toks):
        return i, None
    kind, raw = toks[i]
    if kind == "num":
        # possible reference: num num R
        if i + 2 < len(toks) and toks[i + 1][0] == "num" and toks[i + 2][0] == "word" and toks[i + 2][1] == b"R":
            return i + 3, Ref(int(raw))
        return i + 1, num_of(raw)
    if kind == "name":
        return i + 1, raw[1:].decode("latin-1")
    if kind == "hexstr":
        hx = re.sub(rb"\s", b"", raw[1:-1])
        return i + 1, hx
    if kind == "litstr":
        return i + 1, unescape_literal(raw[1:-1])
    if kind == "word":
        return i + 1, {"true": True, "false": False, "null": None}.get(raw.decode(), raw)
    if kind in ("dictopen", "arropen"):
        return parse_value(toks, i)
    return i + 1, None


def num_of(raw: bytes):
    try:
        return int(raw)
    except ValueError:
        return float(raw)


def inflate(data: bytes):
    for candidate in (data.strip(b"\r\n"), data.lstrip(b"\r\n")):
        try:
            return zlib.decompress(candidate)
        except zlib.error:
            pass
    try:
        return zlib.decompressobj().decompress(data)
    except zlib.error:
        return None


def stream_bytes(data: bytes):
    """Inflate if possible, else return the raw (uncompressed) stream."""
    got = inflate(data)
    if got is not None:
        return got
    end = data.rfind(b"endstream")
    if end != -1:
        data = data[:end]
    return data.strip(b"\r\n")


def unescape_literal(s: bytes) -> bytes:
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
    return bytes(out)


# ------------------------------------------------------------------- cmaps ---

HEX_PAIR = re.compile(rb"<([0-9A-Fa-f]+)>")


def decode_utf16(hexstr: bytes) -> str:
    raw = bytes.fromhex(hexstr.decode("ascii"))
    if len(raw) % 2 == 0 and (len(raw) > 2 or raw[:1] == b"\x00"):
        try:
            return raw.decode("utf-16-be")
        except UnicodeDecodeError:
            pass
    return raw.decode("latin-1")


def parse_cmap(content: bytes):
    mapping = {}
    for block in re.findall(rb"beginbfchar(.*?)endbfchar", content, re.S):
        toks = HEX_PAIR.findall(block)
        for i in range(0, len(toks) - 1, 2):
            mapping[int(toks[i], 16)] = decode_utf16(toks[i + 1])
    for block in re.findall(rb"beginbfrange(.*?)endbfrange", content, re.S):
        for m in re.finditer(
            rb"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[(.*?)\])", block, re.S
        ):
            lo, hi = int(m.group(1), 16), int(m.group(2), 16)
            if m.group(4):
                start = int(m.group(4), 16)
                for i in range(min(hi - lo, 0x2000) + 1):
                    mapping[lo + i] = chr(start + i)
            else:
                items = HEX_PAIR.findall(m.group(5) or b"")
                for i, it in enumerate(items):
                    if lo + i <= hi:
                        mapping[lo + i] = decode_utf16(it)
    return mapping


# ---------------------------------------------------------------- extraction --

def page_fonts(pdf: PDF, page: dict):
    """name -> (cmap or None, wide: bool)"""
    res = pdf.dict_of(page.get("Resources"))
    if not res:
        parent = pdf.dict_of(page.get("Parent"))
        res = pdf.dict_of(parent.get("Resources")) if parent else {}
    fonts = pdf.dict_of(res.get("Font")) if res else {}
    out = {}
    for name, fref in (fonts or {}).items():
        fdict = pdf.dict_of(fref)
        cmap = None
        tu = fdict.get("ToUnicode")
        if tu is not None:
            st = pdf.stream_of(tu)
            if st:
                cmap = parse_cmap(st)
        enc = fdict.get("Encoding")
        wide = fdict.get("Subtype") == "Type0" or enc == "Identity-H" or isinstance(enc, list)
        out[name] = (cmap, wide)
    return out


def show_bytes(raw: bytes, cmap, wide: bool) -> str:
    if wide and len(raw) % 2 == 0:
        codes = [int.from_bytes(raw[i:i + 2], "big") for i in range(0, len(raw), 2)]
    else:
        codes = list(raw)
    if not cmap:
        if wide:
            return "".join(chr(c) if 32 <= c < 0x3000 else "" for c in codes)
        try:
            return raw.decode("latin-1")
        except Exception:
            return ""
    return "".join(cmap.get(c, "") for c in codes)


def runs_from_content(content: bytes, fonts):
    runs = []
    toks = list(tokenize(content))
    stack = []
    cur = (None, False)
    size = 12.0
    x = y = 0.0
    leading = 12.0
    for kind, raw in toks:
        if kind in ("num", "name", "hexstr", "litstr"):
            stack.append((kind, raw))
            continue
        if kind in ("dictopen", "arropen", "dictclose", "arrclose"):
            if kind in ("dictopen", "arropen"):
                stack.append((kind, raw))
            continue
        if kind != "word":
            continue
        op = raw
        if op == b"Tf":
            name = next((v for k, v in reversed(stack) if k == "name"), None)
            sz = next((v for k, v in reversed(stack) if k == "num"), None)
            fname = name[1:].decode("latin-1") if isinstance(name, bytes) else ""
            if fname not in fonts and (name is not None):
                fname = name.decode("latin-1")
            cur = fonts.get(fname, (None, False))
            if sz:
                try:
                    size = float(sz)
                    leading = size * 1.2
                except ValueError:
                    pass
        elif op == b"Tm":
            nums = [float(v) for k, v in stack if k == "num"]
            if len(nums) >= 6:
                x, y = nums[-2], nums[-1]
        elif op in (b"Td", b"TD"):
            nums = [float(v) for k, v in stack if k == "num"]
            if len(nums) >= 2:
                x += nums[-2]
                y += nums[-1]
                if op == b"TD":
                    leading = max(1.0, -nums[-1])
        elif op == b"T*":
            y -= leading
        elif op in (b"Tj", b"'", b'"'):
            for k, v in reversed(stack):
                if k == "hexstr":
                    runs.append((y, x, show_bytes(bytes.fromhex(re.sub(rb"\s", b"", v[1:-1]).decode()), *cur), size))
                    break
                if k == "litstr":
                    runs.append((y, x, show_bytes(unescape_literal(v[1:-1]), *cur), size))
                    break
            if op in (b"'", b'"'):
                y -= leading
        elif op == b"TJ":
            dx = 0.0
            for k, v in stack:
                if k == "hexstr":
                    txt = show_bytes(bytes.fromhex(re.sub(rb"\s", b"", v[1:-1]).decode()), *cur)
                    if dx <= -120 and runs:
                        runs.append((y, x + 0.01, " ", size))
                    runs.append((y, x, txt, size))
                    x += len(txt) * size * 0.5
                    dx = 0.0
                elif k == "num":
                    dx += float(v)
            runs = [(ry, rx, rt, rs) for ry, rx, rt, rs in runs]
        stack.clear()
    return runs


def reflow(runs):
    runs = [r for r in runs if r[2].strip()]
    if not runs:
        return []
    runs.sort(key=lambda r: (-r[0], r[1]))
    lines = []
    cur = []
    cy = None
    for y, x, t, size in runs:
        tol = max(2.5, size * 0.4)
        if cy is None or abs(y - cy) <= tol:
            cur.append((x, t))
            cy = y if cy is None else cy
        else:
            lines.append("".join(t for _, t in sorted(cur)))
            cur = [(x, t)]
            cy = y
    lines.append("".join(t for _, t in sorted(cur)))
    return lines


def all_pages(pdf: PDF):
    """Ordered page dicts via catalog, fallback: /Type /Page objects."""
    catalog = None
    for num in pdf.objs:
        d = pdf.dict_of(num)
        if d.get("Type") == "Catalog":
            catalog = d
            break
    pages = []
    if catalog:
        root = pdf.get(catalog["Pages"].num) if isinstance(catalog.get("Pages"), Ref) else None
        stack = [catalog.get("Pages")]
        seen = set()
        while stack:
            obj = stack.pop(0)
            d = pdf.dict_of(obj)
            kids = d.get("Kids")
            if d.get("Type") == "Pages" and kids:
                for k in pdf.resolve(kids) or []:
                    if isinstance(k, Ref) and k.num not in seen:
                        seen.add(k.num)
                        stack.append(k)
            elif d.get("Type") == "Page":
                pages.append(d)
    if not pages:
        for num in sorted(pdf.objs):
            d = pdf.dict_of(num)
            if d.get("Type") == "Page":
                pages.append(d)
    return pages


def extract(path: str) -> str:
    pdf = PDF(open(path, "rb").read())
    out = []
    for idx, page in enumerate(all_pages(pdf)):
        fonts = page_fonts(pdf, page)
        contents = page.get("Contents")
        refs = pdf.resolve(contents)
        if refs is None:
            refs = [contents]
        if not isinstance(refs, list):
            refs = [refs]
        runs = []
        for r in refs:
            st = pdf.stream_of(r)
            if st:
                runs.extend(runs_from_content(st, fonts))
        lines = reflow(runs)
        out.append(f"----- page {idx + 1} -----\n" + "\n".join(lines))
    return "\n\n".join(out)


if __name__ == "__main__":
    text = extract(sys.argv[1])
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(text)
