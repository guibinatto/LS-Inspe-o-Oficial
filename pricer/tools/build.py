"""Gera dist/ls-pricer.html: um arquivo único (abre com duplo clique, sem internet
exceto as fontes). Uso: python3 tools/build.py"""
import os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
page = open(os.path.join(root, "index.html"), encoding="utf-8").read()
def inline(m):
    src = m.group(1)
    js = open(os.path.join(root, src), encoding="utf-8").read().replace("</script", "<\\/script")
    return "<script>/* " + src + " */\n" + js + "\n</script>"
page = re.sub(r'<script src="([\w.-]+)"></script>', inline, page)
import base64
page = re.sub(r'src="([\w.-]+\.png)"', lambda m: 'src="data:image/png;base64,' + base64.b64encode(open(os.path.join(root, m.group(1)), "rb").read()).decode() + '"', page)
head_end = page.index("</style>") + len("</style>")
out = ('<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
       '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
       + page[:head_end] + "\n</head>\n<body>\n" + page[head_end:] + "\n</body>\n</html>\n")
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
open(os.path.join(root, "dist", "ls-pricer.html"), "w", encoding="utf-8").write(out)
print("dist/ls-pricer.html", len(out) // 1024, "KB")
