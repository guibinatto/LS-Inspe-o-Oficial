"""Gera proposta-textos.js (textos padrão + termos) e proposta-assets.js (imagens e fontes em base64)
para a proposta técnica e comercial no modelo PTC. Uso: python3 tools/proposta/gerar.py"""
import os, json, base64
root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
here = os.path.join(root, 'tools', 'proposta')
base = open(os.path.join(here, 'textos-base.js'), encoding='utf-8').read()
termos = json.load(open(os.path.join(here, 'termos.json'), encoding='utf-8'))
out = base.replace("'__TERMOS__'", json.dumps(termos, ensure_ascii=False, indent=0).replace('\n', ''))
# traduções (inglês e espanhol): textos padrão e termos, no mesmo formato
i18n = {}
for lg in ('en', 'es'):
    t = json.load(open(os.path.join(here, 'textos-' + lg + '.json'), encoding='utf-8'))
    t['termos'] = json.load(open(os.path.join(here, 'termos-' + lg + '.json'), encoding='utf-8'))
    i18n[lg] = t
out += '\nwindow.PRICER_PROPOSTA_TEXTOS.i18n = ' + json.dumps(i18n, ensure_ascii=False) + ';\n'
open(os.path.join(root, 'proposta-textos.js'), 'w', encoding='utf-8').write(out)
tpl = os.path.join(root, 'templates', 'proposta')
img = {}
for f in sorted(os.listdir(tpl)):
    p = os.path.join(tpl, f)
    if f.endswith(('.jpg', '.png')):
        mime = 'image/jpeg' if f.endswith('.jpg') else 'image/png'
        img[f.rsplit('.', 1)[0]] = 'data:' + mime + ';base64,' + base64.b64encode(open(p, 'rb').read()).decode()
fontes = {f[:-4]: base64.b64encode(open(os.path.join(tpl, 'fontes', f), 'rb').read()).decode() for f in sorted(os.listdir(os.path.join(tpl, 'fontes'))) if f.endswith('.ttf')}
js = '/* LS Pricer — imagens e fontes da proposta (gerado por tools/proposta/gerar.py a partir de templates/proposta). */\nwindow.PRICER_PROPOSTA_ASSETS=' + json.dumps({'img': img, 'fontes': fontes}) + ';\n'
open(os.path.join(root, 'proposta-assets.js'), 'w', encoding='utf-8').write(js)
print('proposta-textos.js', len(out) // 1024, 'KB · proposta-assets.js', len(js) // 1024, 'KB ·', len(img), 'imagens ·', len(fontes), 'fontes')
