// Capítulo 21 — Proposta SEQ do zero, tela a tela (um print a cada passo)
// Um fluxo só, numa janela nova: vendedor cadastrado → Nova → Dados gerais → item (família, modelo, compor, conferir, incluir)
// → Custos → Formação → Negociar → Salvar → Conferência → dados do documento → PDF → enviar ao cliente → baixa.
const cp = require('child_process'), os = require('os'), path = require('path'), fs = require('fs');
const PDF = path.join(os.tmpdir(), 'manual-cap21-proposta.pdf');
const sel = (p, id, i) => p.evaluate(([id, i]) => { const e = document.getElementById(id); e.selectedIndex = i; e.dispatchEvent(new Event('change', { bubbles: true })); }, [id, i]);
const semTopo = async (p) => { p.__st = await p.addStyleTag({ content: 'header.top{visibility:hidden!important}' }); };
const comTopo = async (p) => { if (p.__st) { await p.__st.evaluate((e) => e.remove()); p.__st = null; } };
// mostra páginas do PDF gerado por cima do app (só para a foto)
async function mostraPdf(p, pags) {
  const imgs = pags.map((n) => { const out = path.join(os.tmpdir(), 'manual-cap21-pag' + n); cp.execFileSync('pdftoppm', ['-r', '70', '-png', '-singlefile', '-f', String(n), '-l', String(n), PDF, out]); return 'data:image/png;base64,' + fs.readFileSync(out + '.png').toString('base64'); });
  await p.evaluate((imgs) => { const d = document.createElement('div'); d.id = 'pdfPrev'; d.style.cssText = 'position:fixed;inset:0;background:#3a3a3a;z-index:9999;display:flex;gap:28px;align-items:center;justify-content:center;padding:24px';
    imgs.forEach((s) => { const i = document.createElement('img'); i.src = s; i.style.cssText = 'height:92vh;box-shadow:0 4px 24px rgba(0,0,0,.5);background:#fff'; d.appendChild(i); }); document.body.appendChild(d); }, imgs);
  await p.waitForTimeout(600);
}
// página do PDF que tem o texto (ex.: a planilha de preços), para mostrar a página certa mesmo se a ordem das seções mudar
function paginaCom(re) { const n = +((cp.execFileSync('pdfinfo', [PDF]).toString().match(/Pages:\s+(\d+)/) || [])[1] || 1);
  for (let i = 1; i <= n; i++) { const t = cp.execFileSync('pdftotext', ['-f', String(i), '-l', String(i), PDF, '-'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); if (re.test(t)) return i; } return Math.min(3, n); }
const tiraPdf = (p) => p.evaluate(() => { const d = document.getElementById('pdfPrev'); if (d) d.remove(); });

module.exports = {
  n: 21, titulo: 'Proposta SEQ do zero, tela a tela', slug: 'seq-do-zero', libs: true,
  capturas: [
    // ---- antes de começar: vendedor cadastrado ----
    { id: '21-01', nome: 'zero-vendedor', titulo: 'Cadastros → Precificação: incluir o vendedor (uma vez só)', novo: true,
      prep: async (p, h) => { await h.nav('cadastro'); await h.cad('preco'); await p.fill('#vNome', 'VENDEDOR EXEMPLO'); await h.topo(); },
      clip: '#app section.card:has(#vNome)', pad: 8,
      marcas: [
        { sel: '#vNome', txt: 'Nome do vendedor.', pos: 'b' },
        { sel: '#app section.card:has(#vNome) .seg', txt: 'Papel: Vendedor ou Agente de negócio (AN).', pos: 'b' },
        { sel: '#vAdd', txt: 'Incluir. Feito uma vez, vale para todas as propostas.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.clicar('#vAdd', 600); } },
    // ---- começar ----
    { id: '21-02', nome: 'zero-inicio', titulo: 'Tela Início: por onde começar',
      prep: async (p, h) => { await h.nav('inicio'); await h.topo(); },
      clip: '.starts', pad: 8,
      marcas: [
        { sel: '.start.seq [data-seqfam="CONJUNTO MOTOBOMBA"]', txt: 'Atalho: já começa a proposta pela família do equipamento.', pos: 'b' },
        { sel: '#bNew', txt: 'Nova: proposta em branco, SPV, exemplo ou importar uma antiga.', pos: 'bl' },
      ] },
    { id: '21-03', nome: 'zero-nova', titulo: 'Botão Nova: escolha SEQ em branco',
      prep: async (p, h) => { await h.clicar('#bNew', 500); },
      clip: '.modal .card', pad: 6,
      marcas: [
        { sel: '#mBlank', txt: 'SEQ em branco: proposta de equipamento do zero.', pos: 'b' },
        { sel: '#mSpv', txt: 'SPV: serviço, peças ou contrato (capítulo 22).', pos: 'b' },
        { sel: '#mExample', txt: 'Exemplo pronto para treinar.', pos: 'b' },
        { sel: '#mImport', txt: 'Importar uma proposta feita na planilha antiga (capítulo 19).', pos: 'b' },
      ],
      depois: async (p, h) => { await h.clicar('#mBlank', 900); } },
    // ---- Dados gerais ----
    { id: '21-04', nome: 'zero-cliente', titulo: 'Dados gerais → cartão Cliente preenchido',
      prep: async (p, h) => { await h.topo(); await h.preencher('#cnpjIn', '12.345.678/0001-95'); await h.preencher('#c_PROPOSTA_F5', 'CLIENTE TREINAMENTO LTDA'); await h.preencher('#c_PROPOSTA_F6', 'Fábrica 1 — Joinville');
        await p.selectOption('#c_PROPOSTA_F7', 'SC'); await h.esperar(300); await sel(p, 'c_PROPOSTA_J5', 1); await h.esperar(300); await sel(p, 'c_PROPOSTA_F8', 4); await h.esperar(400); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: '#app section.card', pad: 8,
      marcas: [
        { sel: '#cnpjIn', txt: 'CNPJ ou CPF. Com internet, Buscar na Receita preenche razão social, UF e cadastro fiscal.', pos: 'b' },
        { sel: '#c_PROPOSTA_F5', txt: 'Cliente (razão social). Cliente já usado: o app recupera CNPJ, UF e cadastro fiscal.', pos: 'b' },
        { sel: '#c_PROPOSTA_F6', txt: 'Obra / local.', pos: 'b' },
        { sel: '#c_PROPOSTA_F7', txt: 'UF de destino: muda o ICMS.', pos: 'b' },
        { sel: '#c_PROPOSTA_J5', txt: 'Cadastro fiscal: contribuinte ou consumidor final (muda ICMS e DIFAL).', pos: 'b' },
        { sel: '#c_PROPOSTA_F8', txt: 'Segmento.', pos: 'b' },
      ] },
    { id: '21-05', nome: 'zero-proposta', titulo: 'Dados gerais → cartão Proposta preenchido',
      prep: async (p, h) => { await h.preencher('#c_PROPOSTA_C5', '10.500'); await h.clicar('[data-valdias="30"]', 500); await sel(p, 'c_PROPOSTA_J6', 1); await h.esperar(300);
        await h.clicar('#app label:has(> input[name="c_PROPOSTA_F9"][value="NFPA20"])', 400); },
      clip: '#app section.card', clipNth: 1, pad: 8,
      marcas: [
        { sel: '#c_PROPOSTA_C5', txt: 'Número da proposta.', pos: 'b' },
        { sel: '#c_PROPOSTA_C7', txt: 'Revisão 0 e data de hoje já vêm preenchidas.', pos: 'b' },
        { sel: '[data-valdias="30"]', txt: 'Validade em um clique: 15, 30 ou 60 dias.', pos: 't' },
        { sel: '#c_PROPOSTA_J6', txt: 'Condição de pagamento: mexe no preço.', pos: 'b' },
        { sel: '#app label:has(> input[name="c_PROPOSTA_F9"][value="NFPA20"])', txt: 'Norma.', pos: 'b' },
      ] },
    { id: '21-06', nome: 'zero-vendedor-frete', titulo: 'Dados gerais → Vendedor e comissões e Frete',
      prep: async (p, h) => { await sel(p, 'c_PROPOSTA_B13', 1); await h.esperar(400); },
      clip: ['#app section.card:has([data-pcom])', '#app section.card:has(#c_PROPOSTA_B13)'], pad: 8,
      marcas: [
        { sel: '#app label:has(> [data-ppcell="C8"])', txt: 'Vendedor: com um só cadastrado, já vem marcado.', pos: 'r' },
        { sel: '#app label:has(> [data-pcom="J8"])', txt: 'Marque Agente de negócio (AN) só se houver.', pos: 'r' },
        { sel: '#c_PROPOSTA_B13', txt: 'Frete: FOB ou CIF (com CIF, informe a distância).', pos: 'b' },
      ] },
    { id: '21-07', nome: 'zero-proximo', titulo: 'Fim de Dados gerais: Próximo',
      prep: async (p) => { await p.evaluate(() => document.querySelector('.flowbar').scrollIntoView({ block: 'center' })); },
      clip: '.flowbar', pad: 8,
      marcas: [{ sel: '[data-cabnext]', txt: 'Próximo: só segue com o cabeçalho completo; se faltar algo, os campos ficam em destaque.', pos: 't' }],
      depois: async (p, h) => { await h.clicar('[data-cabnext]', 900); } },
    // ---- item ----
    { id: '21-08', nome: 'zero-itens-vazio', titulo: 'Aba Itens, ainda sem equipamento',
      prep: async (p, h) => { await h.topo(); },
      clip: '#app .icards', pad: 8,
      marcas: [{ sel: '[data-additem]', txt: '+ Adicionar item: modelo pronto ou montagem própria.', pos: 'r' }] },
    { id: '21-09', nome: 'zero-familia', titulo: 'Item novo: escolher a família',
      prep: async (p, h) => { await h.clicar('[data-additem]', 900); await h.topo(); },
      clip: '#app .famgrid', pad: 8,
      marcas: [{ sel: '.famgrid [data-fam="CONJUNTO MOTOBOMBA"]', txt: 'Família do equipamento (aqui, conjunto motobomba).', pos: 'b' }] },
    { id: '21-10', nome: 'zero-modelo', titulo: 'Escolher o modelo pronto (pesquisa "1000")',
      prep: async (p, h) => { await h.clicar('.famgrid [data-fam="CONJUNTO MOTOBOMBA"]', 900); await p.fill('#app [data-cfgq]', '1000'); await h.esperar(700); },
      clip: ['#app section.card:has([data-cfgmodo])', '#app section.card:has(.cfgmods)'], pad: 8,
      marcas: [
        { sel: '#app .stepper', txt: 'Quantidade.', pos: 'l' },
        { sel: '#app [data-cfgq]', txt: 'Pesquise por vazão, bomba, motor ou arranjo.', pos: 'r' },
        { sel: '#app label.chip:has([data-cfgac="DIESEL"])', txt: 'Filtro por acionamento.', pos: 'r' },
        { sel: '#app [data-usemodel="CMB DIESEL 1000 USgpm — 1 BOMBA"]', txt: 'Usar este: o item se monta sozinho.', pos: 'l' },
      ] },
    { id: '21-11', nome: 'zero-modelo-aplicado', titulo: 'Modelo aplicado: características do equipamento',
      prep: async (p, h) => { await h.clicar('#app [data-usemodel="CMB DIESEL 1000 USgpm — 1 BOMBA"]', 1600); },
      clip: '#app section.card:has(.pill[title="Origem do valor"])', pad: 8,
      marcas: [
        { sel: '#app section.card:has(.pill[title="Origem do valor"]) tr:nth-child(2) td:nth-child(2)', txt: 'Modelo pronto em uso.', pos: 'r' },
        { sel: '#app section.card:has(.pill[title="Origem do valor"]) tr:nth-child(5) .pill', txt: 'De onde veio cada valor (modelo, escolhido, calculado).', pos: 'r' },
      ] },
    { id: '21-12', nome: 'zero-compor', titulo: 'Etapa Compor: os componentes que a estrutura montou',
      prep: async (p, h) => { await h.clicar('#app .cfgsteps [data-cfget="2"]', 900); await h.topo(); },
      clip: '#app .cfggrid section.card', pad: 8, alto: 1500,
      marcas: [
        { sel: '#app .cfglegenda', txt: 'Obrigatório, condicional, opcional, incluído pelo fornecedor, adicionado na proposta.', pos: 'r' },
        { sel: '#app .cfgcomp tr.grp', txt: 'Grupos com subtotal e % do item.', pos: 'l' },
        { sel: '#app .cfgcomp tbody tr:nth-child(2) [data-cfgsel]', txt: 'Por quê?: mostra a regra que trouxe o componente.', pos: 'l' },
      ] },
    { id: '21-13', nome: 'zero-conferir-item', titulo: 'Etapa Conferir: preço, custo e verificações do item',
      prep: async (p, h) => { await h.clicar('#app .cfgsteps [data-cfget="3"]', 900); await h.topo(); },
      clip: ['#app .cfg > .stack > section.card:first-child', '#app section.card:has(.cfgalerts)'], pad: 8, alto: 1700,
      marcas: [
        { sel: '#app .cfg .codebox', txt: 'Código e descrição gerados.', pos: 'r' },
        { sel: '#app .cfg .kpis .kpi.lead', txt: 'Preço unitário calculado.', pos: 't' },
        { sel: '#app .cfgalerts', txt: 'Verificações: impeditivo, atenção, informativo. "Seguir assim" pede justificativa.', pos: 'l' },
      ] },
    { id: '21-14', nome: 'zero-incluir', titulo: 'Confirmar e Incluir na proposta',
      prep: async (p, h) => { for (const k of ['tec', 'custo', 'escopo']) await p.check(`input[data-cfgconf="${k}"]`).catch(() => {}); await h.clicar('#app [data-cfgincluir]', 2500); await p.evaluate(() => { const el = document.querySelector('#app .cfgincl'); if (el) el.scrollIntoView({ block: 'center' }); }); },
      clip: '#app .cfgincl', pad: 8,
      marcas: [
        { sel: '#app [data-cfgincluir]', txt: 'Incluir na proposta (depois das confirmações de técnica, custo e escopo).', pos: 'r' },
        { sel: '#app .cfgincl .banner', txt: 'Incluído: a proposta foi gravada com o item.', pos: 'b' },
      ] },
    { id: '21-15', nome: 'zero-itens', titulo: 'Aba Itens com o equipamento incluído',
      prep: async (p, h) => { await h.aba(2); await h.topo(); },
      clip: '#app .icards', pad: 8,
      marcas: [
        { sel: '#app .icard:first-child .itotal', txt: 'Total do item com IPI.', pos: 'r' },
        { sel: '#app .icard:first-child .ifacts', txt: 'Quantidade, margem e origem.', pos: 'r' },
        { sel: '#app .icard:first-child footer [data-goitem]', txt: 'Abrir para ajustar (ou clique no título).', pos: 'b' },
      ] },
    // ---- custos e formação ----
    { id: '21-16', nome: 'zero-custos', titulo: 'Aba Custos: origem e validade de cada custo',
      prep: async (p, h) => { await h.aba(3); await h.topo(); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: '#app section.card:has([data-custofiltro])', pad: 8, alto: 1400,
      marcas: [
        { sel: '#app section.card:has([data-custofiltro]) .kpi:nth-child(1)', txt: 'Custo total do item.', pos: 't' },
        { sel: '#app section.card:has([data-custofiltro]) .kpi:nth-child(2)', txt: 'Impeditivos: componente sem preço.', pos: 't' },
        { sel: '[data-custofiltro="todos"]', txt: 'Ver só o que pede atenção ou todas as linhas.', pos: 'r' },
      ] },
    { id: '21-17', nome: 'zero-formacao', titulo: 'Aba Formação de preço: indicadores e preço por item',
      prep: async (p, h) => { await h.aba(4); await h.topo(); await semTopo(p); },
      depois: async (p) => { await comTopo(p); },
      clip: ['#app .stack > .kpis', '#app section.card:has(> h2 + .tw)'], pad: 8,
      marcas: [
        { sel: '#app .stack > .kpis .kpi.lead', txt: 'Preço total com IPI.', pos: 't' },
        { sel: '#app .stack > .kpis .kpi:nth-child(3)', txt: 'Margem líquida e o mínimo da política.', pos: 't' },
      ] },
    { id: '21-18', nome: 'zero-negociar-5', titulo: 'Negociar: o cliente pediu 5% — a margem fica abaixo do mínimo',
      prep: async (p, h) => { await h.clicar('[data-smq="desc|0.05"]', 2800); },
      clip: '#simMgCard', pad: 8,
      marcas: [
        { sel: '[data-smq="desc|0.05"]', txt: 'Atalho 5%: simula sem mudar a proposta.', pos: 'b' },
        { sel: '#smRes table', txt: 'Margem simulada abaixo de 30%.', pos: 'l' },
        { sel: '#smRes div.banner', txt: 'O app avisa que precisa de aprovação.', pos: 'l' },
      ] },
    { id: '21-19', nome: 'zero-negociar-min', titulo: 'Negociar: a margem mínima mostra o desconto possível',
      prep: async (p, h) => { await h.clicar('[data-smq^="margem|"]', 2800); },
      clip: '#simMgCard', pad: 8,
      marcas: [
        { sel: '[data-smq^="margem|"]', txt: 'Margem mínima (30%): o app acha o maior desconto dentro da política.', pos: 'b' },
        { sel: '#smRes table', txt: 'Desconto global, preço ao cliente e margem de 30,00%.', pos: 'l' },
        { sel: '[data-smaplica]', txt: 'Aplicar à proposta.', pos: 'r' },
      ] },
    { id: '21-20', nome: 'zero-aplicado', titulo: 'Desconto aplicado: o resumo do topo mostra o novo valor',
      prep: async (p, h) => { await h.clicar('[data-smaplica]', 1200); await h.topo(); },
      clip: '.ctxh', pad: 8,
      marcas: [
        { sel: '.ctx-kpis .k:nth-child(1)', txt: 'Valor total já com o desconto.', pos: 'b' },
        { sel: '.ctx-kpis .kneg', txt: 'Margem dentro do mínimo. Clique aqui para negociar de novo.', pos: 'b' },
        { sel: '#saveSt', txt: 'Alterações não salvas: falta salvar.', pos: 'b' },
      ] },
    { id: '21-21', nome: 'zero-salvar', titulo: 'Salvar',
      prep: async (p, h) => { await h.salvar(); await h.esperar(600); },
      clip: 'header.top', pad: 4,
      marcas: [
        { sel: '#bSave', txt: 'Salvar (ou Ctrl+S).', pos: 'b' },
        { sel: '#saveSt', txt: '"Salvo às …": gravado.', pos: 'b' },
      ] },
    // ---- conferência e documento ----
    { id: '21-22', nome: 'zero-conferencia', titulo: 'Aba Conferência: o que falta antes de enviar',
      prep: async (p, h) => { await h.aba(5); await h.topo(); },
      clip: '#confCentral', pad: 8,
      marcas: [
        { sel: '#confCentral .kpi:nth-child(1)', txt: 'Impede seguir: precisa ser zero.', pos: 't' },
        { sel: '#confCentral .kpi:nth-child(2)', txt: 'Pede tratamento ou justificativa.', pos: 't' },
        { sel: '#confCentral [data-confgo]', txt: 'Ir: abre o lugar da correção.', pos: 'r' },
      ] },
    { id: '21-23', nome: 'zero-para-documento', titulo: 'Dados gerais → Para o documento da proposta (contato, cidade e prazos)',
      prep: async (p, h) => { await h.aba(1); await h.preencher('#pcf_aosCuidados', 'Eng. Maria Souza'); await h.preencher('#pcf_cidade', 'JOINVILLE-SC'); await h.preencher('#pcf_prazoFab', '60'); await h.preencher('#pcf_prazoEnt', '10');
        await p.evaluate(() => { const c = document.querySelector('#pcf_aosCuidados').closest('section.card'); c.scrollIntoView({ block: 'start' }); }); },
      clip: 'section.card:has(#pcf_aosCuidados) > .fields', pad: 8,
      marcas: [
        { sel: '#pcf_aosCuidados', txt: 'Aos cuidados de: sai na capa e na planilha de preços.', pos: 'b' },
        { sel: '#pcf_cidade', txt: 'Cidade da obra.', pos: 'b' },
        { sel: '#pcf_altitude', txt: 'Altitude e temperatura: corrigem a potência do diesel (NFPA 20).', pos: 'b' },
        { sel: '#pcf_prazoFab', txt: 'Prazos de fabricação e de entrega: viram "Prazo Total".', pos: 'b' },
      ],
      depois: async (p, h) => { await h.salvar(); } },
    { id: '21-24', nome: 'zero-documentos', titulo: 'Aba Documentos: escolher e gerar a proposta',
      prep: async (p, h) => { await h.aba(6); await h.topo(); },
      clip: ['#app section.card:has(.mgsteps), #app .stack > section.card:first-child', '#pcCard .docbar:has([data-pchtml])'], pad: 8,
      marcas: [
        { sel: '#pcCard .pcopts', txt: 'Padrão, documento (técnica e comercial, comercial ou técnica), idioma e moeda.', pos: 't' },
        { sel: '#pcCard [data-pcgerar]', txt: 'Gerar a proposta em PDF.', pos: 'b' },
        { sel: '#pcCard [data-pchtml]', txt: 'Ou a versão interativa (HTML), com o PDF dentro.', pos: 'b' },
      ] },
    { id: '21-25', nome: 'zero-pdf', titulo: 'O PDF gerado: capa e planilha de preços',
      prep: async (p, h) => { const dl = p.waitForEvent('download', { timeout: 180000 }); await p.click('[data-pcgerar]'); const d = await dl; await d.saveAs(PDF); await h.esperar(4000); await mostraPdf(p, [1, paginaCom(/PLANILHA DE PREÇOS/)]); },
      marcas: [
        { sel: '#pdfPrev img:nth-child(1)', txt: 'Capa: cliente, obra, número, revisão e validade, vindos de Dados gerais.', pos: 'b' },
        { sel: '#pdfPrev img:nth-child(2)', txt: 'Planilha de preços e condições: os valores da formação, com o desconto aplicado.', pos: 'b' },
      ],
      depois: async (p) => { await tiraPdf(p); } },
    { id: '21-26', nome: 'zero-situacao', titulo: 'Situação e próximo passo: PDF conferido, pronto para enviar',
      prep: async (p, h) => { await h.topo(); },
      clip: '#app .stack > section.card:first-child', pad: 8,
      marcas: [
        { sel: '#app .stack > section.card:first-child [data-hnext]', txt: 'Próximo passo: Enviar ao cliente.', pos: 'r' },
      ] },
    { id: '21-27', nome: 'zero-enviada', titulo: 'Marcada como enviada ao cliente; o próximo passo é dar baixa',
      prep: async (p, h) => { await h.clicar('[data-hnext]', 1200); await h.topo(); },
      clip: '#app .stack > section.card:first-child', pad: 8,
      marcas: [
        { sel: '#app .stack > section.card:first-child [data-hnext]', txt: 'Dar baixa: quando o cliente fechar (ganha) ou recusar (perdida).', pos: 'r' },
      ] },
    { id: '21-28', nome: 'zero-baixa', titulo: 'Dar baixa: proposta fechada (ganha)',
      prep: async (p, h) => { await h.clicar('[data-hnext]', 1200); await p.fill('#fcPed', 'OC 4500123456'); },
      clip: '.modal .card', pad: 6,
      marcas: [
        { sel: '.modal .kpis, .modal .kv', txt: 'Venda, custo e margem congelados no fechamento.', pos: 'l' },
        { sel: '#fcPed', txt: 'Pedido / OC do cliente.', pos: 'l' },
        { sel: '#fcVal', txt: 'Valor fechado sem IPI.', pos: 'l' },
        { sel: '#fcOk', txt: 'Dar baixa. Depois, Compras e Produção lançam o custo real.', pos: 'r' },
      ],
      depois: async (p, h) => { await h.esc(); } },
    { id: '21-29', nome: 'zero-inicio-lista', titulo: 'Tela Início: a proposta na lista, com a situação e as etapas',
      prep: async (p, h) => { await h.nav('inicio'); await h.topo(); },
      clip: '.home table.t', pad: 8,
      marcas: [
        { sel: '.home table.t tbody tr:first-child td:nth-child(2)', txt: 'Número e cliente.', pos: 'b' },
        { sel: '.home table.t tbody tr:first-child td:nth-child(4)', txt: 'Situação: enviada ao cliente.', pos: 'b' },
        { sel: '.home table.t tbody tr:first-child [data-hnext]', txt: 'Próxima etapa direto da lista.', pos: 'b' },
      ] },
  ],
  conteudo: [
    { t: 'p', x: 'Este capítulo faz uma proposta SEQ **do começo ao fim**, com uma tela para cada passo: cliente, equipamento, custos, negociação, conferência, PDF, envio e baixa. Os valores são de treino (cliente fictício, cadastro padrão). Os detalhes de cada tela estão nos capítulos 3 a 5 e 20.' },
    { t: 'tut', titulo: 'Antes de começar: cadastrar o vendedor', objetivo: 'Ter o vendedor na lista do cabeçalho da proposta.', quem: 'Quem cuida de Precificação (no modo local, qualquer pessoa).', pre: ['Feito uma vez só.'], passos: [
      { x: 'Abra **Cadastros** → **Precificação**. No cartão **Vendedores e agentes de negócio**, digite o nome, escolha o papel e clique em **Incluir**.', fig: '21-01' },
    ], resultado: 'O nome aparece na lista e passa a ser oferecido em todas as propostas.' },
    { t: 'tut', titulo: 'Passo 1 — Começar a proposta', objetivo: 'Abrir uma proposta SEQ em branco.', quem: 'Vendedor (Contribuidor, Editor ou dono). No modo local não há controle de acesso.', pre: ['Vendedor cadastrado.'], passos: [
      { x: 'Na tela **Início**, use um botão de família ou clique em **Nova**.', fig: '21-02' },
      { x: 'Na janela, clique em **SEQ em branco**.', fig: '21-03' },
    ], resultado: 'Abre a aba **Dados gerais** da proposta nova. Se você já fez outra proposta, pagamento, norma, frete e validade vêm repetidos dela (confira).' },
    { t: 'tut', titulo: 'Passo 2 — Dados gerais (cabeçalho)', objetivo: 'Completar o cabeçalho, que libera as outras abas.', quem: 'Vendedor.', pre: ['Proposta aberta em Dados gerais.'], passos: [
      { x: 'No cartão **Cliente**, preencha CNPJ, cliente, obra, UF, cadastro fiscal e segmento.', fig: '21-04' },
      { x: 'No cartão **Proposta**, informe o número, clique em **30 dias** na validade, escolha a condição de pagamento e a norma.', fig: '21-05' },
      { x: 'Confira o vendedor e escolha a modalidade de **Frete**.', fig: '21-06' },
      { x: 'Clique em **Próximo: configuração →**.', fig: '21-07' },
    ], resultado: 'A aba Dados gerais fica com ✓ e abre a aba Itens.', atencao: 'UF, cadastro fiscal e condição de pagamento mudam o preço. Confira antes de seguir.' },
    { t: 'tut', titulo: 'Passo 3 — Configurar o equipamento', objetivo: 'Colocar o conjunto motobomba na proposta.', quem: 'Vendedor.', pre: ['Cabeçalho completo.'], passos: [
      { x: 'Na aba **Itens**, clique em **+ Adicionar item**.', fig: '21-08' },
      { x: 'Escolha a família **Conjunto motobomba**.', fig: '21-09' },
      { x: 'Pesquise "1000" e clique em **Usar este** no modelo CMB DIESEL 1000 USgpm — 1 BOMBA.', fig: '21-10' },
      { x: 'Confira as características do equipamento e a origem de cada valor.', fig: '21-11' },
      { x: 'Clique na etapa **Compor** e confira os componentes.', fig: '21-12' },
      { x: 'Clique na etapa **Conferir**: preço, custo e verificações.', fig: '21-13' },
      { x: 'Marque as confirmações e clique em **Incluir na proposta**.', fig: '21-14' },
      { x: 'Volte à aba **Itens**: o equipamento está na proposta.', fig: '21-15' },
    ], resultado: 'Item 01 na proposta, com preço, margem e a proposta gravada.', dica: 'Para um segundo item, **+ Adicionar item** de novo, ou **Duplicar** no cartão do item.' },
    { t: 'tut', titulo: 'Passo 4 — Custos e formação do preço', objetivo: 'Conferir os custos e o preço antes de negociar.', quem: 'Vendedor.', pre: ['Item incluído.'], passos: [
      { x: 'Abra a aba **Custos**: veja impeditivos e avisos de cada linha.', fig: '21-16' },
      { x: 'Abra a aba **Formação de preço**: preço total, margem e o preço por item.', fig: '21-17' },
    ], resultado: 'Você sabe o preço e a margem antes de falar com o cliente.' },
    { t: 'tut', titulo: 'Passo 5 — Negociar e salvar', objetivo: 'Dar o desconto possível sem sair da política.', quem: 'Vendedor.', pre: ['Formação aberta.'], passos: [
      { x: 'O cliente pediu 5%: clique em **5%** no cartão **Negociar** e veja que a margem fica abaixo do mínimo.', fig: '21-18' },
      { x: 'Clique em **Margem mínima (30%)**: o app mostra o maior desconto dentro da política.', fig: '21-19' },
      { x: 'Clique em **Aplicar à proposta**. O resumo do topo mostra o novo valor.', fig: '21-20' },
      { x: 'Clique em **Salvar**.', fig: '21-21' },
    ], resultado: 'Desconto aplicado, margem em 30% e proposta gravada.', atencao: 'Se o cliente exigir os 5%, aplique e peça aprovação na aba Conferência (capítulo 13).' },
    { t: 'tut', titulo: 'Passo 6 — Conferir e completar o documento', objetivo: 'Zerar o que impede e preencher o que vai no PDF.', quem: 'Vendedor.', pre: ['Proposta salva.'], passos: [
      { x: 'Abra a aba **Conferência** e trate cada linha com **Ir**.', fig: '21-22' },
      { x: 'Em **Dados gerais** → **Para o documento da proposta**, informe aos cuidados de, cidade e os prazos. Salve.', fig: '21-23' },
    ], resultado: 'Nada impede seguir; a aba Documentos não mostra mais "Falta preencher".' },
    { t: 'tut', titulo: 'Passo 7 — Gerar o PDF', objetivo: 'Gerar a proposta técnica e comercial.', quem: 'Vendedor.', pre: ['Proposta salva e conferida.'], passos: [
      { x: 'Na aba **Documentos**, escolha padrão, documento, idioma e moeda e clique em **Gerar proposta técnica e comercial (PDF)**.', fig: '21-24' },
      { x: 'Abra o PDF e confira capa, planilha de preços e condições.', fig: '21-25' },
    ], resultado: 'O PDF é baixado, conferido com a formação e guardado nos documentos da proposta. A etapa **Finalizada** fica com ✓.', dica: 'Para apresentar, gere também a **Versão interativa (HTML)** (capítulo 20).' },
    { t: 'tut', titulo: 'Passo 8 — Enviar ao cliente e dar baixa', objetivo: 'Registrar o envio e, depois, o fechamento.', quem: 'Vendedor; a baixa pode exigir papel da Diretoria no modo compartilhado.', pre: ['PDF gerado.'], passos: [
      { x: 'Em **Situação e próximo passo**, clique em **Enviar ao cliente** depois de mandar o PDF.', fig: '21-26' },
      { x: 'A etapa passa para **Enviada ao cliente**; o próximo passo é **Dar baixa**.', fig: '21-27' },
      { x: 'Quando o cliente fechar, clique em **Dar baixa**, informe a OC e o valor fechado e confirme.', fig: '21-28' },
      { x: 'Na tela **Início**, a proposta aparece com a situação e a próxima etapa.', fig: '21-29' },
    ], resultado: 'Proposta ganha: a formação fica congelada para o custo real e o registro de margens (capítulo 14).', atencao: 'Ao enviar, a versão enviada fica guardada. Alterar depois pede uma nova revisão (capítulo 15).' },
  ],
};
