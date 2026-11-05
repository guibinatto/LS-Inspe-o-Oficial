"""Corrige a LS PRICER REV20 direto no XML do .xlsx (preserva estilos, validações e formatação).

Uso: python3 patch_rev20.py entrada.xlsx saida.xlsx
Correções:
 1. Duplicidade kit diesel/kit bomba x linhas novas (painel, chave, base, manômetro, manovacuômetro)
 2. Alerta de motor não encontrado também nas conferências (B32 já avisava) — reforçado em P84
 3. Linhas além da 30ª da montagem: custo e importado entram no subtotal + aviso
 4. Jockey em branco virando 0 (E17, AR22, D19, J19, AR7, AR8, C20)
 5. Aviso de itens sem preço no cadastro
 6. Nº de bombas da PROPOSTA (H20:H29) passa a valer no arranjo
 7. Aviso de código/descrição acima do limite
 8. " 0 " nas descrições (AR21 = L19 vazio virava 0)
 9. LOOKUP do modelo da bomba (D23:D26) sem IF matricial
10. Aviso "KIT MOTORES DIESEL sem o preço do motor" só quando o motor é mesmo um kit
11. Lista de insumos do escopo (D68:D112) sem INDIRECT("RC[-1]"): lê a família da coluna C
"""
import sys, re, zipfile, html

src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src)
files = {n: zin.read(n) for n in zin.namelist()}

wb = files["xl/workbook.xml"].decode()
rels = files["xl/_rels/workbook.xml.rels"].decode()
rid2file = dict(re.findall(r'Id="(rId\d+)"[^>]*Target="([^"]+)"', rels))
rid2file.update({a: b for b, a in re.findall(r'Target="([^"]+)"[^>]*Id="(rId\d+)"', rels)})
sheets = {}
for name, rid in re.findall(r'<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"', wb):
    sheets[html.unescape(name)] = "xl/" + rid2file[rid].lstrip("/").replace("xl/", "")

xml = {}
def load(name):
    p = sheets[name]
    if p not in xml:
        xml[p] = files[p].decode()
    return p

CELL = lambda ref: re.compile(r'<c r="%s"(?: [^>]*?)?(?:/>|>.*?</c>)' % ref, re.S)
esc = lambda s: s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
count = {"f": 0, "new": 0}

def get_formula(sheet, ref):
    p = load(sheet)
    m = CELL(ref).search(xml[p])
    if not m:
        return None
    f = re.search(r"<f[^>]*>(.*?)</f>", m.group(0), re.S)
    return html.unescape(f.group(1)) if f else None

def col2n(c):
    n = 0
    for ch in c:
        n = n * 26 + ord(ch) - 64
    return n

def set_formula(sheet, ref, formula, text=False, style_from=None):
    p = load(sheet)
    s = xml[p]
    m = CELL(ref).search(s)
    t = ' t="str"' if text else ""
    if m:
        st = re.search(r' s="(\d+)"', m.group(0))
        st = f' s="{st.group(1)}"' if st else ""
        new = f'<c r="{ref}"{st}{t}><f aca="false">{esc(formula)}</f><v></v></c>' if text else \
              f'<c r="{ref}"{st}><f aca="false">{esc(formula)}</f></c>'
        xml[p] = s[:m.start()] + new + s[m.end():]
        count["f"] += 1
        return
    insert_cell(sheet, ref, (f'<f aca="false">{esc(formula)}</f>' + ('<v></v>' if text else "")), t, style_from)

def set_text(sheet, ref, value, style_from=None):
    p = load(sheet)
    m = CELL(ref).search(xml[p])
    body = f'<is><t xml:space="preserve">{esc(value)}</t></is>'
    if m:
        st = re.search(r' s="(\d+)"', m.group(0))
        st = f' s="{st.group(1)}"' if st else ""
        xml[p] = xml[p][:m.start()] + f'<c r="{ref}"{st} t="inlineStr">{body}</c>' + xml[p][m.end():]
        return
    insert_cell(sheet, ref, body, ' t="inlineStr"', style_from)

def insert_cell(sheet, ref, body, t, style_from):
    p = load(sheet)
    s = xml[p]
    col, row = re.match(r"([A-Z]+)(\d+)", ref).groups()
    st = ""
    if style_from:
        m = CELL(style_from).search(s)
        if m:
            g = re.search(r' s="(\d+)"', m.group(0))
            st = f' s="{g.group(1)}"' if g else ""
    cell = f'<c r="{ref}"{st}{t}>{body}</c>'
    rm = re.search(r'<row r="%s"[^>]*?(?:/>|>.*?</row>)' % row, s, re.S)
    if not rm:
        raise SystemExit(f"linha {row} não existe em {sheet}")
    rowxml = rm.group(0)
    if rowxml.endswith("/>"):
        newrow = rowxml[:-2] + ">" + cell + "</row>"
    else:
        pos = None
        for cm in re.finditer(r'<c r="([A-Z]+)\d+"', rowxml):
            if col2n(cm.group(1)) > col2n(col):
                pos = cm.start()
                break
        if pos is None:
            pos = rowxml.rindex("</row>")
        newrow = rowxml[:pos] + cell + rowxml[pos:]
    xml[p] = s[:rm.start()] + newrow + s[rm.end():]
    count["new"] += 1

def sub_formula(sheet, ref, old, new, required=True, text=None):
    f = get_formula(sheet, ref)
    if f is None or old not in f:
        if required:
            print(f"  aviso: {sheet}!{ref} não tem o trecho esperado — mantido")
        return False
    p = load(sheet)
    m = CELL(ref).search(xml[p])
    is_text = ' t="str"' in m.group(0) if text is None else text
    set_formula(sheet, ref, f.replace(old, new), text=is_text)
    return True

# ---------------------------------------------------------------- MONTADOR
MO = "MONTADOR"
set_text(MO, "L91", "SÓ SEM KIT", style_from="K91")
for r, v in [(130, "SEM KIT MOTOR"), (131, "SEM KIT MOTOR"), (133, "SEM KIT MOTOR"),
             (134, "SEM KIT BOMBA"), (135, "SEM KIT BOMBA")]:
    set_text(MO, f"L{r}", v, style_from=f"K{r}")
nota = "Linhas com SEM KIT MOTOR só entram quando o motor diesel escolhido NÃO é um kit da aba KIT MOTORES DIESEL (o kit já traz painel, base e chave). SEM KIT BOMBA só entra quando a bomba NÃO é um kit da aba KIT BOMBA (o kit já traz manômetro e manovacuômetro)."
set_text(MO, "L90", nota, style_from="B90")

# nome REC_KIT
if 'name="REC_KIT"' not in wb:
    wb = wb.replace("</definedNames>",
        '<definedName function="false" hidden="false" name="REC_KIT" vbProcedure="false">MONTADOR!$L$92:$L$151</definedName></definedNames>')
# recalcular tudo ao abrir
wb = re.sub(r"<calcPr([^>]*?)(/?)>", lambda m: "<calcPr" + re.sub(r' fullCalcOnLoad="[^"]*"', "", m.group(1)) + ' fullCalcOnLoad="1"' + m.group(2) + ">", wb, count=1)

# ---------------------------------------------------------------- ITENS
JOCK_OLD = 'IF(IFERROR(INDEX(MOD_JOCKEY,MATCH($AR$1,MOD_NOME,0)),"")=""'
JOCK_NEW = 'IF(IFERROR(INDEX(MOD_JOCKEY,MATCH($AR$1,MOD_NOME,0))&"","")=""'
NB_OLD = 'MAX(1,IFERROR(VALUE(IFERROR(INDEX(MOD_NBOMBAS,MATCH($AR$1,MOD_NOME,0)),1)),1))'
MODREF = re.compile(r'(INDEX\(MOD_(?:BOMBA|JOCKEY|MOTOR),MATCH\(\$AR\$1,MOD_NOME,0\)\)),""\)')

for k in range(1, 11):
    it = f"ITEM {k:02d}"
    load(it)
    prow = 19 + k
    NB_NEW = f'IF(PROPOSTA!$H${prow}<>"",MAX(1,IFERROR(VALUE(PROPOSTA!$H${prow}),1)),{NB_OLD})'
    # 4 + 6: arranjo (E17 / AR22)
    for ref in ("E17", "AR22"):
        f = get_formula(it, ref)
        if f and JOCK_OLD in f:
            f = f.replace(JOCK_OLD, JOCK_NEW).replace(NB_OLD, NB_NEW)
            set_formula(it, ref, f, text=True)
        elif f:
            print(f"  aviso: {it}!{ref} diferente do padrão — mantido")
    # 4: bomba/jockey/motor do modelo vazio não vira 0
    for ref in ("D19", "J19", "AR7", "AR8", "C20"):
        f = get_formula(it, ref)
        if f and MODREF.search(f):
            set_formula(it, ref, MODREF.sub(r'\1&"","")', f), text=True)
    # 8: tensão vazia
    f = get_formula(it, "AR21")
    if f == "$L$19":
        set_formula(it, "AR21", '$L$19&""', text=True)
    # 9: LOOKUP do modelo da bomba
    for r in range(23, 27):
        sub_formula(it, f"D{r}", 'SEARCH(IF(COD_MODELO_LISTA="","§§§§",COD_MODELO_LISTA),',
                    'SEARCH(COD_MODELO_LISTA&REPT("§§§§",--(COD_MODELO_LISTA="")),', required=(k == 1 and r == 23))
    # 1: receita — linhas "SEM KIT" pulam quando há kit
    for r in range(68, 128):
        n = r - 67
        f = get_formula(it, f"AF{r}")
        head = f'IF(OR(INDEX(REC_TIPO,{n})="",$AR$14=0),0,'
        if f and f.startswith(head) and "REC_KIT" not in f:
            rest = f[len(head):]
            kit = (f'IF(OR(AND(INDEX(REC_KIT,{n})="SEM KIT MOTOR",ISNUMBER(MATCH($AR$6,KMD_DESC,0))),'
                   f'AND(INDEX(REC_KIT,{n})="SEM KIT BOMBA",ISNUMBER(MATCH($AR$7,KB_DESC,0)))),0,')
            set_formula(it, f"AF{r}", head + kit + rest + ")")
        # 3: linhas além da 30ª — custo (AP) e importado (AQ)
        set_formula(it, f"AP{r}", f'IF(AND(ISNUMBER($AG{r}),$AG{r}>30),IFERROR($AK{r}*$AL{r},0),0)', style_from=f"AO{r}")
        set_formula(it, f"AQ{r}", f'IF(AND(ISNUMBER($AG{r}),$AG{r}>30),IFERROR($AK{r}*$AN{r},0),0)', style_from=f"AO{r}")
    set_formula(it, "AP67", '"CUSTO ALÉM DA 30ª"', text=True, style_from="AO67")
    set_formula(it, "AQ67", '"IMPORTADO ALÉM DA 30ª"', text=True, style_from="AO67")
    sub_formula(it, "H64", "SUM(H34:H63)", "SUM(H34:H63)+SUM($AP$68:$AP$127)")
    sub_formula(it, "J64", "SUM(J34:J63)", "SUM(J34:J63)+SUM($AP$68:$AP$127)*$P$23")
    sub_formula(it, "H115", 'SUMIF($AB$34:$AB$112,"NAC",H34:H112)',
                'SUMIF($AB$34:$AB$112,"NAC",H34:H112)+SUM($AP$68:$AP$127)-SUMIF($AM$68:$AM$127,"IMP",$AP$68:$AP$127)')
    sub_formula(it, "H116", 'SUMIF($AB$34:$AB$112,"IMP",H34:H112)',
                'SUMIF($AB$34:$AB$112,"IMP",H34:H112)+SUMIF($AM$68:$AM$127,"IMP",$AP$68:$AP$127)')
    sub_formula(it, "H166", 'SUM(H121:H165)+', 'SUM(H121:H165)+SUM($AQ$68:$AQ$127)+')
    # 3 + 5 + 2: avisos no cabeçalho da montagem
    extra = ('&IF(MAX($AG$68:$AG$127)>30,"     ·     "&(MAX($AG$68:$AG$127)-30)&" LINHA(S) ALÉM DA 30ª NÃO APARECEM NA LISTA — o custo e o importado delas já estão no subtotal","")'
             '&IF(COUNTIF($L$34:$L$63,"item fora do catálogo*")>0,"     ·     "&COUNTIF($L$34:$L$63,"item fora do catálogo*")&" ITEM(NS) SEM PREÇO NO CADASTRO (custo zero) — veja a coluna L","")')
    tail = '&IF($AR$14=1,"     ·     use o −'
    f = get_formula(it, "B32")
    if f and tail in f and "ALÉM DA 30ª" not in f:
        f = f.replace('IF(AND($AR$16>0,$AR$6=""),', 'IF(AND($AR$16>0,$AR$6="",OR($C$19<>"",$AR$1<>"")),')
        f = f.replace('IF(AND($AR$17>0,$AR$19=""),', 'IF(AND($AR$17>0,$AR$19="",OR($I$19<>"",$AR$1<>"")),')
        set_formula(it, "B32", f.replace(tail, extra + tail, 1), text=True)
    # 2: situação do item mostra motor não encontrado / linhas sem preço
    f = get_formula(it, "P84")
    if f and "NÃO ENCONTRADO" not in f:
        set_formula(it, "P84",
            'IF(AND($AR$16>0,$AR$6="",OR($C$19<>"",$AR$1<>"")),"MOTOR DIESEL NÃO ENCONTRADO — conjunto diesel fora do preço",'
            'IF(AND($AR$17>0,$AR$19="",OR($I$19<>"",$AR$1<>"")),"MOTOR ELÉTRICO NÃO ENCONTRADO — conjunto elétrico fora do preço",'
            'IF(COUNTIF($L$34:$L$63,"item fora do catálogo*")>0,"ITEM SEM PREÇO NA MONTAGEM — confira a coluna L",' + f + ')))', text=True)
    # 10: aviso "kit sem preço do motor" só para motor diesel que é kit e está sem o preço do motor
    for r in range(34, 64):
        sub_formula(it, f"L{r}", 'IF(AND($AR$3="DIESEL",INDEX(REC_TIPO,$AE%d)="MOTOR",IFERROR(' % r,
                    'IF(AND(INDEX(REC_ACION,$AE%d)="DIESEL",INDEX(REC_TIPO,$AE%d)="MOTOR",ISNUMBER(MATCH($AR$6,KMD_DESC,0)),IFERROR(' % (r, r), required=(k == 1 and r == 34))
    # 7: limites de código/descrição
    f = get_formula(it, "C31")
    if f and "ACIMA DO LIMITE" not in f:
        set_formula(it, "C31", f + '&IF(LEN($C$27)>60,"   ·   ⚠ CÓDIGO ACIMA DO LIMITE","")&IF(LEN($C$28)>120,"   ·   ⚠ DESCRIÇÃO BREVE ACIMA DO LIMITE","")', text=True)

# 11: lista de insumos do escopo (D68:D112) lê a família da coluna C da própria linha.
# O nome ESCOPO_INSUMOS usava INDIRECT("RC[-1]"), que o Excel não resolve na validação.
# Família em branco = lista o cadastro inteiro; item fora do cadastro pede confirmação (custo zero).
DV_INS = ('OFFSET(CADASTRO!$D$2,IFERROR(MATCH($C68,CADASTRO!$C$2:$C$1000,0)-1,0),0,'
          'IF(COUNTIF(CADASTRO!$C$2:$C$1000,$C68)=0,COUNTA(CADASTRO!$D$2:$D$1000),COUNTIF(CADASTRO!$C$2:$C$1000,$C68)),1)')
DV_NEW = ('<dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorStyle="warning" '
          'errorTitle="Insumo fora do cadastro" error="Este insumo não está no CADASTRO para a família escolhida: entra com custo zero. Continuar?" '
          'promptTitle="Insumo" prompt="Escolha a família na coluna C; a lista mostra só os insumos dela." sqref="D68:D112">'
          f'<formula1>{esc(DV_INS)}</formula1></dataValidation>')
for k in range(1, 11):
    p = load(f"ITEM {k:02d}")
    xml[p], n = re.subn(r'<dataValidation [^>]*sqref="D68:D112"[^>]*>.*?</dataValidation>', DV_NEW, xml[p], flags=re.S)
    if n != 1:
        print(f"  aviso: validação de insumos não encontrada em ITEM {k:02d}")

files["xl/workbook.xml"] = wb.encode()
for p, s in xml.items():
    files[p] = s.encode()
with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
    for n in zin.namelist():
        z.writestr(n, files[n])
print("fórmulas alteradas:", count["f"], "· células novas:", count["new"])
