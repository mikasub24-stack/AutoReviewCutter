"""Render the original Vocal Studio mark as PNG and a Windows multi-size ICO.
Requires Pillow. SVG geometry is mirrored here so no external SVG renderer is needed.
"""
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent
scale = 4
size = 512 * scale
image = Image.new('RGBA', (size, size))
mask = Image.new('L', (size, size))
md = ImageDraw.Draw(mask)
box = lambda xy: tuple(round(v * scale) for v in xy)
md.rounded_rectangle(box((20, 20, 492, 492)), radius=112*scale, fill=255)
gradient = Image.new('RGBA', image.size)
g = ImageDraw.Draw(gradient)
for y in range(size):
    t = max(0, min(1, (y/scale-20)/472))
    c = tuple(round(a+(b-a)*t) for a,b in zip((25,43,67),(11,20,36)))
    g.line((0,y,size,y), fill=c+(255,))
image.paste(gradient, (0,0), mask)
d = ImageDraw.Draw(image)
d.rounded_rectangle(box((20,20,492,492)), radius=112*scale, outline='#2a495a', width=3*scale)
def line(points, color, width):
    points = [box(p) for p in points]
    d.line(points, fill=color, width=round(width*scale), joint='curve')
    r = width*scale/2
    for x,y in (points[0],points[-1]): d.ellipse((round(x-r),round(y-r),round(x+r),round(y+r)), fill=color)
for x,y1,y2 in [(110,232,280),(142,208,304),(370,208,304),(402,232,280)]: line([(x,y1),(x,y2)], '#50d0bf',16)
d.rounded_rectangle(box((204,104,308,312)), radius=52*scale, fill='#50d0bf')
line([(224,158),(224,220)], '#b8fff0',8)
line([(168,250),(168,284)], '#f3fafb',22)
# Align the arc centreline with the two vertical arms.
import math
curve=[(256+88*math.cos(math.pi-i*math.pi/160),284+88*math.sin(math.pi-i*math.pi/160)) for i in range(161)]
line(curve,'#f3fafb',22)
line([(344,284),(344,250)],'#f3fafb',22)
line([(256,372),(256,414)],'#f3fafb',22)
line([(214,416),(298,416)],'#f3fafb',22)
d.polygon([box(p) for p in [(397,91),(403,106),(418,112),(403,118),(397,133),(391,118),(376,112),(391,106)]],fill='#b9a6ff')
image=image.resize((1024,1024),Image.Resampling.LANCZOS)
image.save(root/'VocalStudio.png')
image.save(root/'VocalStudio.ico',sizes=[(s,s) for s in (16,20,24,32,40,48,64,96,128,256)])
