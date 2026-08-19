#!/usr/bin/env python3
"""Render deterministic 390/768 visual fixtures for the isolated end card.

This is evidence generation, not production UI code. Pass a CJK-capable TTF so
the fixture can be reproduced on any workstation with Pillow installed.
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


FIXTURE = {
    "title": "打怪",
    "position": "第 19 页",
    "progress": "读完“崇高的怪物性”，进入“受遏制的怪物性”",
    "summary": "这一段把怪物从令人敬畏的边界经验，推进为会被制度命名、约束与利用的对象；怪物性没有消失，只是换了一种被允许出现的方式。",
    "tav": "所谓受遏制，也许不是怪物变弱，而是观看它的人终于找到一套能安心分类的语言。",
    "gale": "分类在这里不是中性的知识动作；它同时建立秩序，也悄悄规定了什么可以被驱逐。",
    "question": "下一节会把“遏制”写成真正有效的控制，还是另一种更隐蔽的怪物生产？",
}

INK = "#24231f"
MUTED = "#6f675c"
PAPER = "#f5ecd6"
WINE = "#794438"
GREEN = "#254536"
GOLD = "#a87a31"
LINE = "#d9c9aa"


def font(path: Path, size: int):
    return ImageFont.truetype(str(path), size=size)


def wrap(draw: ImageDraw.ImageDraw, text: str, face, max_width: int):
    lines: list[str] = []
    current = ""
    for char in text:
        candidate = current + char
        if current and draw.textlength(candidate, font=face) > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_lines(draw, xy, text, face, fill, max_width, line_gap=6):
    x, y = xy
    lines = wrap(draw, text, face, max_width)
    ascent, descent = face.getmetrics()
    line_height = ascent + descent + line_gap
    for line in lines:
        draw.text((x, y), line, font=face, fill=fill)
        y += line_height
    return y


def crop_cover(image: Image.Image, width: int, height: int):
    ratio = max(width / image.width, height / image.height)
    resized = image.resize((round(image.width * ratio), round(image.height * ratio)))
    left = max(0, (resized.width - width) // 2)
    top = max(0, (resized.height - height) // 2)
    return resized.crop((left, top, left + width, top + height))


def section(draw, x, y, width, label, value, fonts, label_color=WINE, emphasis=False):
    if emphasis:
        summary_face = fonts["body"]
        lines = wrap(draw, value, summary_face, width - 28)
        line_height = sum(summary_face.getmetrics()) + 6
        height = 35 + len(lines) * line_height + 10
        draw.rounded_rectangle((x, y, x + width, y + height), radius=12, fill="#fffaf0")
        draw.rectangle((x, y, x + 3, y + height), fill=GOLD)
        inner_x = x + 14
        inner_y = y + 10
    else:
        draw.line((x, y, x + width, y), fill=LINE, width=1)
        inner_x = x
        inner_y = y + 11
    draw.text((inner_x, inner_y), label, font=fonts["label"], fill=label_color)
    text_y = inner_y + 22
    end_y = draw_lines(draw, (inner_x, text_y), value, fonts["body"], INK, width - (inner_x - x) - 2)
    return max(end_y + 8, y + (height if emphasis else 0))


def render_mobile(background: Image.Image, font_path: Path, output: Path):
    width = 390
    fonts = {
        "date": font(font_path, 13),
        "hero": font(font_path, 30),
        "title": font(font_path, 18),
        "label": font(font_path, 12),
        "body": font(font_path, 14),
        "footer": font(font_path, 11),
    }
    probe = Image.new("RGB", (width, 1600), PAPER)
    draw = ImageDraw.Draw(probe)
    y = 116 + 18
    draw.text((17, y), "2026年8月19日", font=fonts["date"], fill=GOLD)
    y += 26
    draw.text((17, y), "今天读到这里", font=fonts["hero"], fill=WINE)
    y += 43
    draw.text((17, y), f"《{FIXTURE['title']}》", font=fonts["title"], fill=INK)
    y += 33
    draw.rounded_rectangle((17, y, 90, y + 25), radius=13, fill="#ead9d0")
    draw.text((26, y + 3), FIXTURE["position"], font=fonts["footer"], fill=WINE)
    y += 40
    content_width = width - 34
    y = section(draw, 17, y, content_width, "读到哪里", FIXTURE["progress"], fonts)
    y = section(draw, 17, y + 5, content_width, "今天读了什么", FIXTURE["summary"], fonts, emphasis=True)
    y = section(draw, 17, y + 5, content_width, "塔芙留下", FIXTURE["tav"], fonts)
    y = section(draw, 17, y + 5, content_width, "盖尔留下", FIXTURE["gale"], fonts, label_color=GREEN)
    y = section(draw, 17, y + 5, content_width, "留到下次", FIXTURE["question"], fonts, label_color=GOLD)
    draw.line((17, y + 3, width - 17, y + 3), fill=LINE)
    draw.text((17, y + 14), "3 个本次想法   ✦   《书页边缘》待同步", font=fonts["footer"], fill=MUTED)
    height = y + 45
    canvas = probe.crop((0, 0, width, height))
    hero = crop_cover(background, width, 116)
    hero = Image.blend(hero, Image.new("RGB", hero.size, "#30382f"), 0.12)
    canvas.paste(hero, (0, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def render_desktop(background: Image.Image, font_path: Path, output: Path):
    viewport_width = 768
    card_width = 620
    paper_width = 450
    x0 = (viewport_width - card_width) // 2
    fonts = {
        "date": font(font_path, 13),
        "hero": font(font_path, 32),
        "title": font(font_path, 18),
        "label": font(font_path, 11),
        "body": font(font_path, 13),
        "footer": font(font_path, 10),
    }
    probe = Image.new("RGB", (viewport_width, 1200), "#ffffff")
    draw = ImageDraw.Draw(probe)
    paper_x = x0
    inner_x = paper_x + 26
    content_width = paper_width - 52
    y = 24
    draw.text((inner_x, y), "2026年8月19日", font=fonts["date"], fill=GOLD)
    y += 27
    draw.text((inner_x, y), "今天读到这里", font=fonts["hero"], fill=WINE)
    y += 45
    draw.text((inner_x, y), f"《{FIXTURE['title']}》", font=fonts["title"], fill=INK)
    y += 33
    draw.rounded_rectangle((inner_x, y, inner_x + 73, y + 25), radius=13, fill="#ead9d0")
    draw.text((inner_x + 9, y + 3), FIXTURE["position"], font=fonts["footer"], fill=WINE)
    y += 42
    y = section(draw, inner_x, y, content_width, "读到哪里", FIXTURE["progress"], fonts)
    y = section(draw, inner_x, y + 5, content_width, "今天读了什么", FIXTURE["summary"], fonts, emphasis=True)
    y = section(draw, inner_x, y + 5, content_width, "塔芙留下", FIXTURE["tav"], fonts)
    y = section(draw, inner_x, y + 5, content_width, "盖尔留下", FIXTURE["gale"], fonts, label_color=GREEN)
    y = section(draw, inner_x, y + 5, content_width, "留到下次", FIXTURE["question"], fonts, label_color=GOLD)
    draw.line((inner_x, y + 3, inner_x + content_width, y + 3), fill=LINE)
    draw.text((inner_x, y + 14), "3 个本次想法   ✦   《书页边缘》待同步", font=fonts["footer"], fill=MUTED)
    card_height = y + 45
    card = Image.new("RGB", (card_width, card_height), PAPER)
    side = crop_cover(background, card_width - paper_width, card_height)
    card.paste(side, (paper_width, 0))
    paper = probe.crop((paper_x, 0, paper_x + paper_width, card_height))
    card.paste(paper, (0, 0))
    canvas = Image.new("RGB", (viewport_width, card_height), "#ffffff")
    canvas.paste(card, (x0, 0))
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument(
        "--background",
        type=Path,
        default=Path("web/src/assets/reading-room/end-books-tea.webp"),
    )
    parser.add_argument("--output-dir", type=Path, default=Path("docs/fixtures"))
    args = parser.parse_args()
    background = Image.open(args.background).convert("RGB")
    render_mobile(background, args.font, args.output_dir / "reading-end-card-390.png")
    render_desktop(background, args.font, args.output_dir / "reading-end-card-768.png")


if __name__ == "__main__":
    main()
