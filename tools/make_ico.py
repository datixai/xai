"""Build build/icon.ico and build/icon.png from the rendered brand icon. Run with .venv python."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
src = Image.open(root / "branding" / "xai-icon-1024.png").convert("RGBA")
(root / "build").mkdir(exist_ok=True)
src.resize((512, 512), Image.LANCZOS).save(root / "build" / "icon.png")
src.save(root / "build" / "icon.ico", sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
print("icon.ico and icon.png written")
