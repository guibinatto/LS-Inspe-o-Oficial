# Proposta de serviço no modelo novo e versão interativa (HTML)

Data: 11/11/2026. Origem: análise da proposta de serviço PTC 10.339 (WEG Tintas, troca do radiador, 11 páginas) do ponto de vista de um comprador de multinacional, e da ideia de mandar a proposta como link em HTML. O usuário pediu as duas coisas.

## 1. Proposta de serviço (SPV)

### O que estava errado no PDF
- Texto de produto numa proposta de serviço: "Fabricação: N dias (DAPC)", "Entrega: dias" sem número e a nota sobre DTC e "Aviso de Pronto para Expedição".
- Caixas de "Notas", "Desvios" e "Exclusões" saíam vazias.
- Faltava o que a área de segurança e o fiscal do cliente pedem para liberar o serviço.
- Termos e condições ocupavam 6 das 11 páginas, numa proposta de R$ 5,2 mil.

### O que mudou

**Textos de serviço:**
- O prazo sai como "Início dos serviços: N dias após o pedido de compra".
- Com peças, sai "Entrega das peças: N dias após o pedido de compra".
- Numa proposta de serviço não aparece mais "fabricação".
- A nota de pagamento com DTC e APE não sai em SPV.

**Caixas vazias não saem.** Notas, desvios ou exclusões sem conteúdo não aparecem. Isso vale também para a SEQ.

**Nova seção "Execução do serviço".** Fica em SPV → Para o documento da proposta, recolhida. Só sai no PDF o que for marcado ou escrito:

| Bloco | Como preenche |
|---|---|
| Início dos serviços, equipe, duração no local, horário | campos de texto |
| Segurança e acesso ao local | marcar: NR-10, NR-12, NR-33, NR-35, ASO, integração de segurança, APR e permissão de trabalho, documentação antes da mobilização; mais outros, um por linha |
| Sistema de incêndio fora de operação | marcar se o serviço deixa o sistema parado; informar o que fica parado e por quanto tempo. Sai o aviso para o cliente seguir o procedimento de sistema fora de operação da NFPA 25 (seguradora, brigada, proteção alternativa) |
| Responsabilidades do cliente | marcar: acesso, energia e água, área isolada, acompanhante, local para ferramentas; mais outras |
| Entregáveis | marcar: relatório com fotos, registro do teste de funcionamento, ART, checklist NFPA 25; mais outros |
| Garantia do serviço | texto livre (o app não sugere prazo) |
| Dados fiscais | item da LC 116, código NBS, município do ISS, ISS retido sim/não |
| Propostas relacionadas | texto livre. Ex.: "Radiador fornecido conforme a PTC 10.342 (cobrado à parte)" |

As opções marcadas saem no idioma do PDF (português, inglês ou espanhol).

**Termos e condições em anexo.** Opção "Termos e condições em anexo (PDF à parte)". Com ela marcada:
- no lugar das páginas de termos, a proposta traz uma frase que cita o anexo pelo nome do arquivo;
- ao gerar, sai também o PDF "TERMOS_…", com o texto completo;
- os dois ficam guardados nos documentos da proposta.

O texto dos termos não mudou.

**Layouts já salvos.** No Modelo da proposta, a seção nova entra logo depois de "Condições", também nos layouts salvos antes.

## 2. Versão interativa (HTML)

Botão **Versão interativa (HTML)** em Documentos, ao lado de "Gerar proposta". Ele gera o PDF oficial e o guarda nos documentos da proposta, como sempre. O único download é o arquivo `.html`, que já leva o PDF dentro:

- **É um arquivo só.** Imagens, fontes e o próprio PDF oficial vão dentro dele. Abre sem internet, no computador ou no celular, e não chama nenhum endereço de fora: sem rastreamento e sem fontes externas.
- **Conteúdo:**
  - capa em tela cheia (cliente, obra, número, revisão, data, validade);
  - resumo (investimento total, prazo, validade, pagamento);
  - "Conheça a LS Fire";
  - cada item com o que está incluso, especificações, curva e desenhos (clique para ampliar);
  - condições, incluindo a execução do serviço na SPV;
  - notas e exclusões em blocos que abrem e fecham;
  - contatos com link de telefone e e-mail.
- **Animação leve:**
  - barra de progresso;
  - menu que acompanha a rolagem;
  - blocos que aparecem ao rolar;
  - total que "conta" até o valor.

  Quem configurou o sistema para reduzir movimento vê tudo parado.
- **O PDF é o documento oficial.**
  - O botão "PDF oficial" baixa o mesmo PDF que foi gerado. O teste confere byte a byte.
  - O rodapé diz que, em caso de divergência, vale o PDF, e mostra o SHA-256 do PDF para conferência.
- **Tamanho:** cerca de 1,5 MB a 3 MB, conforme imagens e curvas.

### Como enviar
O app gera o arquivo; ele não hospeda a página. Para o cliente abrir por link, o arquivo precisa ser publicado num endereço da LS Fire, como o site. Também pode ir como anexo do e-mail. O link do app no claude.ai é privado e pede login, então não serve para o cliente.

Recomendação de uso: em propostas grandes (SEQ), mandar o PDF como documento formal e a versão interativa como apresentação. Em serviço pequeno, só o PDF.

## 3. Correção depois do primeiro uso no celular

No app publicado, ao clicar em "Versão interativa", só saía o PDF.

**Causa:** o "salvar arquivo" do claude.ai fica com o conteúdo que recebe. Depois do primeiro download, os bytes do PDF ficavam vazios para o app, e a montagem do HTML com o PDF dentro falhava. O mesmo esvaziamento já existia antes, ao guardar nos documentos o PDF que acabava de ser baixado.

**Correção:**
- O app passa ao "salvar arquivo" uma cópia do conteúdo, e o original continua disponível.
- Se a plataforma pedir para esperar, porque já há uma janela de salvar aberta, o app tenta de novo, até 3 vezes.
- A versão interativa pede um download só, o HTML, em vez de dois. No celular isso é uma confirmação a menos.

O teste agora simula esse comportamento do claude.ai.

## 4. Testes

| Verificação | Resultado |
|---|---|
| `servico_html_test` (novo, 28 verificações) | todas passaram, incluindo uma simulação do "salvar arquivo" do claude.ai |
| Suíte de proposta e jornada (24 testes) | todas passaram |
| Cálculo | nada de cálculo mudou. Motor, SPV/FACTS e financeiro pela tela repetidos depois da mudança |

Não houve teste em aparelho físico.
