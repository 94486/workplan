"""生成应用图标（exe 文件图标 + 系统托盘图标）。

设计：深蓝圆角背景 + 霓虹青色时钟圆环（工时）+ 指针 + 右下角绿色对勾（完成）。
产出：
  assets/app.ico   Windows 多尺寸图标（16/24/32/48/64/128/256），用于 exe 文件图标
  assets/app.png   256px PNG，用于托盘与文档

用法：
  python tools/make_icon.py
依赖：Pillow（已在 requirements.txt）
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (15, 23, 42, 255)        # 深蓝背景
RING = (34, 211, 238, 255)    # 霓虹青
HAND = (226, 232, 240, 255)   # 指针浅色
CHECK = (52, 211, 153, 255)   # 完成绿

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"


def draw_icon(size: int) -> Image.Image:
    """按指定边长绘制图标。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 256.0  # 缩放因子

    def S(v: float) -> float:
        return v * s

    # 圆角背景
    margin = S(10)
    d.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=S(56),
        fill=BG,
    )

    # 时钟圆环（工时）
    cx, cy = S(132), S(126)
    r = S(74)
    ring_w = max(2, int(S(14)))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=RING, width=ring_w)

    # 指针：12 点方向长针 + 10 点方向短针（圆头线条）
    line_w = max(2, int(S(11)))
    d.line([cx, cy, cx, cy - S(48)], fill=HAND, width=line_w)        # 分针
    d.line([cx, cy, cx - S(38), cy + S(22)], fill=HAND, width=line_w)  # 时针
    d.ellipse([cx - S(10), cy - S(10), cx + S(10), cy + S(10)], fill=HAND)  # 轴心

    # 右下角完成对勾
    gx, gy = S(196), S(196)
    gw = max(2, int(S(12)))
    d.line([gx - S(26), gy - S(2), gx - S(6), gy - S(24)], fill=CHECK, width=gw)
    d.line([gx - S(6), gy - S(24), gx + S(30), gy + S(22)], fill=CHECK, width=gw)

    return img


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    # ICO：多尺寸
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    base = draw_icon(256)
    base.save(
        ASSETS / "app.ico",
        format="ICO",
        sizes=[(s, s) for s in ico_sizes],
    )
    # PNG：托盘用 64px
    draw_icon(64).save(ASSETS / "app.png", format="PNG")

    print(f"已生成: {ASSETS / 'app.ico'} / {ASSETS / 'app.png'}")


if __name__ == "__main__":
    main()
