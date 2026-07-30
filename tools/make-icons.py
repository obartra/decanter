from PIL import Image, ImageDraw
import math

BG_TOP, BG_MID, BG_BOT = (74,34,160), (33,15,80), (11,4,36)
BANDS = [(58,163,227), (123,193,66), (245,185,50), (230,64,46)]  # bottom -> top
CORK_TOP, CORK_MID, CORK_BOT = (247,222,180), (216,167,109), (143,98,49)
COLLAR_TOP, COLLAR_BOT = (92,110,158), (20,28,60)

def radial_bg(size):
    img = Image.new("RGB", (size, size))
    px = img.load()
    cx, cy = size/2, -size*0.1
    maxr = size*1.35
    for y in range(size):
        for x in range(size):
            d = min(1.0, math.hypot(x-cx, y-cy)/maxr)
            if d < 0.42:
                t = d/0.42
                c = [BG_TOP[i] + (BG_MID[i]-BG_TOP[i])*t for i in range(3)]
            else:
                t = (d-0.42)/0.58
                c = [BG_MID[i] + (BG_BOT[i]-BG_MID[i])*t for i in range(3)]
            px[x, y] = tuple(int(v) for v in c)
    return img

def vgrad(draw, box, top, bot):
    x0, y0, x1, y1 = box
    h = max(1, y1-y0)
    for y in range(int(y0), int(y1)):
        t = (y-y0)/h
        c = tuple(int(top[i] + (bot[i]-top[i])*t) for i in range(3))
        draw.line([(x0, y), (x1, y)], fill=c)

def bottle(size, inset):
    """inset = fraction of the canvas kept clear around the art (maskable icons need more)"""
    S = size*4                       # supersample
    img = radial_bg(size).resize((S, S), Image.LANCZOS)
    d = ImageDraw.Draw(img, "RGBA")

    bw = S*(1-2*inset)*0.42
    bh = bw*2.55
    cx = S/2
    top = (S-bh)/2 + S*0.03
    left, right = cx-bw/2, cx+bw/2
    r = bw*0.28

    # liquid, four bands, drawn into a rounded-rect mask
    body = Image.new("RGBA", (S, S), (0,0,0,0))
    bd = ImageDraw.Draw(body)
    unit = bh/4
    for i, col in enumerate(BANDS):
        y0 = top + bh - unit*(i+1)
        bd.rectangle([left, y0, right, y0+unit+1], fill=col+(255,))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([left, top, right, top+bh], radius=r, fill=255)
    img.paste(body, (0,0), mask)

    # glass rim + specular stripe
    d.rounded_rectangle([left, top, right, top+bh], radius=r,
                        outline=(200,225,255,190), width=max(2, int(S*0.006)))
    stripe = Image.new("RGBA", (S, S), (0,0,0,0))
    ImageDraw.Draw(stripe).rectangle(
        [left+bw*0.10, top+bh*0.03, left+bw*0.22, top+bh*0.95], fill=(255,255,255,105))
    img.paste(stripe, (0,0), Image.composite(mask, Image.new("L",(S,S),0), mask))
    d2 = ImageDraw.Draw(img, "RGBA")

    # collar
    cw = bw*0.44
    ch = bh*0.055
    vgrad(d2, [cx-cw/2, top-ch, cx+cw/2, top], COLLAR_TOP, COLLAR_BOT)

    # cork: head above the rim, tapered body descending into the neck
    hw, hh = bw*0.52, bh*0.05
    hy = top-ch-hh
    vgrad(d2, [cx-hw/2, hy, cx+hw/2, hy+hh], CORK_TOP, CORK_MID)
    plug = [(cx-cw*0.48, top), (cx+cw*0.48, top),
            (cx+cw*0.38, top+bh*0.10), (cx-cw*0.38, top+bh*0.10)]
    d2.polygon(plug, fill=CORK_MID)
    d2.line([plug[0], plug[1]], fill=CORK_TOP, width=max(2, int(S*0.005)))

    return img.resize((size, size), Image.LANCZOS)

for s in (192, 512):
    bottle(s, 0.06).save(f"assets/icons/icon-{s}.png")
bottle(512, 0.17).save("assets/icons/maskable-512.png")   # 20% safe zone for adaptive icons
bottle(180, 0.06).save("assets/icons/apple-touch-icon.png")
bottle(32, 0.04).save("assets/icons/favicon-32.png")
print("icons written")
