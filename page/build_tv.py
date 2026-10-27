"""Builds the TV home page from pieces of Home Base for the Home Base TV app.
Usage: python build_tv.py [path/to/home-base.html]   (default: $HB_WALL or /home/claude/home-base.html; writes tv.html here and into the app's assets)"""
import json, re, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
WALL = open(sys.argv[1] if len(sys.argv) > 1 else os.environ.get('HB_WALL', '/home/claude/home-base.html'), encoding='utf-8').read()

def between(s, a, b):
    i = s.index(a); j = s.index(b, i); return s[i:j]
def line_from(s, start, count_lines):
    i = s.index(start); return '\n'.join(s[i:].split('\n')[:count_lines])

# CSS: stickers + characters from the wall
css_wall = between(WALL, '.stk { display:inline-block', '.hol-card { grid-column')
css_wall = '\n'.join(l for l in css_wall.split('\n') if not l.startswith(('.deco-mast', '.board-bar', '.stk.c ', '.stk-word', '  text-shadow', '.deco-d', ':root[data-holiday]', '.hero-lane', '.hero-d', '.mast-hero')))
css = open(os.path.join(HERE, 'tv.css'), encoding='utf-8').read() + '\n' + css_wall

# JS: helpers, weather icons, color math, then the holiday stickers/characters/themes block
js = []
js.append(line_from(WALL, "const DOW = ['Sun'", 3))
js.append(between(WALL, 'const W = {', '/* ---------- helpers ---------- */'))
js.append(between(WALL, '/* ---------- helpers ---------- */', 'function fmtHm(s)'))
js.append(between(WALL, 'const mixHex = (a, b, t)', 'const DERIVED_KEYS'))
js.append(line_from(WALL, 'const isHex = v =>', 1))
js.append(between(WALL, 'function hexRgb(v) {', 'const lerpC = ') + line_from(WALL, 'const lerpC = ', 1))
js.append(between(WALL, 'function easter(y) {', 'function holidayFx() {'))
js.append("const S = { settings: { holidayMode: 'off', motionNight: false } };\n"
          "const isDarkNow = () => true; const inNight = () => false;\n"
          "const fxStill = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };")
js.append(between(WALL, '/* ---------- holiday stickers ----------', 'function holidayCard() {'))
# Background music: the wall's own music engine (made right on the screen with Web Audio, nothing to download).
js.append("const TV = true;")
js.append(line_from(WALL, 'const lsGet = k =>', 2))
js.append(between(WALL, '/* ---------- background music ----------', 'function musicCard() {'))
js.append(open(os.path.join(HERE, 'tv-main.js'), encoding='utf-8').read())
script = '\n'.join(js)
assert '</script' not in script

html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Home Base TV</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap">
<style>
{css}
</style></head><body>
<div id="glow" aria-hidden="true"><i class="g1"></i><i class="g2"></i><i class="g3"></i></div><div id="pat"></div><div id="motes"></div><div id="fade"></div>
<main id="wrap">
  <section class="left"><div id="clock"></div><div id="date"></div><div id="wx"></div><div id="next"></div></section>
  <section class="right"><span class="lbl">Up next</span><div id="up"></div><div id="dinner"></div><div id="chores"></div></section>
  <section id="photo" aria-hidden="true"></section>
</main>
<div id="lane" aria-hidden="true"></div>
<script>
(() => {{
{script}
}})();
</script></body></html>'''
open(os.path.join(HERE, 'tv.html'), 'w', encoding='utf-8', newline='\n').write(html)

# The page ships inside the Home Base TV app (and a copy goes to the test server).
for dest in [os.path.join(HERE, '..', 'app', 'src', 'main', 'assets', 'tv.html')]:
    open(dest, 'w', encoding='utf-8', newline='\n').write(html)
print('tv.html', len(html), 'bytes')
