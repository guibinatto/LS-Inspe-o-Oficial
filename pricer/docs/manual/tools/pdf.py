# Converte o DOCX em PDF pelo LibreOffice, atualizando o sumário (índices) antes de exportar.
# Uso: python3 pdf.py entrada.docx saida.pdf
import os, subprocess, sys, time, uno
from com.sun.star.beans import PropertyValue

def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

src, dst = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
perfil = '/tmp/lo_manual_perfil'
proc = subprocess.Popen(['soffice', '--headless', '--invisible', '--norestore', '-env:UserInstallation=file://' + perfil,
                         '--accept=socket,host=127.0.0.1,port=2083;urp;'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    ctx = None
    for _ in range(60):
        try:
            local = uno.getComponentContext()
            res = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
            ctx = res.resolve('uno:socket,host=127.0.0.1,port=2083;urp;StarOffice.ComponentContext'); break
        except Exception:
            time.sleep(0.5)
    desk = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    doc = desk.loadComponentFromURL(uno.systemPathToFileUrl(src), '_blank', 0, (prop('Hidden', True),))
    for _ in range(2):  # duas passadas: o sumário muda o número de páginas
        idx = doc.getDocumentIndexes()
        for i in range(idx.getCount()): idx.getByIndex(i).update()
        doc.getTextFields().refresh()
    n = idx.getCount()
    doc.storeToURL(uno.systemPathToFileUrl(dst), (prop('FilterName', 'writer_pdf_Export'),))
    doc.close(True)
    print('pdf', dst, 'índices atualizados:', n)
finally:
    proc.terminate()
