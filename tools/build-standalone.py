"""Bundle this small, known buildless project into one offline HTML file.

No dependencies. Source modules use one-line imports and named exports only.
Run: python3 tools/build-standalone.py /absolute/path/output.html
"""
from pathlib import Path
import base64
import json
import re
import sys

kit = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]) if len(sys.argv) > 1 else kit.parent / 'ending-rescue-playable.html'
modules = ['scene-config.js', 'engine.js', 'asset-loader.js', 'renderer.js', 'app.js']
parts = []
for name in modules:
    source = (kit / 'playable' / name).read_text(encoding='utf-8')
    source = re.sub(r'^import\s+[^\n]+;\s*$', '', source, flags=re.M)
    source = re.sub(r'^export\s*\{[^\n]+\};\s*$', '', source, flags=re.M)
    source = re.sub(r'^export\s+(?=(?:const|let|var|class|function|async\s+function)\b)', '', source, flags=re.M)
    if re.search(r'^\s*(?:import\s|export\s)', source, re.M):
        raise ValueError(f'Unbundled import/export in {name}; update the bundler for changed syntax.')
    parts.append('// Source: ' + name + '\n' + source)
bundle = '\n\n'.join(parts)
inline = {}
for name in ['staircase-background.png', 'librarian-actions.png', 'cat-actions.png', 'ending-comic.png']:
    inline[name] = 'data:image/png;base64,' + base64.b64encode((kit / 'assets' / name).read_bytes()).decode('ascii')
for name in ['librarian-actions.json', 'cat-actions.json', 'ending-comic.json']:
    inline[name] = json.loads((kit / 'assets' / name).read_text(encoding='utf-8'))
data = json.dumps(inline, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
css = (kit / 'playable' / 'style.css').read_text(encoding='utf-8')
css = re.sub(r'^@charset[^\n]*\n', '', css)
html = (kit / 'playable' / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="./style.css">', '<style>\n' + css + '\n</style>')
embedded = '<script>globalThis.LIBRARY_ENDING_INLINE_ASSETS=' + data + ';</script>\n'
embedded += '<script type="module">\n' + bundle.replace('</script', '<\\/script') + '\n</script>'
html = html.replace('<script type="module" src="./app.js"></script>', embedded)
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(json.dumps({'output': str(out.resolve()), 'bytes': out.stat().st_size, 'embedded_images': 4, 'embedded_json': 3}))
