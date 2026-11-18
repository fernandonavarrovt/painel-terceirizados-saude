# Painel dos terceirizados da saúde | ODSS/UFERSA

Painel do **Observatório dos Direitos Sociais do Semiárido (ODSS)**, projeto de pesquisa e extensão da UFERSA, com o perfil dos trabalhadores terceirizados da saúde pública municipal no Oeste Potiguar.

Primeiro município: **Mossoró/RN**. Fonte: processo SEI 06.000984/2026-35, resposta da Prefeitura a pedido feito pela Lei de Acesso à Informação, e Contrato nº 13/2025.

## Como funciona

É um site simples (HTML, CSS e JavaScript), sem servidor. Os gráficos leem os arquivos CSV da pasta `dados/`.

| Pasta ou arquivo | O que é |
|---|---|
| `index.html` | a página |
| `assets/` | estilo, código dos gráficos e logos |
| `dados/` | os dados, em CSV (separador `;`) e uma planilha Excel |

## Como atualizar os dados

1. Troque ou edite os arquivos da pasta `dados/` (pode ser pelo próprio site do GitHub).
2. Salve (commit). O Netlify publica a nova versão sozinho em cerca de um minuto.

Para incluir outro município, acrescente linhas nos CSVs com o nome dele na coluna `municipio` (e uma linha em `municipios.csv`). O seletor de município aparece sozinho.

## Mapa das unidades

- As colunas `lat`, `lon` e `precisao` de `dados/unidades.csv` dizem onde cada unidade aparece no mapa. As posições foram calculadas a partir do endereço do contrato e são aproximadas. Para corrigir um ponto, troque a latitude e a longitude (use vírgula como separador decimal, por exemplo `-5,18765`).
- **Para virar mapa de calor:** quando houver o número de trabalhadores por unidade, preencha a coluna `trabalhadores_por_unidade` com números. O tamanho de cada ponto passa a ser proporcional a esse número automaticamente.

## Privacidade

Só dados somados. Nenhum nome, CPF ou informação que identifique trabalhadores. Não suba para este repositório o PDF original do processo, porque ele contém dados pessoais.

Contato: odss@ufersa.edu.br
