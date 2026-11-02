# Draws the app's Home Screen icons: three fanned cards in the rarity colours on the foil look's dark ground.
import pathlib
from PIL import Image, ImageDraw, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
S = 1024
base = Image.new('RGB', (S, S), '#0c0916')

# The look's coloured glows.
glow = Image.new('RGB', (S, S), '#0c0916')
d = ImageDraw.Draw(glow)
d.ellipse((-200, -260, 620, 500), fill='#5a2ab8')
d.ellipse((480, 120, 1240, 860), fill='#135f86')
d.ellipse((120, 640, 900, 1320), fill='#86205f')
base = Image.blend(base, glow.filter(ImageFilter.GaussianBlur(170)), .85)

def card(color, angle, shift, rim):
    w, h = 470, 660
    layer = Image.new('RGBA', (S * 2, S * 2), (0, 0, 0, 0))
    x0, y0 = S - w // 2, S - h // 2
    dr = ImageDraw.Draw(layer)
    dr.rounded_rectangle((x0, y0, x0 + w, y0 + h), 54, fill=color, outline=rim, width=12)
    dr.rounded_rectangle((x0 + 62, y0 + 86, x0 + w - 62, y0 + 128), 21, fill=(23, 22, 28, 215))
    dr.rounded_rectangle((x0 + 62, y0 + 168, x0 + w - 150, y0 + 204), 18, fill=(23, 22, 28, 120))
    dr.rounded_rectangle((x0 + 62, y0 + h - 170, x0 + w - 62, y0 + h - 76), 22, fill=(23, 22, 28, 34))
    layer = layer.rotate(angle, resample=Image.BICUBIC, center=(S, S + 340))
    return layer.crop((S // 2 - shift[0], S // 2 - shift[1], S // 2 - shift[0] + S, S // 2 - shift[1] + S))

out = base.convert('RGBA')
for args in [('#ffdc9a', 21, (66, 18), '#ee9f12'), ('#e7d6ff', 7, (22, 2), '#b48cff'), ('#ffffff', -9, (-40, 8), '#ffffff')]:
    c = card(*args)
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 120), (0, 0), c.split()[3])
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(26)))
    out = Image.alpha_composite(out, c)

out = out.convert('RGB')
for size in (180, 192, 512):
    out.resize((size, size), Image.LANCZOS).save(root / f'icons/icon-{size}.png', optimize=True)
print('icons done')
