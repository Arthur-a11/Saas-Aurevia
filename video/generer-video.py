#!/usr/bin/env python3
"""
Vidéo de présentation AUREVIA SAAS — NOUVELLE CRÉATION (1er novembre 2026).

Ce script n'est PAS le fichier original « generer-video.py » : l'original et la vidéo
« presentation-saas.mp4 » n'ont pas été retrouvés. Il produit une nouvelle vidéo verticale
(1080 × 1920, 17 secondes, 30 images/s), fidèle au contenu réel du site : tous les textes
viennent des fichiers src/data/*.json (programme, prix, nombre d'idées).

Ce qui n'est PAS dans la vidéo : témoignages, chiffres d'élèves, résultats promis,
« Lien dans la description ». L'adresse du site s'affiche seulement si on la fournit.

Usage :
    python3 video/generer-video.py                       # sans adresse de site
    python3 video/generer-video.py --site www.exemple.fr # avec l'adresse à afficher
Résultat : video/sortie/presentation-saas-nouvelle-creation.mp4
Dépendances : Python 3, Pillow, ffmpeg.
"""
import argparse
import json
import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RACINE = Path(__file__).resolve().parent.parent
DONNEES = RACINE / "src" / "data"
POLICES = RACINE / "public" / "fonts"
SORTIE = Path(__file__).resolve().parent / "sortie"

L, H, IPS, DUREE = 1080, 1920, 30, 17.0
MARGE = 90

# Couleurs du site (src/styles/tokens.css)
FOND_A, FOND_B, FOND_C = (10, 11, 46), (22, 16, 106), (8, 54, 90)
VIOLET, CYAN, OR, ENCRE, GRIS = (139, 108, 255), (34, 211, 238), (232, 196, 106), (238, 242, 255), (169, 180, 221)


def police(nom, taille):
    chemin = POLICES / nom
    try:
        return ImageFont.truetype(str(chemin), taille)
    except OSError:
        return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", taille)


TITRE = lambda t: police("bricolage-grotesque-latin-800-normal.woff2", t)
TITRE7 = lambda t: police("bricolage-grotesque-latin-700-normal.woff2", t)
TEXTE = lambda t: police("public-sans-latin-500-normal.woff2", t)
TEXTE6 = lambda t: police("public-sans-latin-600-normal.woff2", t)


def charger():
    site = json.loads((DONNEES / "site.json").read_text(encoding="utf-8"))
    programme = json.loads((DONNEES / "programme.json").read_text(encoding="utf-8"))
    marches = json.loads((DONNEES / "marches.json").read_text(encoding="utf-8"))
    nb_niches = sum(len(m["niches"]) for m in marches["marches"])
    nb_idees = sum(len(n["idees"]) for m in marches["marches"] for n in m["niches"])
    return site, programme, len(marches["marches"]), nb_niches, nb_idees


def nombre(n):
    return f"{n:,}".replace(",", " ")


def degrade_vertical():
    img = Image.new("RGB", (L, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1)
        if t < 0.5:
            a, b, u = FOND_A, FOND_B, t / 0.5
        else:
            a, b, u = FOND_B, FOND_C, (t - 0.5) / 0.5
        c = tuple(int(a[i] + (b[i] - a[i]) * u) for i in range(3))
        for x in range(L):
            px[x, y] = c
    return img


def fond_de_base():
    """Dégradé + grille + halos (même ambiance que le site)."""
    img = degrade_vertical().convert("RGBA")
    grille = Image.new("RGBA", (L, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(grille)
    for x in range(0, L, 72):
        d.line([(x, 0), (x, H)], fill=(150, 170, 255, 18))
    for y in range(0, H, 72):
        d.line([(0, y), (L, y)], fill=(150, 170, 255, 18))
    img = Image.alpha_composite(img, grille)
    halos = Image.new("RGBA", (L, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(halos)
    d.ellipse([-250, 150, 650, 950], fill=(124, 92, 255, 90))
    d.ellipse([500, 700, 1350, 1500], fill=(34, 211, 238, 60))
    d.ellipse([100, 1450, 1000, 2250], fill=(79, 70, 229, 80))
    halos = halos.filter(ImageFilter.GaussianBlur(160))
    return Image.alpha_composite(img, halos)


def ease(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def couper(texte, fnt, largeur, d):
    mots, lignes, ligne = texte.split(), [], ""
    for m in mots:
        essai = (ligne + " " + m).strip()
        if d.textlength(essai, font=fnt) <= largeur:
            ligne = essai
        else:
            lignes.append(ligne)
            ligne = m
    if ligne:
        lignes.append(ligne)
    return lignes


class Calque:
    """Dessine des éléments qui apparaissent en fondu et glissent légèrement vers le haut."""

    def __init__(self, base):
        self.img = base.copy()

    def texte(self, xy, contenu, fnt, couleur, apparition, t, largeur=L - 2 * MARGE, interligne=1.18, centre=False):
        a = ease((t - apparition) / 0.6)
        if a <= 0:
            return xy[1]
        calque = Image.new("RGBA", (L, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(calque)
        x, y = xy
        y_dec = y + int((1 - a) * 40)
        for ligne in couper(contenu, fnt, largeur, d):
            lx = (L - d.textlength(ligne, font=fnt)) / 2 if centre else x
            d.text((lx, y_dec), ligne, font=fnt, fill=couleur + (int(255 * a),))
            y_dec += int(fnt.size * interligne)
            y += int(fnt.size * interligne)
        self.img = Image.alpha_composite(self.img, calque)
        return y

    def barre(self, x, y, largeur, apparition, t):
        a = ease((t - apparition) / 0.6)
        if a <= 0:
            return
        calque = Image.new("RGBA", (L, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(calque)
        w = int(largeur * a)
        for i in range(w):
            u = i / max(1, largeur - 1)
            c = tuple(int(VIOLET[k] + (CYAN[k] - VIOLET[k]) * u) for k in range(3))
            d.line([(x + i, y), (x + i, y + 8)], fill=c + (255,))
        self.img = Image.alpha_composite(self.img, calque)

    def carte(self, boite, apparition, t):
        a = ease((t - apparition) / 0.6)
        if a <= 0:
            return
        calque = Image.new("RGBA", (L, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(calque)
        d.rounded_rectangle(boite, radius=36, fill=(255, 255, 255, int(16 * a)), outline=(150, 170, 255, int(90 * a)), width=3)
        self.img = Image.alpha_composite(self.img, calque)


def scene(t, base, site, programme, nb_m, nb_n, nb_i, adresse):
    c = Calque(base)
    if t < 3.2:  # 1. Nom et promesse
        y = c.texte((MARGE, 660), "AUREVIA SAAS", TITRE(118), ENCRE, 0.1, t, centre=True)
        c.barre((L - 260) // 2, y + 20, 260, 0.5, t)
        y = c.texte((MARGE, y + 90), "Apprenez à créer un SaaS, de l’idée aux premiers clients.", TEXTE(54), GRIS, 0.9, t, centre=True)
        c.texte((MARGE, y + 70), "Formation en ligne · sans code", TEXTE6(46), CYAN, 1.5, t, centre=True)
    elif t < 6.6:  # 2. Accroche du site
        s = t - 3.2
        y = c.texte((MARGE, 560), "Construisez l’entreprise qui encaisse chaque mois.", TITRE(104), ENCRE, 0.0, s)
        c.barre(MARGE, y + 30, 220, 0.5, s)
        c.texte((MARGE, y + 100), "Créer, lancer et vendre un logiciel par abonnement. La méthode d’un fondateur, sans jargon.", TEXTE(52), GRIS, 0.8, s)
    elif t < 11.0:  # 3. Les 6 modules
        s = t - 6.6
        y = c.texte((MARGE, 260), f"{len(programme['modules'])} modules, dans l’ordre", TITRE(80), ENCRE, 0.0, s)
        c.barre(MARGE, y + 20, 220, 0.3, s)
        y0 = y + 90
        for i, m in enumerate(programme["modules"]):
            yy = y0 + i * 200
            c.carte([MARGE, yy, L - MARGE, yy + 170], 0.4 + i * 0.35, s)
            c.texte((MARGE + 40, yy + 52), f"0{i + 1}", TITRE(56), OR, 0.45 + i * 0.35, s)
            c.texte((MARGE + 170, yy + 56), m["titre"], TEXTE6(48), ENCRE, 0.5 + i * 0.35, s, largeur=L - 2 * MARGE - 210)
    elif t < 14.2:  # 4. Marchés et idées, avec l'avertissement
        s = t - 11.0
        y = c.texte((MARGE, 480), f"{nb_m} marchés", TITRE(112), ENCRE, 0.0, s, centre=True)
        y = c.texte((MARGE, y + 20), f"{nombre(nb_n)} niches", TITRE(112), CYAN, 0.35, s, centre=True)
        y = c.texte((MARGE, y + 20), f"{nombre(nb_i)} idées", TITRE(112), OR, 0.7, s, centre=True)
        y = c.texte((MARGE, y), "de SaaS", TITRE7(64), OR, 0.8, s, centre=True)
        c.texte((MARGE, y + 90), "Des pistes à tester : seule la rencontre avec de vrais clients valide une niche.", TEXTE(48), GRIS, 1.2, s, centre=True)
    else:  # 5. Offre réelle
        s = t - 14.2
        prix_min = site["formules"][0]["prixAffiche"]
        y = c.texte((MARGE, 620), f"Dès {prix_min}", TITRE(130), ENCRE, 0.0, s, centre=True)
        y = c.texte((MARGE, y + 30), "Un seul paiement · aucun code requis", TEXTE6(52), CYAN, 0.3, s, centre=True)
        y = c.texte((MARGE, y + 40), "Inscription sans paiement, en deux minutes.", TEXTE(50), GRIS, 0.6, s, centre=True)
        c.texte((MARGE, y + 200), adresse if adresse else "AUREVIA SAAS", TITRE7(64), ENCRE, 0.9, s, centre=True)
    return c.img.convert("RGB")


def main():
    p = argparse.ArgumentParser(description="Génère la vidéo de présentation (nouvelle création).")
    p.add_argument("--site", default="", help="adresse du site à afficher à la fin (facultatif)")
    p.add_argument("--sortie", default=str(SORTIE / "presentation-saas-nouvelle-creation.mp4"))
    args = p.parse_args()

    site, programme, nb_m, nb_n, nb_i = charger()
    base = fond_de_base()
    Path(args.sortie).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{L}x{H}", "-r", str(IPS), "-i", "-",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart",
        "-metadata", "title=AUREVIA SAAS – présentation (nouvelle création)",
        "-metadata", "comment=Nouvelle vidéo créée le 2026-11-01 par video/generer-video.py ; ce n'est pas la vidéo originale.",
        args.sortie,
    ]
    ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    total = int(DUREE * IPS)
    for i in range(total):
        t = i / IPS
        img = scene(t, base, site, programme, nb_m, nb_n, nb_i, args.site)
        # Fondu au noir sur les 0,4 dernière seconde
        if t > DUREE - 0.4:
            img = Image.blend(img, Image.new("RGB", (L, H), FOND_A), (t - (DUREE - 0.4)) / 0.4)
        ff.stdin.write(img.tobytes())
    ff.stdin.close()
    if ff.wait() != 0:
        raise SystemExit("ffmpeg a échoué")
    print(f"Vidéo écrite : {args.sortie} ({total} images, {DUREE:g} s)")


if __name__ == "__main__":
    main()
