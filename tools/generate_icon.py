from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
source = Image.open(ASSETS / "app-logo-source.png").convert("RGBA")
side = max(source.size)
image = Image.new("RGBA", (side, side), (0, 0, 0, 0))
image.alpha_composite(source, ((side - source.width) // 2, (side - source.height) // 2))

png_path = ASSETS / "app-logo.png"
ico_path = ASSETS / "app-logo.ico"
image.save(png_path, optimize=True)
image.save(ico_path, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print(png_path)
print(ico_path)
