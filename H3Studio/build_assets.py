from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent
im = Image.new('RGBA', (256, 256), '#0b1020')
d = ImageDraw.Draw(im)
d.rounded_rectangle((18,18,238,238), radius=52, fill='#55dfc3')
d.rounded_rectangle((51,57,181,199), radius=18, fill='#14243b')
for y in (73,112,151):
    d.rounded_rectangle((59,y,75,y+20), radius=4, fill='#55dfc3')
    d.rounded_rectangle((157,y,173,y+20), radius=4, fill='#55dfc3')
d.polygon([(94,91),(94,165),(144,128)], fill='#55dfc3')
im.save(root/'icon.ico', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
im.save(root/'icon.png')
