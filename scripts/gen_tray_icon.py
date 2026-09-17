#!/usr/bin/env python3
"""生成菜单栏模板托盘图标 (tray-icon.png)

用法:
  python3 scripts/gen_tray_icon.py [笔画宽度]

  - 笔画宽度: SVG stroke-width, 默认 51 (512 视口下约 10%)。越大越粗。
  - 生成 src-tauri/icons/tray-icon.png, 需重新编译生效 (npm run tauri dev 会自动重编译)。
"""
import shutil
import subprocess
import sys
import os
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
TRAY_PNG = ROOT / "src-tauri" / "icons" / "tray-icon.png"

STROKE = int(sys.argv[1]) if len(sys.argv) > 1 else 51

BLOCK_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect x="0" y="0" width="512" height="512" rx="100" fill="#000000"/>
</svg>
"""

LOGO_SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <g fill="none" stroke="#000000" stroke-width="{STROKE}" stroke-linecap="round" stroke-linejoin="round">
    <g transform="translate(158,260) scale(0.68)">
      <path d="M -140,120 C -140,20 -100,-100 -30,-120 C 40,-140 100,-60 80,20 C 60,100 -40,120 -80,100"/>
    </g>
    <g transform="translate(362,260) scale(0.88)">
      <path d="M -100,-55 C -60,-112 60,-112 100,-55"/>
      <path d="M 0,-40 L 0,80"/>
    </g>
  </g>
</svg>
"""


def render_svg(svg: str, tmp: pathlib.Path, name: str) -> pathlib.Path:
    """用 Chrome headless 把 SVG 渲染成 PNG"""
    svg_path = tmp / f"{name}.svg"
    svg_path.write_text(svg)
    html = tmp / f"{name}.html"
    html.write_text(
        f'<!DOCTYPE html><html><body style="margin:0"><img src="{svg_path}" width="256" height="256"></body></html>'
    )
    png = tmp / f"{name}.png"
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    subprocess.run(
        [chrome, "--headless=new", "--disable-gpu",
         f"--screenshot={png}", "--window-size=256,256", str(html)],
        check=True, capture_output=True,
    )
    return png


def main():
    from PIL import Image

    with tempfile.TemporaryDirectory() as td:
        tmp = pathlib.Path(td)
        block_png = render_svg(BLOCK_SVG, tmp, "block")
        logo_png = render_svg(LOGO_SVG, tmp, "logo")

        block = Image.open(block_png).convert("L")
        logo = Image.open(logo_png).convert("L")
        out = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
        pb, pl, po = block.load(), logo.load(), out.load()
        for y in range(256):
            for x in range(256):
                if pb[x, y] <= 200 and pl[x, y] > 200:
                    po[x, y] = (0, 0, 0, 255)  # 底块不透明, logo 笔画镂空

        out64 = out.resize((64, 64), Image.LANCZOS)
        out64.save(TRAY_PNG)
        px = out64.load()
        hits = sum(1 for yy in range(64) for xx in range(64) if px[xx, yy][3] > 0)
        print(f"stroke={STROKE} -> {TRAY_PNG} (不透明占比 {hits/4096*100:.0f}%)")
        print("重编译生效: npm run tauri dev 会自动重建 (或 cargo build in src-tauri)")


if __name__ == "__main__":
    main()