# Fonte do manual do LS Pricer

Cada capítulo é um arquivo `capNN.js` (NN = 01..18) que exporta um objeto. O gerador (`tools/gerar.js`) monta o DOCX e o PDF a partir desses arquivos; `tools/capturar.js` produz as telas reais.

Regra de ouro: **nada inventado**. Todo botão, campo, tela e passo citado precisa existir no app (`pricer/*.js`, `pricer/index.html`, gerado em `pricer/dist/ls-pricer.html`). O que não puder ser confirmado por captura ou pela leitura do código vai num bloco `{ t: 'nv', x: '...' }` (aparece como "Não validado").

## Estrutura do capítulo

```js
module.exports = {
  n: 3, titulo: 'Criação de proposta', slug: 'proposta',
  inicio: async (p, h) => { await h.exemplo(); },   // opcional: roda uma vez antes das capturas (por viewport)
  css: '',                                           // opcional: CSS extra só para as capturas
  capturas: [ /* ver abaixo */ ],
  conteudo: [ /* blocos, ver abaixo */ ],
  glossario: [['Termo', 'Definição']],               // opcional; entra no glossário geral
};
```

## Capturas

```js
{ id: '03-02',                 // NN-ordem; único no manual
  nome: 'proposta-dados-gerais', // vira o nome do arquivo: prints/{original,anotado}/03-02-proposta-dados-gerais.png
  titulo: 'Aba Dados gerais',  // legenda da figura
  vp: 'desktop',               // 'desktop' (1440×900, padrão) ou 'celular' (390×844)
  alto: 1200,                  // opcional: altura da janela
  novo: true,                  // opcional: começa numa janela nova (sem o estado das capturas anteriores)
  prep: async (p, h) => {},    // passos ANTES da foto (acumulam: a captura seguinte parte do estado desta)
  clip: '#app section.card',   // opcional: recorta em volta deste elemento (rola até ele); clipNth para o n-ésimo
  pad: 10,                     // folga do recorte
  marcas: [ { sel: '#bSave', txt: 'O que é este elemento / o que fazer', pos: 'l' } ], // pos: l r t b tl tr bl br (opcional)
  depois: async (p, h) => {},  // opcional: passos depois da foto (ex.: fechar janela)
  toast: true,                 // opcional: deixa aparecer os avisos (por padrão ficam ocultos)
}
```

`p` é a página do Playwright. `h` tem: `exemplo()` (Nova → Exemplo SEQ Cocamar), `salvar()`, `nav('inicio'|'proposta'|'pendencias'|'documentos'|'margens'|'cadastro'|'config'|'guia')`, `aba(1..6 | 'memorial' | 'phist')`, `cad('insumos'|...)`, `clicar(sel)`, `preencher(sel, valor)`, `esc()`, `esperar(ms)`, `abrirDetalhes()`, `topo()`, `menu()` (celular).

Cada marcador vira um número laranja com seta na imagem anotada e uma linha na legenda da figura. Use de 2 a 8 marcadores por figura; prefira recortes (clip) que mostrem só a área explicada.

Rodar: `FONTES_CACHE=<pasta com fonts.css e map.txt> node docs/manual/tools/capturar.js 3 4` (só os capítulos 3 e 4). Resultado em `prints/capturas-capNN.json` (ok ou FALHA com o motivo) e nas pastas `prints/original` e `prints/anotado`.

## Blocos de conteúdo

| Bloco | Uso |
|---|---|
| `{ t: 'p', x }` | parágrafo. `**negrito**` permitido |
| `{ t: 'h', x }` | subtítulo dentro do capítulo |
| `{ t: 'fig', id }` | figura anotada com legenda numerada |
| `{ t: 'lista', itens: [] }` | marcadores |
| `{ t: 'tab', cab: [], lin: [[]] }` | tabela |
| `{ t: 'aviso', x }` | Atenção (risco de erro ou perda) |
| `{ t: 'dica', x }` | Dica |
| `{ t: 'nota', x }` | Observação neutra |
| `{ t: 'nv', x }` | Não validado: o que não foi possível confirmar |
| `{ t: 'tut', titulo, objetivo, quem, pre: [], passos: [ 'texto' \| { x, fig } ], resultado, atencao, dica }` | tutorial no modelo padrão. `quem` deve dizer o papel (Leitor, Contribuidor, Editor, dono/administrador) e lembrar que no modo local não há controle de acesso |

Linguagem: português do Brasil, frases curtas, imperativo nos passos ("Clique em **Salvar**"), nomes dos botões exatamente como aparecem na tela, em negrito.
