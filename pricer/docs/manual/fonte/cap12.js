// Capítulo 12 — Fornecedores e documentos
// As capturas usam arquivos gerados na hora (XML de NF-e fictícia e PDFs da proposta de exemplo), sem gravar nada em disco.
// A conferência do PDF precisa do pdf.js 3.11.174. Sem internet, o app não o baixa: coloque a biblioteca numa das pastas
// abaixo (as mesmas dos testes, ver tools/testes/LEIA-ME.md). Sem ela, as capturas 12-06 e 12-07 saem como FALHA.
const path = require('path'), fs = require('fs');
const LIBS = [process.env.PRICER_LIBS, path.resolve(__dirname, '../../../tools/testes/libs'), process.env.FONTES_CACHE && path.resolve(process.env.FONTES_CACHE, '../libs')]
  .filter(Boolean).find((d) => fs.existsSync(path.join(d, 'pdfjs-dist-3.11.174/build/pdf.min.js')));

// NF-e fictícia (só os campos que o leitor do app usa); fornecedor e itens inventados para o treino
const NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe><ide><nNF>4821</nNF><dhEmi>2026-10-20T10:00:00-03:00</dhEmi></ide>
<emit><xNome>FORNECEDOR EXEMPLO VALVULAS LTDA</xNome></emit>
<det nItem="1"><prod><cProd>VA-6</cProd><xProd>VALVULA DE ALIVIO 6 POL FLANGEADA</xProd><NCM>84814000</NCM><uCom>UN</uCom><qCom>2.0000</qCom><vUnCom>1850.00</vUnCom></prod>
<imposto><ICMS><ICMS00><pICMS>12.00</pICMS></ICMS00></ICMS><IPI><IPITrib><pIPI>3.25</pIPI></IPITrib></IPI></imposto></det>
<det nItem="2"><prod><cProd>MAN-100</cProd><xProd>MANOMETRO DN 100 0-16 BAR GLICERINADO</xProd><NCM>90262010</NCM><uCom>UN</uCom><qCom>4.0000</qCom><vUnCom>95.50</vUnCom></prod>
<imposto><ICMS><ICMS00><pICMS>12.00</pICMS></ICMS00></ICMS><IPI><IPITrib><pIPI>0</pIPI></IPITrib></IPI></imposto></det>
<total><ICMSTot><vFrete>120.00</vFrete><vNF>4316.25</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;

// PDF da proposta comercial montado com os valores da própria formação (como em tools/testes/conf_test.js)
async function pdfProposta(p, erro) {
  const itens = [];
  for (const i of [0, 1, 2]) {
    await p.click('#nav [data-view="proposta"]'); await p.waitForTimeout(200); await p.click('.ptab[data-step="2"]'); await p.waitForTimeout(200);
    await p.click(`[data-goitem="${i}"]`); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelectorAll('#app details').forEach((d) => { d.open = true; }));
    const t = await p.$$eval('.txtv', (x) => x.map((e) => e.innerText)); itens.push({ d: t[0], ponto: t[2] });
  }
  await p.click('#nav [data-view="proposta"]'); await p.waitForTimeout(200); await p.click('.ptab[data-step="4"]'); await p.waitForTimeout(400);
  const precos = await p.$$eval('#app table.t tbody tr', (x) => x.filter((r) => r.querySelector('[data-goitem]')).map((r) => [...r.querySelectorAll('td')].map((td) => td.innerText)));
  const total = await p.$eval('#app table.t tbody tr.tot td.n', (x) => x.innerText);
  const html = `<html><body style="font-family:Arial;font-size:11px"><h2>LS FIRE — PROPOSTA COMERCIAL Nº 10.102 / 10.116 — REVISÃO 3</h2>
    <p>Cliente: COCAMAR COOPERATIVA AGROINDUSTRIAL — SEDE</p><p>Norma: NFPA 20. Frete: FOB — por conta do cliente.</p>
    <table border=1>${itens.map((it, i) => `<tr><td>${i + 1}</td><td>${erro && i === 1 ? it.d.replace(/\d+HP /, '') : it.d}<br>${it.ponto}</td><td>${precos[i][2]}</td><td>${erro && i === 1 ? 'R$ 415.000,00' : precos[i][4]}</td></tr>`).join('')}</table>
    <p>VALOR TOTAL: ${total}</p><p>Condição de pagamento: 30% ENTRADA + 30% NA ENTREGA DOS DESENHOS TÉCNICOS + 20% NO EMBARQUE + 20% 28DDL</p></body></html>`;
  const pg = await p.context().newPage(); await pg.setContent(html); const buf = await pg.pdf(); await pg.close();
  return { name: erro ? 'proposta-10102-rev3-errada.pdf' : 'proposta-10102-rev3.pdf', mimeType: 'application/pdf', buffer: buf };
}

module.exports = {
  n: 12, titulo: 'Fornecedores e documentos', slug: 'documentos',
  inicio: async (p, h) => {
    if (LIBS) await p.route('https://cdnjs.cloudflare.com/**', (r) => { const u = r.request().url(); const f = u.endsWith('pdf.min.js') ? 'pdf.min.js' : u.endsWith('pdf.worker.min.js') ? 'pdf.worker.min.js' : null; return f ? r.fulfill({ path: path.join(LIBS, 'pdfjs-dist-3.11.174/build', f), contentType: 'text/javascript' }) : r.fallback(); });
    await h.exemplo(); await h.salvar();
  },
  capturas: [
    { id: '12-01', nome: 'documentos-biblioteca', titulo: 'Menu Documentos: área para soltar o arquivo, busca e filtro por tipo', clip: '#app > .stack', pad: 8,
      prep: async (p, h) => { await h.nav('documentos'); await h.topo(); },
      marcas: [
        { sel: '#docDrop', txt: 'Solte aqui o arquivo (PDF, XML da NF-e, Excel ou foto) ou clique para escolher.', pos: 't' },
        { sel: '#docQ', txt: 'Busca por fornecedor, peça, número, proposta ou observação.', pos: 'b' },
        { sel: '#docT', txt: 'Filtro por tipo de documento.', pos: 'b' },
        { sel: '#app .sheetbar .sub', txt: 'Quantos documentos aparecem com a busca e o filtro, do total.', pos: 'r' },
      ] },
    { id: '12-02', nome: 'documentos-novo', titulo: 'Novo documento lido de um XML de NF-e, ligado à proposta, à revisão, ao item e à etapa', clip: '.modal .card', pad: 6, alto: 1100,
      prep: async (p, h) => {
        await p.setInputFiles('#docUp', { name: 'nfe-4821.xml', mimeType: 'text/xml', buffer: Buffer.from(NFE) }); await h.esperar(1200);
        await p.selectOption('#mdProp', { index: 1 }); await h.preencher('#mdRev', '3');
        await p.selectOption('#mdItem', 'ITEM 01'); await p.selectOption('#mdEtapa', 'Custos'); await h.esperar(200);
      },
      marcas: [
        { sel: '#mdStatus', txt: 'O que o app leu do arquivo. Confira antes de salvar.', pos: 'l' },
        { sel: '#mdTipo', txt: 'Tipo: orçamento de fornecedor, nota fiscal, pedido de compra, contrato, desenho/data sheet, proposta enviada ou outro.', pos: 'l' },
        { sel: '#mdForn', txt: 'Fornecedor/emitente, lido do documento ou digitado.', pos: 'r' },
        { sel: '#mdProp', txt: 'Proposta a que o documento pertence.', pos: 'r' },
        { sel: '#mdRev', txt: 'Revisão da proposta.', pos: 'l' },
        { sel: '#mdItem', txt: 'Item da proposta (ou a proposta toda).', pos: 'b' },
        { sel: '#mdEtapa', txt: 'Etapa da proposta a que o documento se refere.', pos: 'r' },
        { sel: '#mdSave', txt: 'Salvar documento.', pos: 'l' },
      ],
      depois: async (p, h) => { await h.clicar('#mdSave', 800); } },
    { id: '12-03', nome: 'documentos-lista', titulo: 'Documento salvo na lista, com a ligação à proposta', clip: '#app table.t', pad: 8,
      prep: async (p, h) => { await h.nav('documentos'); },
      marcas: [
        { sel: '#app table.t tbody tr td:nth-child(1)', txt: 'Arquivo, número, data e quantos itens foram lidos.', pos: 'l' },
        { sel: '#app table.t tbody tr td:nth-child(5)', txt: 'Ligado a: proposta, revisão, item e etapa.', pos: 't' },
        { sel: '#app [data-dopen]', txt: 'Abrir o arquivo numa aba nova.', pos: 't' },
        { sel: '#app [data-ddown]', txt: 'Baixar o arquivo.', pos: 'b' },
        { sel: '#app [data-dedit]', txt: 'Detalhes: mudar os dados, a ligação ou excluir.', pos: 't' },
      ] },
    { id: '12-04', nome: 'documentos-ficha-insumo-fornecedores', titulo: 'Ficha do insumo: seção Fornecedores e cotações', clip: '.modal details.fsec', pad: 8,
      prep: async (p, h) => {
        await h.nav('cadastro'); await h.cad('insumos'); await h.clicar('#app tr.click[data-ins]', 700);
        await p.evaluate(() => { const d = document.querySelector('.modal details.fsec'); if (d) d.open = true; });
        await h.clicar('#foAdd', 300); await h.preencher('[data-fo="0|nome"]', 'FORNECEDOR EXEMPLO VALVULAS LTDA'); await h.preencher('[data-fo="0|preco"]', '1.850,00');
        await h.preencher('[data-fo="0|impostos"]', '3,25'); await h.preencher('[data-fo="0|frete"]', '60'); await h.preencher('[data-fo="0|prazo"]', '20'); await h.preencher('[data-fo="0|validade"]', '2026-12-31');
        await h.clicar('#foAdd', 300); await h.preencher('[data-fo="1|nome"]', 'OUTRO FORNECEDOR EXEMPLO'); await p.selectOption('[data-fo="1|moeda"]', 'USD'); await h.esperar(300);
        await h.preencher('[data-fo="1|preco"]', '320'); await h.preencher('[data-fo="1|cambio"]', '5,40'); await h.preencher('[data-fo="1|prazo"]', '60');
        // a tabela é mais larga que a janela: rola até a coluna Custo total
        await p.evaluate(() => { const t = document.querySelector('.modal #fForn .tw'); if (t) t.scrollLeft = t.scrollWidth; const d = document.querySelector('.modal details.fsec'); if (d) d.scrollIntoView(); });
      },
      marcas: [
        { sel: '.modal [data-fo="1|cambio"]', txt: 'Em moeda estrangeira, informe o câmbio: sem ele o custo total não sai.', pos: 'r' },
        { sel: '.modal table.forn tbody tr:nth-child(1) td.n', txt: 'Custo total por unidade = preço × câmbio × (1 + impostos) + frete.', pos: 't' },
        { sel: '.modal table.forn .pill.ok', txt: 'O menor custo total recebe o selo "menor total" (o app não escolhe sozinho).', pos: 'b' },
        { sel: '.modal [data-fouse="0"]', txt: 'usar este preço: leva a cotação para o preço de aquisição do insumo.', pos: 't' },
        { sel: '.modal #foAdd', txt: '+ Fornecedor: mais uma cotação para o mesmo insumo.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('.modal #fSave', 900); if (await p.$('.modal #fSave')) { await h.esc(); } } },
    { id: '12-05', nome: 'documentos-fornecedores', titulo: 'Cadastros → Custos → Fornecedores e fabricantes', clip: '#app > .stack > .stack', pad: 8,
      prep: async (p, h) => { await h.nav('cadastro'); await h.cad('insumos'); await h.cad('fornecedores'); await h.topo(); },
      marcas: [
        { sel: '#app .stack .stack section.card:nth-child(1) table.t thead th:nth-child(2)', txt: 'Itens cotados: quantos insumos têm cotação deste fornecedor na ficha.', pos: 't' },
        { sel: '#app .stack .stack section.card:nth-child(1) table.t thead th:nth-child(5)', txt: 'Documentos anexados com este fornecedor.', pos: 't' },
        { sel: '#app .stack .stack section.card:nth-child(2) h2', txt: 'Fabricantes: vêm do campo Fabricante dos insumos.', pos: 'l' },
      ] },
    { id: '12-06', nome: 'documentos-conferencia-divergencias', titulo: 'Conferência do PDF com divergências', clip: '#confCard', pad: 8, alto: 1000,
      prep: async (p, h) => {
        const f = await pdfProposta(p, true);
        await p.click('#nav [data-view="proposta"]'); await h.esperar(200); await h.aba(5);
        await p.setInputFiles('#confUp', f); await h.esperar(3500);
      },
      marcas: [
        { sel: '#confCard .drop', txt: 'Solte aqui o PDF da proposta comercial (a leitura é feita no navegador).', pos: 'r' },
        { sel: '#confCard .banner.bad', txt: 'Quantos pontos corrigir e quantos conferir.', pos: 'r' },
        { sel: '#confCard tr.cf-erro', txt: 'Cada divergência: o que é, o valor na formação e o que foi achado no PDF.', pos: 'l' },
        { sel: '#confCard [data-conftudo]', txt: 'Mostrar também o que conferiu.', pos: 'b' },
        { sel: '#confCard [data-confaceita]', txt: 'Aceitar as divergências com justificativa e salvar o PDF.', pos: 'r' },
      ] },
    { id: '12-07', nome: 'documentos-conferencia-ok', titulo: 'PDF que confere: proposta marcada como conferida e PDF salvo', clip: '#confCard', pad: 8,
      prep: async (p, h) => {
        const f = await pdfProposta(p, false);
        await p.click('#nav [data-view="proposta"]'); await h.esperar(200); await h.aba(5);
        await p.setInputFiles('#confUp', f); await h.esperar(3500);
        await p.evaluate(() => { const c = document.getElementById('confCard'); if (c) c.scrollIntoView(); });
      },
      marcas: [
        { sel: '#confCard .pill.ok', txt: 'Situação: conferida, com a data.', pos: 't' },
        { sel: '#confCard .banner.ok', txt: 'Tudo confere com a formação; o PDF foi salvo nos documentos da proposta.', pos: 'r' },
      ] },
    { id: '12-08', nome: 'documentos-aba-proposta', titulo: 'Aba Documentos da proposta: documentos ligados e o PDF conferido', clip: '#app section.card', clipNth: 1, pad: 8,
      prep: async (p, h) => { await p.click('#nav [data-view="proposta"]'); await h.esperar(200); await h.aba(6); },
      marcas: [
        { sel: '#app [data-doc="memorial"]', txt: 'Gera o Memorial (PDF) e a FCI (PDF ou Excel) desta proposta.', pos: 't' },
        { sel: '#app section.card:nth-of-type(2) tbody tr:nth-child(1) td:nth-child(1)', txt: 'Cada documento ligado: tipo, número, fornecedor, revisão, item e etapa.', pos: 'l' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'Este capítulo mostra onde ficam os documentos da proposta (orçamentos de fornecedores, notas fiscais, pedidos de compra, contratos, desenhos e a própria proposta enviada), como ligá-los à proposta certa, onde ficam as cotações de cada fornecedor e como conferir o PDF da proposta comercial antes de enviá-lo ao cliente.' },
    { t: 'tab', cab: ['Onde', 'O que fica lá'], lin: [
      ['Menu **Documentos**', 'Biblioteca com todos os documentos, de todas as propostas. É onde se anexa um arquivo e se liga a uma proposta, revisão, item e etapa.'],
      ['Proposta → aba **Documentos**', 'Os documentos ligados àquela proposta (inclusive o PDF conferido) e os botões Memorial (PDF), FCI (PDF) e FCI (Excel).'],
      ['Proposta → aba **Conferência** → Conferência do PDF da proposta', 'Confere o PDF comercial com a formação. Se confere, o PDF é salvo nos documentos da proposta.'],
      ['**Cadastros** → Custos → **Fornecedores e fabricantes**', 'Lista de fornecedores montada a partir das cotações dos insumos e dos documentos. Não é um cadastro à parte: não há tela para criar fornecedor.'],
      ['**Cadastros** → Custos → Insumos e preços → ficha do insumo', 'Seção **Fornecedores e cotações** (uma linha por cotação) e **Documentos deste insumo**.'],
    ] },
    { t: 'aviso', x: 'No modo local, documentos e arquivos ficam só neste navegador e os arquivos anexados **não entram no backup** (só os dados do documento). No modo compartilhado eles ficam no banco da equipe e anexar exige acesso de Editor; quem não tem vê o aviso "Para anexar arquivos é preciso acesso de Editor ao app. Você ainda pode consultar os documentos."' },

    { t: 'h', x: 'A biblioteca de documentos' },
    { t: 'p', x: 'O menu **Documentos** reúne tudo o que foi anexado. A busca procura no nome do arquivo, fornecedor, número, proposta, observações, itens do cadastro ligados e na descrição e código dos itens lidos do documento.' },
    { t: 'fig', id: '12-01' },
    { t: 'p', x: 'Ao soltar um arquivo, o app tenta ler sozinho fornecedor, número, data, valores e itens: o XML da NF-e é lido de forma exata; PDF com texto, Excel/CSV e foto (reconhecimento de texto) também são lidos no próprio navegador. A janela **Novo documento** abre já preenchida com o que foi lido, para você conferir e completar.' },
    { t: 'nv', x: 'Leitura de PDF, Excel e foto: nas capturas deste manual só foi exercitado o XML de NF-e (sem internet). A leitura de PDF, planilha e foto depende de bibliotecas baixadas na hora (pdf.js, ExcelJS, tesseract.js), e a leitura "com Claude" só existe no modo compartilhado quando a leitura local não acha itens. Quando nada é lido, a janela mostra "Não consegui ler esse arquivo. Preencha os dados à mão (XML da NF-e é o formato mais seguro)."' },

    { t: 'tut', titulo: 'Anexar um orçamento ou nota e ligar à proposta', objetivo: 'Guardar o documento do fornecedor junto da proposta, da revisão, do item e da etapa a que ele se refere.',
      quem: 'No modo compartilhado, quem tem acesso de Editor (o upload de arquivo exige Editor). No modo local não há controle de acesso: qualquer pessoa com o arquivo do app faz tudo.',
      pre: ['A proposta já salva (para aparecer na lista **Proposta**).', 'O arquivo do fornecedor: XML da NF-e, PDF, Excel/CSV ou foto, até 20 MB.'],
      passos: [
        'No menu lateral, clique em **Documentos**.',
        'Solte o arquivo na área **Solte aqui um orçamento, nota ou contrato** ou clique nela para escolher.',
        { x: 'Na janela **Novo documento**, confira o que foi lido (linha de situação no topo, por exemplo "Lido: 2 item(ns). Confira antes de salvar.") e corrija **Tipo**, **Fornecedor / emitente**, **Número**, **Data**, **Moeda** e **Total** se preciso.', fig: '12-02' },
        'Em **Proposta**, escolha a proposta. A proposta aberta aparece como "Atual: …".',
        'Preencha **Revisão da proposta**, **Item** (ou deixe "proposta toda") e **Etapa** (Identificação, Configuração, Custos, Formação, Conferência e aprovação, Emissão, Pedido do cliente, Execução ou Pós-venda).',
        'Se quiser, em **Itens do cadastro ligados**, busque e escolha os insumos a que o documento se refere. O app sugere insumos parecidos com os itens lidos ("Sugeridos pelos itens do documento").',
        'Clique em **Salvar documento**.',
        { x: 'Confira o documento na lista: a coluna **Ligado a** mostra proposta, revisão, item e etapa.', fig: '12-03' },
      ],
      resultado: 'O aviso "Documento salvo" aparece e o documento entra na lista. Ele também aparece na aba Documentos da proposta e no histórico (tipo "Documento anexado").',
      atencao: 'Excluir um documento (botão **Detalhes** → **Excluir** → **Confirmar exclusão**) apaga o registro; no modo local o arquivo some deste navegador. Não há lixeira de documentos.',
      dica: 'O XML da NF-e é o formato mais seguro: fornecedor, número, data, total e itens (código, descrição, quantidade, unitário e IPI) vêm exatos.' },

    { t: 'tut', titulo: 'Encontrar um documento', objetivo: 'Achar um orçamento ou nota já anexado.', quem: 'Qualquer pessoa com acesso ao app (no modo compartilhado, inclusive Leitor). No modo local não há controle de acesso.', pre: ['Documentos já anexados.'],
      passos: [
        'Abra **Documentos** no menu lateral.',
        'Digite em **Buscar por fornecedor, peça, número…** parte do nome do fornecedor, do número, da proposta ou da descrição de um item.',
        'Se quiser, escolha um tipo em **Todos os tipos**.',
        'Na linha do documento, clique em **Abrir** (abre numa aba nova), **Baixar** ou **Detalhes**.',
      ],
      resultado: 'A lista mostra só os documentos que batem com a busca e o filtro; o contador indica "N de M".', dica: 'A busca da tela **Início** também procura nos documentos (fornecedor, número e descrição dos itens).' },

    { t: 'h', x: 'Fornecedores e cotações' },
    { t: 'p', x: 'O app não tem um cadastro de fornecedores separado. Cada cotação é registrada na ficha do insumo, na seção **Fornecedores e cotações**, com fornecedor, preço, moeda, câmbio, impostos %, frete, prazo (dias), validade, pagamento e quantidade mínima. O app calcula o **Custo total** de cada cotação na mesma base e marca o menor, mas não escolhe sozinho: "compare também prazo, validade, pagamento e conformidade".' },
    { t: 'fig', id: '12-04' },
    { t: 'p', x: 'A tela **Fornecedores e fabricantes** junta, por nome, os fornecedores que aparecem nas cotações dos insumos e nos documentos anexados, com a quantidade de itens cotados, cotações vencidas, prazo médio e documentos.' },
    { t: 'fig', id: '12-05' },
    { t: 'tut', titulo: 'Registrar a cotação de um fornecedor na ficha do insumo', objetivo: 'Comparar fornecedores de um mesmo insumo e levar a cotação escolhida para o preço de aquisição.',
      quem: 'No modo compartilhado, quem tem acesso de Editor; quando as áreas têm responsáveis definidos (Configurações → Responsáveis, e-mails e logo), só o responsável por **Custos** e o dono do app. Os demais veem a ficha só para consulta. No modo local não há controle de acesso.',
      pre: ['O insumo já cadastrado.'],
      passos: [
        'Abra **Cadastros** → **Custos** → **Insumos e preços** e clique na linha do insumo.',
        'Abra a seção **Fornecedores e cotações** e clique em **+ Fornecedor**.',
        'Preencha **Fornecedor**, **Preço**, **Moeda** e, se não for BRL, **Câmbio**; depois **Impostos %**, **Frete**, **Prazo (dias)**, **Validade**, **Pagamento** e **Qtd. mín.**',
        'Repita para cada fornecedor. Confira a coluna **Custo total** e o selo "menor total". Cotação com validade passada mostra "vencida".',
        'Para levar uma cotação ao preço do insumo, clique em **usar este preço** na linha dela: o app preenche **Valor (R$)**, **Origem do preço** e **Data da cotação**.',
        'Clique em **Salvar**.',
      ],
      resultado: 'A ficha é salva (aviso "Salvo: <código>") e o fornecedor passa a aparecer em **Fornecedores e fabricantes**, com os itens cotados.',
      atencao: 'Mudar o preço do insumo vale para todos os rascunhos que o usam. A ficha mostra o impacto antes de salvar ("Mudança de preço: …"); propostas enviadas, aprovadas e ganhas guardam o preço da época.',
      dica: 'Na mesma ficha, em **Documentos deste insumo**, o botão **📎 Anexar orçamento, nota ou ficha** anexa o documento já ligado àquele insumo.' },

    { t: 'h', x: 'Conferência do PDF da proposta' },
    { t: 'p', x: 'Antes de enviar a proposta comercial ao cliente, confira o PDF dela com a formação. O app lê o PDF no navegador e confere o cabeçalho (cliente, número, revisão, condição de pagamento, frete e norma), o total, o preço de cada item, a quantidade, as especificações técnicas (potência, rotação, vazão, pressão, modelo, norma), a descrição do equipamento e o escopo. O escopo só gera aviso, porque o PDF comercial costuma descrevê-lo com outras palavras.' },
    { t: 'fig', id: '12-06' },
    { t: 'fig', id: '12-07' },
    { t: 'tut', titulo: 'Conferir o PDF da proposta comercial', objetivo: 'Garantir que o PDF que vai ao cliente bate com a formação e guardá-lo nos documentos da proposta.',
      quem: 'Quem monta a proposta (no modo compartilhado, Contribuidor ou acima para gravar a conferência; para salvar o PDF como documento, Editor). No modo local não há controle de acesso.',
      pre: ['Proposta salva, sem alterações pendentes (com alterações não salvas o app avisa "Há alterações não salvas: salve antes de conferir para valer a versão certa").', 'O PDF da proposta comercial com texto (PDF escaneado passa por reconhecimento de texto, mais lento).'],
      passos: [
        'Abra a proposta e clique na aba **Conferência**. Na tela **Início**, o botão **Conferir PDF** da linha da proposta leva direto ao quadro.',
        'No quadro **Conferência do PDF da proposta**, solte o PDF em **Solte aqui o PDF da proposta comercial** ou clique para escolher.',
        { x: 'Se houver divergência, o quadro mostra "N ponto(s) a corrigir" e a tabela **O que / Na formação / No PDF**. Corrija o PDF (ou a proposta) e solte de novo o PDF corrigido.', fig: '12-06' },
        'Se as divergências estiverem certas (por exemplo, preço por conjunto, escopo escrito de outro jeito), clique em **As divergências estão certas: aceitar e salvar o PDF**, escreva o motivo em **Por que está certo assim?** e clique em **Aceitar e salvar o PDF**.',
        { x: 'Quando tudo confere, o app mostra "Tudo confere com a formação." e salva o PDF sozinho.', fig: '12-07' },
        { x: 'Abra a aba **Documentos** da proposta para ver o PDF salvo.', fig: '12-08' },
      ],
      resultado: 'A situação fica "conferida ✓ <data>" (ou "· com ressalva", quando aceita com justificativa); o PDF entra nos documentos da proposta com a revisão e a etapa "Conferência e aprovação"; a etapa **PDF conferido** da tela Início fica marcada e o histórico registra "Proposta — conferida".',
      atencao: 'Se a proposta mudar depois da conferência, o quadro passa a mostrar "conferência desatualizada: a proposta mudou depois" e a conferência central aponta "Conferência do PDF desatualizada: a proposta mudou". Confira de novo antes de enviar.',
      dica: 'Por padrão o quadro mostra só o que precisa de atenção. Use **ver tudo o que foi conferido** para ver também os pontos que bateram.' },
    { t: 'nv', x: 'Nas capturas, o pdf.js foi servido de uma cópia local (o ambiente de captura não tem internet). Em uso normal o app baixa o pdf.js do cdnjs na primeira conferência; sem internet aparece "Não consegui ler o PDF: …". A leitura de PDF escaneado (reconhecimento de texto) não foi exercitada.' },

    { t: 'h', x: 'Aba Documentos da proposta' },
    { t: 'p', x: 'Na proposta SEQ, a aba **Documentos** mostra a situação e o próximo passo, os botões **Memorial (PDF)**, **FCI (PDF)**, **FCI (Excel)** e **Ver todas as colunas**, a lista de documentos ligados (com tipo, número, fornecedor, revisão, item, etapa e data) e o quadro **Revisões**. Nesta aba não há botão de anexar: anexe pelo menu **Documentos** e escolha a proposta. Na proposta SPV, o quadro **Documentos desta proposta** tem o botão **+ Anexar documento**.' },
    { t: 'fig', id: '12-08' },
    { t: 'nota', x: 'Na lista da aba Documentos da proposta o tipo aparece pelo código interno (por exemplo "nota", "proposta"), e não pelo nome usado no menu Documentos ("Nota fiscal", "Proposta enviada").' },
  ],
  glossario: [
    ['Documento', 'Arquivo anexado (orçamento, nota, pedido, contrato, desenho, proposta enviada) com os dados lidos e a ligação a proposta, revisão, item, etapa e insumos.'],
    ['Cotação', 'Linha da seção Fornecedores e cotações da ficha do insumo: fornecedor, preço, moeda, câmbio, impostos, frete, prazo, validade, pagamento e quantidade mínima.'],
    ['Conferência do PDF', 'Leitura do PDF da proposta comercial e comparação com a formação: cabeçalho, valores, especificações e escopo.'],
  ],
};
