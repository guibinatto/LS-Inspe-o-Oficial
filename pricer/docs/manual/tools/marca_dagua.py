# Insere a marca d'água diagonal "DOCUMENTO INTERNO" (padrão LS Fire Interno) em todos os cabeçalhos do DOCX.
# Uso: python3 marca_dagua.py entrada.docx saida.docx
import re, sys, zipfile

MARCA = '''<w:p><w:r><w:rPr><w:noProof/></w:rPr><mc:AlternateContent xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"><mc:Choice xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" Requires="wps"><w:drawing xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251660288" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV><wp:extent cx="6000000" cy="3000000"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="{ID}" name="MarcaDagua{ID}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm rot="-2700000"><a:off x="0" y="0"/><a:ext cx="6000000" cy="3000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx><w:txbxContent><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="D9D9D9"/><w:sz w:val="120"/></w:rPr><w:t>DOCUMENTO INTERNO</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:color w:val="D9D9D9"/><w:sz w:val="48"/></w:rPr><w:t>USO RESTRITO &#x2013; CIRCULAÇÃO INTERNA</w:t></w:r></w:p></w:txbxContent></wps:txbx><wps:bodyPr rot="0" wrap="square" anchor="ctr"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice></mc:AlternateContent></w:r></w:p>'''

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
n = 0
for it in zin.infolist():
    data = zin.read(it.filename)
    if re.match(r'word/header\d+\.xml$', it.filename):
        n += 1
        s = data.decode('utf8')
        s = s.replace('</w:hdr>', MARCA.replace('{ID}', str(900 + n)) + '</w:hdr>')
        data = s.encode('utf8')
    zout.writestr(it, data)
zout.close()
print('marca d\'água em', n, 'cabeçalho(s)')
