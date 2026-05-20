"""Genera docs/INFORME_ACCESIBILIDAD_USABILIDAD.pdf desde el Markdown fuente."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "docs" / "INFORME_ACCESIBILIDAD_USABILIDAD.md"
PDF_PATH = ROOT / "docs" / "INFORME_ACCESIBILIDAD_USABILIDAD.pdf"

FONT_REGULAR = Path(r"C:\Windows\Fonts\arial.ttf")
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")
FONT_ITALIC = Path(r"C:\Windows\Fonts\ariali.ttf")


def strip_md_inline(text: str) -> str:
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "[captura — ver carpeta a11y-screenshots]", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = text.replace("**", "")
    text = text.replace("`", "")
    text = text.replace("&lt;", "<").replace("&gt;", ">")
    return text.strip()


class InformePDF(FPDF):
    def __init__(self) -> None:
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_auto_page_break(auto=True, margin=18)
        if FONT_REGULAR.exists():
            self.add_font("Arial", "", str(FONT_REGULAR))
            self.add_font("Arial", "B", str(FONT_BOLD if FONT_BOLD.exists() else FONT_REGULAR))
            self.add_font("Arial", "I", str(FONT_ITALIC if FONT_ITALIC.exists() else FONT_REGULAR))
            self._family = "Arial"
        else:
            self._family = "Helvetica"

    def _set_style(self, size: int, bold: bool = False, italic: bool = False) -> None:
        style = ""
        if bold:
            style += "B"
        if italic:
            style += "I"
        self.set_font(self._family, style or "", size)

    def header(self) -> None:
        if self.page_no() > 1:
            self._set_style(8, italic=True)
            self.set_text_color(100, 100, 100)
            self.cell(0, 6, "CoreSpeak — Informe accesibilidad y usabilidad", align="R", new_x="LMARGIN", new_y="NEXT")
            self.set_text_color(0, 0, 0)
            self.ln(2)

    def footer(self) -> None:
        self.set_y(-12)
        self._set_style(8)
        self.set_text_color(120, 120, 120)
        self.cell(0, 8, f"Página {self.page_no()}", align="C")
        self.set_text_color(0, 0, 0)

    def write_title(self, text: str, level: int) -> None:
        sizes = {1: 18, 2: 14, 3: 12, 4: 11}
        self._set_style(sizes.get(level, 11), bold=level <= 2)
        self.ln(4 if level == 1 else 2)
        self.multi_cell(0, 7, strip_md_inline(text))
        self.ln(2)

    def write_paragraph(self, text: str) -> None:
        if not text:
            return
        self._set_style(10)
        self.multi_cell(0, 5.5, strip_md_inline(text))
        self.ln(2)

    def write_table_row(self, cells: list[str], header: bool = False) -> None:
        self._set_style(9, bold=header)
        col_w = (self.w - 2 * self.l_margin) / max(len(cells), 1)
        for cell in cells:
            self.cell(col_w, 6, strip_md_inline(cell)[:80], border=1)
        self.ln()

    def write_hr(self) -> None:
        self.ln(2)
        y = self.get_y()
        self.set_draw_color(200, 200, 200)
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(4)


def build_pdf(md_text: str) -> InformePDF:
    pdf = InformePDF()
    pdf.add_page()

    in_table = False
    table_header_done = False

    for raw_line in md_text.splitlines():
        line = raw_line.rstrip()

        if line.strip() == "---":
            in_table = False
            pdf.write_hr()
            continue

        if line.startswith("|") and "|" in line[1:]:
            if re.match(r"^\|[\s\-:|]+\|$", line):
                continue
            cells = [c.strip() for c in line.strip("|").split("|")]
            if not table_header_done:
                pdf.write_table_row(cells, header=True)
                table_header_done = True
            else:
                pdf.write_table_row(cells, header=False)
            in_table = True
            continue

        in_table = False
        table_header_done = False

        if line.startswith("# "):
            pdf.write_title(line[2:], 1)
        elif line.startswith("## "):
            pdf.write_title(line[3:], 2)
        elif line.startswith("### "):
            pdf.write_title(line[4:], 3)
        elif line.startswith("#### "):
            pdf.write_title(line[5:], 4)
        elif line.startswith("- [ ]"):
            pdf.write_paragraph("[ ] " + line[6:].strip())
        elif line.startswith("- "):
            pdf.write_paragraph("• " + line[2:].strip())
        elif line.strip():
            pdf.write_paragraph(line)

    return pdf


def main() -> int:
    if not MD_PATH.is_file():
        print(f"No se encuentra {MD_PATH}", file=sys.stderr)
        return 1

    md_text = MD_PATH.read_text(encoding="utf-8")
    pdf = build_pdf(md_text)
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(PDF_PATH))
    print(f"PDF generado: {PDF_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
