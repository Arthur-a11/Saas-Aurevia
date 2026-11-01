#!/usr/bin/env python3
"""Génère l'image d'aperçu de partage (1200 × 630) : public/partage.png.
Contenu réel uniquement (nom, promesse, chiffres du catalogue). Usage : python3 scripts/generer-image-partage.py"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

R = Path(__file__).resolve().parent.parent
F = R / "public" / "fonts"
L, H = 1200, 630
img = Image.new("RGB", (L, H), (10, 11, 46))
px = img.load()
for y in range(H):
    t = y / H
    c = (int(10 + 12 * t), int(11 + 5 * t), int(46 + 60 * t))
    for x in range(L):
        px[x, y] = c
img = img.convert("RGBA")
halo = Image.new("RGBA", (L, H), (0, 0, 0, 0))
d = ImageDraw.Draw(halo)
d.ellipse([-200, -150, 600, 500], fill=(124, 92, 255, 110))
d.ellipse([700, 250, 1400, 900], fill=(34, 211, 238, 80))
img = Image.alpha_composite(img, halo.filter(ImageFilter.GaussianBlur(120)))
grille = Image.new("RGBA", (L, H), (0, 0, 0, 0))
g = ImageDraw.Draw(grille)
for x in range(0, L, 60):
    g.line([(x, 0), (x, H)], fill=(150, 170, 255, 16))
for y in range(0, H, 60):
    g.line([(0, y), (L, y)], fill=(150, 170, 255, 16))
img = Image.alpha_composite(img, grille)
d = ImageDraw.Draw(img)
titre = ImageFont.truetype(str(F / "bricolage-grotesque-latin-800-normal.woff2"), 74)
texte = ImageFont.truetype(str(F / "public-sans-latin-500-normal.woff2"), 32)
mono = ImageFont.truetype(str(F / "jetbrains-mono-latin-700-normal.woff2"), 26)
d.text((80, 80), "FORMATION EN LIGNE · SANS CODE", font=mono, fill=(34, 211, 238))
d.text((80, 140), "Construisez l’entreprise", font=titre, fill=(238, 242, 255))
d.text((80, 225), "qui encaisse chaque mois.", font=titre, fill=(142, 239, 255))
for i in range(260):
    u = i / 259
    d.line([(80 + i, 330), (80 + i, 336)], fill=(int(139 + (34 - 139) * u), int(108 + (211 - 108) * u), int(255 + (238 - 255) * u)))
d.text((80, 370), "Apprenez à créer, lancer et vendre un logiciel par abonnement.", font=texte, fill=(205, 212, 240))
d.text((80, 470), "6 modules  ·  1 500 idées de SaaS  ·  15 marchés", font=mono, fill=(232, 196, 106))
d.text((80, 540), "AUREVIA SAAS", font=ImageFont.truetype(str(F / "bricolage-grotesque-latin-800-normal.woff2"), 40), fill=(255, 255, 255))
img.convert("RGB").quantize(colors=128, method=Image.Quantize.MEDIANCUT).save(R / "public" / "partage.png", optimize=True)
print("public/partage.png écrit")
