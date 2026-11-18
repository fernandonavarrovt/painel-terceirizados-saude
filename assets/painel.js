/* Painel ODSS | terceirizados da saude
   Le os CSVs da pasta dados/ (separador ; e decimal com virgula) e monta o painel.
   Para incluir outro municipio, basta acrescentar linhas nos CSVs com a coluna "municipio". */

const ARQUIVOS = [
  "municipios", "perfil_sexo", "perfil_faixa_etaria", "funcao_regime",
  "contratado_x_alocado", "contrato_itens", "unidades", "conferencia_totais",
  "limitacoes", "campos_disponiveis",
];
const D = {};
let muni = null;
let vistaFuncoes = "funcao";

/* ---------------- utilidades ---------------- */
function lerCSV(texto) {
  texto = texto.replace(/^﻿/, "");
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ";") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.some(v => v !== "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = linhas.shift();
  return linhas.map(l => Object.fromEntries(cab.map((k, j) => [k, conv(l[j] ?? "")])));
}
function conv(v) {
  return /^-?\d+(,\d+)?$/.test(v) ? parseFloat(v.replace(",", ".")) : v;
}
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (n, d = 0) => Number(n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const reais = n => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (a, b, d = 1) => b ? num(a / b * 100, d) + "%" : "";
const soma = (arr, k) => arr.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const doMuni = nome => (D[nome] || []).filter(r => !("municipio" in r) || r.municipio === muni);
function agrupar(arr, chave, valor) {
  const m = new Map();
  arr.forEach(r => m.set(r[chave], (m.get(r[chave]) || 0) + (Number(r[valor]) || 0)));
  return [...m].map(([rot, val]) => ({ rot, val }));
}
function passoBonito(max, alvo = 4) {
  const bruto = max / alvo, mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const passo = [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= bruto);
  return { passo, topo: Math.ceil(max / passo) * passo };
}

/* ---------------- dica (tooltip) ---------------- */
const dica = document.getElementById("dica");
function mostrarDica(html, x, y) {
  dica.innerHTML = html; dica.hidden = false;
  const r = dica.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  dica.style.left = Math.max(8, left) + "px"; dica.style.top = Math.max(8, top) + "px";
}
document.addEventListener("mousemove", e => {
  const alvo = e.target.closest("[data-dica]");
  if (alvo) mostrarDica(alvo.dataset.dica, e.clientX, e.clientY); else dica.hidden = true;
});
document.addEventListener("focusin", e => {
  const alvo = e.target.closest("[data-dica]");
  if (!alvo) return;
  const r = alvo.getBoundingClientRect();
  mostrarDica(alvo.dataset.dica, r.left + r.width / 2, r.bottom);
});
document.addEventListener("focusout", () => { dica.hidden = true; });
document.addEventListener("scroll", () => { dica.hidden = true; }, { passive: true });

/* ---------------- componentes ---------------- */
function barrasH(el, linhas, total) {
  const max = Math.max(...linhas.map(l => l.val), 1);
  el.innerHTML = `<div class="barras-h">${linhas.map(l => `
      <div class="rot">${esc(l.rot)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</div>
      <div class="trilho" tabindex="0" data-dica="${esc(`<b>${esc(l.rot)}</b><br>${num(l.val)} trabalhadores${total ? ` (${pct(l.val, total)})` : ""}${l.extra ? "<br>" + l.extra : ""}`)}">
        <div class="barra" style="width:${l.val / max * 85}%"></div>
        <span class="val">${num(l.val)}</span>
      </div>`).join("")}</div>`;
}
function tabela(cols, linhas) {
  return `<div class="tabela-rolagem"><table class="tabela"><thead><tr>${cols.map(c => `<th class="${c.num ? "num" : ""}">${esc(c.t)}</th>`).join("")}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${cols.map(c => `<td class="${c.num ? "num" : ""}">${c.html ? c.html(l) : esc(c.f ? c.f(l) : l[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function detalhesTabela(cols, linhas) {
  return `<details class="tabela-det"><summary>Ver os números em tabela</summary>${tabela(cols, linhas)}</details>`;
}
const SELO = {
  "Igual ao previsto": ["ok", "Igual ao previsto"],
  "Abaixo do previsto": ["baixo", "Abaixo do previsto"],
  "Previsto no contrato, nenhum trabalhador informado": ["zero", "Ninguém informado"],
  "Acima do previsto": ["acima", "Acima do previsto"],
};
const selo = s => { const [c, t] = SELO[s] || ["", s]; return `<span class="selo ${c}">${esc(t)}</span>`; };

/* ---------------- secoes ---------------- */
function renderCabecalho(m) {
  document.getElementById("fonte-curta").textContent = `Dados de ${m.data_resposta}, obtidos pela Lei de Acesso à Informação`;
  document.getElementById("texto-fonte").innerHTML =
    `Fonte: ${esc(m.fonte)}, de ${esc(m.data_resposta)}. Contrato: ${esc(m.contrato)}, com a ${esc(m.empresa)}, serviços desde ${esc(m.inicio_servicos)}. Os números foram copiados do documento oficial e conferidos pelo ODSS.`;
}

function renderKPIs(m) {
  const sexo = doMuni("perfil_sexo");
  const fem = sexo.find(r => r.sexo === "Feminino")?.trabalhadores || 0;
  const tot = m.total_trabalhadores;
  const funcoes = new Set(doMuni("funcao_regime").map(r => r.funcao)).size;
  const un = doMuni("unidades").filter(r => r.citada_na_resposta_sms === "sim");
  const ubs = un.filter(r => r.tipo === "UBS");
  const ubsRural = ubs.filter(r => r.zona === "Rural").length;
  const cards = [
    [num(tot), "trabalhadores terceirizados", "na rede municipal de saúde", "var(--azul)"],
    [pct(fem, soma(sexo, "trabalhadores")), "são mulheres", `${num(fem)} de ${num(soma(sexo, "trabalhadores"))}`, "var(--azul)"],
    [num(funcoes), "funções diferentes", "de motorista a recepcionista", "var(--azul)"],
    [num(un.length), "unidades de saúde", `${ubs.length} UBS, ${ubsRural} na zona rural`, "var(--azul)"],
    ["1", "empresa contratada", m.empresa, "var(--azul)"],
    [`R$ ${num(m.valor_anual_contrato_rs / 1e6, 1)} mi`, "por ano no contrato", reais(m.valor_anual_contrato_rs), "var(--azul)"],
  ];
  document.getElementById("kpis").innerHTML = cards.map(([v, r, d, c]) =>
    `<div class="kpi" style="--cor:${c}"><div class="kpi-valor">${esc(v)}</div><div class="kpi-rotulo">${esc(r)}</div><div class="kpi-detalhe">${esc(d)}</div></div>`).join("");
}

function renderSexo() {
  const s = doMuni("perfil_sexo"), tot = soma(s, "trabalhadores");
  const cores = ["var(--serie-1)", "var(--serie-2)"];
  document.getElementById("graf-sexo").innerHTML = `
    <div class="empilhada">${s.map((r, i) => `<div tabindex="0" style="flex:${r.trabalhadores};background:${cores[i]}"
        data-dica="${esc(`<b>${esc(r.sexo)}</b><br>${num(r.trabalhadores)} trabalhadores (${pct(r.trabalhadores, tot)})`)}">${pct(r.trabalhadores, tot, 0)}</div>`).join("")}</div>
    <div class="legenda-emp">${s.map((r, i) => `<span><i class="quadradinho" style="background:${cores[i]}"></i>${esc(r.sexo)}: <b>${num(r.trabalhadores)}</b></span>`).join("")}</div>
    ${detalhesTabela([{ t: "Sexo", k: "sexo" }, { t: "Trabalhadores", k: "trabalhadores", num: 1 }, { t: "%", f: r => pct(r.trabalhadores, tot), num: 1 }], s)}`;
}

function renderIdade(m) {
  const f = doMuni("perfil_faixa_etaria"), tot = soma(f, "trabalhadores");
  const max = Math.max(...f.map(r => r.trabalhadores));
  document.getElementById("graf-idade").innerHTML = `
    <div class="colunas">${f.map(r => `<div class="coluna" tabindex="0" data-dica="${esc(`<b>${esc(r.faixa_etaria)}</b><br>${num(r.trabalhadores)} trabalhadores (${pct(r.trabalhadores, tot)})`)}">
      <span class="val">${num(r.trabalhadores)}</span><div class="barra" style="height:${r.trabalhadores / max * 82}%"></div></div>`).join("")}</div>
    <div class="colunas-rot">${f.map(r => `<span>${esc(r.faixa_etaria.replace(" anos", ""))}</span>`).join("")}</div>
    ${detalhesTabela([{ t: "Faixa", k: "faixa_etaria" }, { t: "Trabalhadores", k: "trabalhadores", num: 1 }, { t: "%", f: r => pct(r.trabalhadores, tot), num: 1 }], f)}`;
  const dif = m.total_trabalhadores - tot;
  document.getElementById("nota-idade").textContent = dif
    ? `Idade em anos. As faixas somam ${num(tot)}, ${num(Math.abs(dif))} a ${dif > 0 ? "menos" : "mais"} que o total informado (${num(m.total_trabalhadores)}).`
    : "Idade em anos.";
}

const ORDEM_JORNADA = ["40h", "30h", "12x36 diurno", "12x36 noturno", "12x36", "24x96"];
const NOME_JORNADA = { "40h": "40 horas por semana", "30h": "30 horas por semana", "12x36 diurno": "Plantão 12x36 diurno", "12x36 noturno": "Plantão 12x36 noturno", "12x36": "Plantão 12x36 (turno não informado)", "24x96": "Plantão 24x96" };

function renderFuncoes(m) {
  const f = doMuni("funcao_regime"), tot = soma(f, "trabalhadores");
  const el = document.getElementById("graf-funcoes");
  let linhas;
  if (vistaFuncoes === "funcao") {
    const area = Object.fromEntries(f.map(r => [r.funcao, r.area]));
    linhas = agrupar(f, "funcao", "trabalhadores").sort((a, b) => b.val - a.val)
      .map(l => ({ ...l, sub: area[l.rot], extra: f.filter(r => r.funcao === l.rot).map(r => `${esc(r.regime)}: ${num(r.trabalhadores)}`).join("<br>") }));
  } else if (vistaFuncoes === "area") {
    linhas = agrupar(f, "area", "trabalhadores").sort((a, b) => b.val - a.val)
      .map(l => ({ ...l, extra: [...new Set(f.filter(r => r.area === l.rot).map(r => r.funcao))].map(esc).join(", ") }));
  } else if (vistaFuncoes === "jornada") {
    const g = Object.fromEntries(agrupar(f, "regime", "trabalhadores").map(l => [l.rot, l.val]));
    linhas = ORDEM_JORNADA.filter(k => g[k]).map(k => ({ rot: NOME_JORNADA[k] || k, val: g[k] }));
  } else {
    linhas = agrupar(f, "turno", "trabalhadores").sort((a, b) => b.val - a.val);
  }
  barrasH(el, linhas, tot);
  el.insertAdjacentHTML("beforeend", detalhesTabela(
    [{ t: "Área", k: "area" }, { t: "Função", k: "funcao" }, { t: "Regime", k: "regime" }, { t: "Turno", k: "turno" }, { t: "Trabalhadores", k: "trabalhadores", num: 1 }], f));
  const dif = m.total_trabalhadores - tot;
  document.getElementById("nota-funcoes").textContent =
    (vistaFuncoes === "turno" ? "Nas jornadas de 30 e 40 horas a Prefeitura não informou o turno; tratamos como diurno (horário comercial). " : "") +
    (dif ? `A tabela de funções soma ${num(tot)} pessoas, ${num(dif)} a menos que o total de ${num(m.total_trabalhadores)} informado, sem explicação da Prefeitura.` : "");
}

function renderContrato() {
  const itens = doMuni("contrato_itens"), comp = doMuni("contratado_x_alocado");
  const previsto = soma(itens, "postos_por_mes"), informado = soma(comp, "trabalhadores");
  const p = informado / previsto * 100;
  document.getElementById("destaque-contrato").innerHTML = `
    <div class="destaque-num">${num(p, 0)}%<small> do previsto</small></div>
    <div><p>O contrato prevê <b>${num(previsto)}</b> postos de trabalho por mês. A Prefeitura informou <b>${num(informado)}</b> trabalhadores nessas funções.</p>
    <div class="barra-ocupacao" role="img" aria-label="${num(p, 0)} por cento dos postos ocupados"><span style="width:${Math.min(p, 100)}%"></span></div></div>`;

  const cont = s => comp.filter(r => r.situacao === s).length;
  const sit = [
    ["Igual ao previsto", "var(--azul)"], ["Abaixo do previsto", "var(--coral)"],
    ["Previsto no contrato, nenhum trabalhador informado", "var(--rosa)"], ["Acima do previsto", "var(--texto-3)"],
  ];
  document.getElementById("situacoes").innerHTML = sit.map(([s, c]) =>
    `<div class="mini" style="--cor:${c}"><b>${cont(s)}</b><span>${SELO[s][1].toLowerCase().replace(/^./, x => x.toUpperCase())} (itens do contrato)</span></div>`).join("");

  // halteres por funcao
  const fx = new Map();
  comp.forEach(r => {
    const a = fx.get(r.funcao) || { prev: 0, inf: 0 };
    a.prev += Number(r.postos_por_mes) || 0; a.inf += Number(r.trabalhadores) || 0; fx.set(r.funcao, a);
  });
  const linhas = [...fx].map(([f, v]) => ({ f, ...v })).sort((a, b) => b.prev - a.prev || b.inf - a.inf);
  const { passo, topo } = passoBonito(Math.max(...linhas.map(l => Math.max(l.prev, l.inf))));
  const x = v => v / topo * 100;
  const grades = [];
  for (let t = 0; t <= topo; t += passo) grades.push(t);
  document.getElementById("graf-halteres").innerHTML = `<div class="halteres">
    ${linhas.map(l => `<div class="rot">${esc(l.f)}</div>
      <div class="pista" tabindex="0" data-dica="${esc(`<b>${esc(l.f)}</b><br>Postos previstos: ${num(l.prev)} por mês<br>Trabalhadores informados: ${num(l.inf)}<br>${l.inf === l.prev ? "Igual ao previsto" : l.inf < l.prev ? `${num(l.prev - l.inf)} a menos que o previsto` : `${num(l.inf - l.prev)} a mais que o previsto`}`)}">
        ${grades.map(t => `<i class="grade" style="left:${x(t)}%"></i>`).join("")}
        <i class="liga" style="left:${x(Math.min(l.prev, l.inf))}%;width:${x(Math.abs(l.prev - l.inf))}%"></i>
        <i class="p p1" style="left:${x(l.prev)}%"></i><i class="p p2" style="left:${x(l.inf)}%"></i>
      </div>`).join("")}
    <div></div><div class="eixo">${grades.map(t => `<span style="left:${x(t)}%">${num(t)}</span>`).join("")}</div>
  </div>`;

  document.getElementById("tab-contrato").innerHTML = tabela([
    { t: "Item", k: "item", num: 1 }, { t: "Função", k: "funcao" }, { t: "Regime", k: "regime" },
    { t: "Postos/mês", f: r => num(r.postos_por_mes), num: 1 }, { t: "Informados", k: "trabalhadores", num: 1 },
    { t: "Situação", html: r => selo(r.situacao) }, { t: "Custo mensal por posto", f: r => reais(r.valor_unitario_mensal_rs), num: 1 },
  ], [...comp].sort((a, b) => a.item - b.item));
}

function renderUnidades() {
  const u = doMuni("unidades");
  const sms = u.filter(r => r.citada_na_resposta_sms === "sim");
  const contaTipo = agrupar(sms.map(r => ({ ...r, um: 1 })), "tipo", "um").sort((a, b) => b.val - a.val);
  document.getElementById("tipos-unidade").innerHTML =
    contaTipo.map(t => `<div class="mini"><b>${t.val}</b><span>${esc(t.rot)}</span></div>`).join("") +
    `<div class="mini" style="--cor:var(--coral)"><b>${sms.filter(r => r.zona === "Rural").length}</b><span>na zona rural</span></div>`;

  const selTipo = document.getElementById("filtro-tipo");
  const tipos = [...new Set(u.map(r => r.tipo))].sort();
  selTipo.innerHTML = `<option value="">Todos os tipos</option>` + tipos.map(t => `<option>${esc(t)}</option>`).join("");
  filtrarUnidades();
}
function filtrarUnidades() {
  const termo = document.getElementById("busca-unidade").value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const tipo = document.getElementById("filtro-tipo").value;
  const zona = document.getElementById("filtro-zona").value;
  const soSms = document.getElementById("filtro-so-sms").checked;
  const base = doMuni("unidades");
  const lista = base.filter(r =>
    (!tipo || r.tipo === tipo) && (!zona || r.zona === zona) && (!soSms || r.citada_na_resposta_sms === "sim") &&
    (!termo || `${r.unidade} ${r.endereco_contrato} ${r.nome_no_contrato}`.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").includes(termo)));
  document.getElementById("contagem-unidades").textContent = `${lista.length} de ${base.length} locais`;
  document.getElementById("tab-unidades").outerHTML = tabela([
    { t: "Unidade", html: r => (typeof r.lat === "number" ? PINO : "") + esc(r.unidade) + (r.citada_na_resposta_sms === "não" ? ` <span class="selo">só no contrato</span>` : "") },
    { t: "Tipo", k: "tipo" }, { t: "Zona", k: "zona" },
    { t: "Endereço (lista do contrato)", f: r => r.endereco_contrato || "sem endereço no contrato" },
    { t: "Observação", k: "observacao" },
  ], lista).replace('<table class="tabela">', '<table class="tabela" id="tab-unidades">').replace(/^<div class="tabela-rolagem">|<\/div>$/g, "");
  document.querySelectorAll("#tab-unidades tbody tr").forEach((tr, i) => {
    if (typeof lista[i].lat !== "number") return;
    tr.classList.add("clicavel");
    tr.tabIndex = 0;
    tr.title = "Ver no mapa";
    const ir = () => focarNoMapa(lista[i].unidade);
    tr.addEventListener("click", ir);
    tr.addEventListener("keydown", e => { if (e.key === "Enter") ir(); });
  });
  atualizarMapa(lista);
}

function renderLacunas() {
  const c = doMuni("campos_disponiveis").filter(r => /^Não|^Só a lista/.test(r.disponivel));
  const icone = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;
  document.getElementById("lista-lacunas").innerHTML = c.map(r =>
    `<div class="lacuna"><div class="icone">${icone}</div><h4>${esc(r.campo)}</h4><p>${esc(r.disponivel === "Só a lista" ? "Veio só a lista de unidades, sem quantos trabalham em cada uma." : r.detalhe.replace(/^Idem$/, "Não foi fornecido pela Prefeitura."))}</p></div>`).join("");
}

function renderMetodo() {
  const c = D.conferencia_totais;
  const fmtV = v => typeof v === "number" ? (v > 100000 ? reais(v) : num(v)) : v;
  document.getElementById("tab-conferencia").innerHTML = tabela([
    { t: "O que conferimos", k: "conferencia" }, { t: "Calculado", f: r => fmtV(r.valor_calculado), num: 1 },
    { t: "Esperado", f: r => fmtV(r.valor_de_referencia), num: 1 },
    { t: "Resultado", html: r => r.resultado ? `<span class="selo ${/NÃO/.test(r.resultado) ? "zero" : "ok"}">${esc(r.resultado)}</span>` : "" },
  ], c);
  document.getElementById("lista-limitacoes").innerHTML = D.limitacoes.map(r => `<dt>${esc(r.limitacao)}</dt><dd>${esc(r.explicacao)}</dd>`).join("");
  const arqs = [
    ["terceirizados_saude_mossoro.xlsx", "Planilha completa (Excel)"], ["perfil_sexo.csv", "Perfil por sexo"],
    ["perfil_faixa_etaria.csv", "Perfil por faixa etária"], ["funcao_regime.csv", "Função e regime de jornada"],
    ["contrato_itens.csv", "Itens do contrato"], ["contratado_x_alocado.csv", "Contrato x trabalhadores informados"],
    ["unidades.csv", "Unidades de saúde"], ["limitacoes.csv", "Limitações dos dados"],
  ];
  document.getElementById("downloads").innerHTML = arqs.map(([a, t]) =>
    `<li><a href="dados/${a}" download>${esc(t)}<small>${a.endsWith("xlsx") ? "XLSX" : "CSV"}</small></a></li>`).join("");
}

function renderTudo() {
  const m = D.municipios.find(r => r.municipio === muni);
  renderCabecalho(m); renderKPIs(m); renderSexo(); renderIdade(m); renderFuncoes(m);
  renderContrato(); renderVagas(); renderUnidades(); renderLacunas(); renderMetodo();
  renderPontos(m);
  prepararRevelar();
}

/* ---------------- inicio ---------------- */
document.querySelectorAll(".abas button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".abas button").forEach(x => x.setAttribute("aria-selected", x === b));
  vistaFuncoes = b.dataset.vista;
  renderFuncoes(D.municipios.find(r => r.municipio === muni));
}));
["busca-unidade", "filtro-tipo", "filtro-zona", "filtro-so-sms"].forEach(id =>
  document.getElementById(id).addEventListener("input", filtrarUnidades));

Promise.all(ARQUIVOS.map(a => fetch(`dados/${a}.csv`).then(r => { if (!r.ok) throw new Error(a); return r.text(); })
  .then(t => { D[a] = lerCSV(t); })))
  .then(() => {
    const sel = document.getElementById("sel-municipio");
    sel.innerHTML = D.municipios.map(m => `<option>${esc(m.municipio)}</option>`).join("");
    const pedido = new URLSearchParams(location.search).get("municipio");
    muni = D.municipios.some(m => m.municipio === pedido) ? pedido : D.municipios[0].municipio;
    sel.value = muni;
    sel.disabled = D.municipios.length < 2;
    sel.addEventListener("change", () => { muni = sel.value; renderTudo(); });
    renderTudo();
  })
  .catch(err => {
    const e = document.getElementById("erro");
    e.hidden = false;
    e.innerHTML = `Não foi possível carregar os dados (${esc(err.message)}). Se você abriu o arquivo direto do computador, use o atalho <b>ver_painel_no_computador.bat</b>; o navegador bloqueia a leitura dos dados quando a página é aberta como arquivo.`;
  });

/* =====================================================================
   1. CADA PONTO E UMA PESSOA (pontos que se reorganizam ao rolar)
   ===================================================================== */
const CINZA = "#B9BFC9";
let passoAtual = 0, pontosEtapas = [], obsPassos = null;

function etapasPontos(m) {
  const tot = m.total_trabalhadores;
  const sexo = doMuni("perfil_sexo"), faixa = doMuni("perfil_faixa_etaria"), f = doMuni("funcao_regime");
  const somaF = soma(f, "trabalhadores"), somaI = soma(faixa, "trabalhadores");
  const falta = (n, rot) => tot - n > 0 ? [{ rot, n: tot - n, cor: CINZA }] : [];
  const areas = agrupar(f, "area", "trabalhadores").sort((a, b) => b.val - a.val);
  const jg = Object.fromEntries(agrupar(f, "regime", "trabalhadores").map(l => [l.rot, l.val]));
  const fem = sexo.find(r => r.sexo === "Feminino")?.trabalhadores || 0;
  const maiorFaixa = [...faixa].sort((a, b) => b.trabalhadores - a.trabalhadores)[0];
  const mais55 = soma(faixa.filter(r => parseInt(r.faixa_etaria, 10) >= 55), "trabalhadores");
  const plantao = soma(f.filter(r => r.regime.includes("x")), "trabalhadores");
  const noturno = soma(f.filter(r => r.turno === "Noturno"), "trabalhadores");
  const semIdade = tot - somaI, semFuncao = tot - somaF;
  return [
    {
      grupos: [{ rot: "Trabalhadores terceirizados", n: tot, cor: "var(--azul)" }],
      texto: `<b>${num(tot)} pessoas</b> trabalham na rede municipal de saúde de ${esc(muni)} contratadas por uma empresa, e não pela Prefeitura. Cada ponto é uma delas.`,
    },
    {
      grupos: sexo.map((r, i) => ({ rot: r.sexo, n: r.trabalhadores, cor: i ? "var(--coral)" : "var(--azul)" })),
      texto: `<b>${pct(fem, tot)} são mulheres</b>: ${num(fem)} trabalhadoras e ${num(tot - fem)} trabalhadores.`,
    },
    {
      grupos: [...faixa.map(r => ({ rot: r.faixa_etaria, n: r.trabalhadores, cor: "var(--azul)" })), ...falta(somaI, "Idade não informada")],
      texto: `A faixa com mais gente é a de <b>${esc(maiorFaixa.faixa_etaria)}</b> (${num(maiorFaixa.trabalhadores)} pessoas). ${num(mais55)} têm 55 anos ou mais.` +
        (semIdade > 0 ? ` A Prefeitura não informou a idade de ${num(semIdade)} pessoa${semIdade > 1 ? "s" : ""} (ponto cinza).` : ""),
    },
    {
      grupos: [...areas.map(a => ({ rot: a.rot, n: a.val, cor: "var(--azul)" })), ...falta(somaF, "Função não informada")],
      texto: `<b>${esc(areas[0].rot)}</b> reúne ${num(areas[0].val)} pessoas (${pct(areas[0].val, tot)}). Depois vêm ${esc(areas[1].rot.toLowerCase())} (${num(areas[1].val)}) e ${esc(areas[2].rot.toLowerCase())} (${num(areas[2].val)}).` +
        (semFuncao > 0 ? ` A função de ${num(semFuncao)} pessoas não foi informada (pontos cinza).` : ""),
    },
    {
      grupos: [...ORDEM_JORNADA.filter(k => jg[k]).map(k => ({ rot: NOME_JORNADA[k], n: jg[k], cor: "var(--azul)" })), ...falta(somaF, "Jornada não informada")],
      texto: `<b>${num(jg["40h"] || 0)} cumprem 40 horas por semana.</b> Outras ${num(plantao)} trabalham em plantões de 12 ou 24 horas, ${num(noturno)} delas à noite.`,
    },
  ];
}

function layoutPontos(grupos, W) {
  const s = W < 480 ? 7 : 9, rotH = 22, gap = 14;
  const cols = Math.max(10, Math.floor(W / s));
  const pos = [], rots = [];
  let y = 0;
  grupos.forEach(g => {
    rots.push({ y: y + 14, g });
    y += rotH;
    for (let k = 0; k < g.n; k++) pos.push({ x: (k % cols) * s + s / 2, y: y + Math.floor(k / cols) * s + s / 2, cor: g.cor });
    y += Math.ceil(g.n / cols) * s + gap;
  });
  return { pos, rots, h: y - gap + 4, s };
}

function renderPontos(m) {
  const svg = document.getElementById("svg-pontos");
  pontosEtapas = etapasPontos(m);
  passoAtual = 0;
  document.getElementById("passos").innerHTML = pontosEtapas.map((e, i) =>
    `<div class="passo${i === 0 ? " ativo" : ""}" data-passo="${i}"><div class="passo-cartao"><span class="passo-num">${i + 1} de ${pontosEtapas.length}</span><p>${e.texto}</p></div></div>`).join("");
  svg.innerHTML = `<g class="rotulos"></g>` + Array.from({ length: m.total_trabalhadores }, () => `<circle class="pt" cx="0" cy="0" r="3"></circle>`).join("");
  desenharPontos(true);
  observarPassos();
}

function desenharPontos(semAnim) {
  const svg = document.getElementById("svg-pontos");
  if (!svg || !pontosEtapas.length) return;
  const W = Math.floor(svg.parentElement.clientWidth);
  if (!W) return;
  const lays = pontosEtapas.map(e => layoutPontos(e.grupos, W));
  const H = Math.max(...lays.map(l => l.h));
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  const L = lays[passoAtual], pts = svg.querySelectorAll(".pt"), n = pts.length;
  const tot = L.pos.length;
  pts.forEach((c, i) => {
    const p = L.pos[i];
    if (semAnim) c.style.transition = "none";
    c.setAttribute("r", (L.s * 0.36).toFixed(2));
    c.style.transitionDelay = semAnim ? "0ms" : `${Math.round(i / n * 450)}ms`;
    if (p) { c.style.transform = `translate(${p.x}px, ${p.y}px)`; c.style.fill = p.cor; c.style.opacity = 1; }
    else c.style.opacity = 0;
  });
  if (semAnim) { svg.getBoundingClientRect(); pts.forEach(c => { c.style.transition = ""; }); }
  const g = svg.querySelector(".rotulos");
  g.classList.remove("mostra");
  g.innerHTML = L.rots.map(r =>
    `<text x="0" y="${r.y}"><tspan class="r-nome">${esc(r.g.rot)}</tspan><tspan class="r-num" dx="8">${num(r.g.n)}${L.rots.length > 1 ? ` (${pct(r.g.n, tot)})` : ""}</tspan></text>`).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("mostra")));
  svg.setAttribute("aria-label", "Gráfico de pontos, cada ponto é um trabalhador. " + L.rots.map(r => `${r.g.rot}: ${r.g.n}`).join("; "));
}

function observarPassos() {
  if (obsPassos) obsPassos.disconnect();
  if (!("IntersectionObserver" in window)) return;
  obsPassos = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = +e.target.dataset.passo;
    if (i === passoAtual) return;
    passoAtual = i;
    document.querySelectorAll(".passo").forEach(p => p.classList.toggle("ativo", +p.dataset.passo === i));
    desenharPontos(reduzirMovimento);
  }), { rootMargin: matchMedia("(max-width: 860px)").matches ? "-76% 0px -22% 0px" : "-48% 0px -48% 0px" });
  document.querySelectorAll(".passo").forEach(p => obsPassos.observe(p));
}

let tempoRedim;
addEventListener("resize", () => { clearTimeout(tempoRedim); tempoRedim = setTimeout(() => desenharPontos(true), 150); });

/* =====================================================================
   2. AS VAGAS DO CONTRATO, UMA A UMA
   ===================================================================== */
function renderVagas() {
  const comp = doMuni("contratado_x_alocado");
  const fx = new Map();
  comp.forEach(r => {
    const a = fx.get(r.funcao) || { prev: 0, inf: 0 };
    a.prev += Number(r.postos_por_mes) || 0; a.inf += Number(r.trabalhadores) || 0; fx.set(r.funcao, a);
  });
  const lista = [...fx].map(([f, v]) => ({ f, ...v })).sort((a, b) => b.prev - a.prev || b.inf - a.inf);
  let html = "", cheios = 0, vazios = 0, extras = 0;
  lista.forEach((l, fi) => {
    const dica = esc(`<b>${esc(l.f)}</b><br>${num(l.prev)} postos previstos por mês<br>${num(l.inf)} com trabalhador informado` +
      (l.prev > l.inf ? `<br>${num(l.prev - l.inf)} sem ninguém` : l.inf > l.prev ? `<br>${num(l.inf - l.prev)} a mais que o previsto` : ""));
    const n = Math.max(l.prev, l.inf);
    for (let k = 0; k < n; k++) {
      const cheio = k < l.inf, extra = k >= l.prev;
      if (cheio) cheios++; else vazios++;
      if (extra) extras++;
      html += `<i class="q${cheio ? " cheio" : ""}${extra ? " extra" : ""}" data-f="${fi}" style="--i:${cheio ? cheios : 0}" data-dica="${dica}"></i>`;
    }
  });
  const el = document.getElementById("vagas");
  el.innerHTML = html;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `${num(cheios + vazios)} quadrados: ${num(cheios)} postos com trabalhador e ${num(vazios)} sem ninguém`);
  document.getElementById("legenda-vagas").innerHTML =
    `<span><i class="q cheio demo"></i>Posto com trabalhador: <b>${num(cheios)}</b></span>` +
    `<span><i class="q demo"></i>Posto previsto sem ninguém: <b>${num(vazios)}</b></span>` +
    (extras ? `<span><i class="q cheio extra demo"></i>Acima do previsto: <b>${num(extras)}</b></span>` : "");
  const grupos = {};
  el.querySelectorAll(".q").forEach(q => (grupos[q.dataset.f] ||= []).push(q));
  let ativo = null;
  el.onmouseover = e => {
    const q = e.target.closest(".q");
    if (!q || q.dataset.f === ativo) return;
    if (ativo !== null) grupos[ativo].forEach(x => x.classList.remove("ativa"));
    ativo = q.dataset.f;
    grupos[ativo].forEach(x => x.classList.add("ativa"));
    el.classList.add("focando");
  };
  el.onmouseleave = () => {
    if (ativo !== null) grupos[ativo].forEach(x => x.classList.remove("ativa"));
    ativo = null; el.classList.remove("focando");
  };
}

/* =====================================================================
   3. MAPA DAS UNIDADES (vira mapa de calor quando a coluna
      trabalhadores_por_unidade tiver numeros)
   ===================================================================== */
const PINO = `<svg class="pino" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s-7-6.2-7-11.6a7 7 0 0 1 14 0C19 15.8 12 22 12 22z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="#fff"/></svg>`;
const PRECISAO = {
  unidade: "Posição do próprio prédio (OpenStreetMap).",
  rua: "Posição aproximada: a rua do endereço.",
  bairro: "Posição aproximada: o centro do bairro.",
  localidade: "Posição aproximada: a localidade rural.",
};
let mapa = null, camadaPontos = null;
const marcadores = new Map();

function estiloTipo(t) {
  if (t === "UBS") return { fillColor: "#00407D", color: "#fff", weight: 2 };
  if (t === "UPA" || t === "Urgência") return { fillColor: "#FF6C4C", color: "#fff", weight: 2 };
  if (t === "Cemitério" || t === "Outro") return { fillColor: "#B9BFC9", color: "#fff", weight: 2 };
  return { fillColor: "#fff", color: "#00407D", weight: 3 };
}

function atualizarMapa(lista) {
  const el = document.getElementById("mapa");
  if (!window.L) {
    el.innerHTML = `<p class="nota mapa-erro">O mapa não pôde ser carregado (sem internet?). A lista abaixo traz todas as unidades.</p>`;
    return;
  }
  if (!mapa) {
    mapa = L.map(el, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    camadaPontos = L.layerGroup().addTo(mapa);
    mapa.on("focus", () => mapa.scrollWheelZoom.enable());
    mapa.on("blur", () => mapa.scrollWheelZoom.disable());
  }
  camadaPontos.clearLayers();
  marcadores.clear();
  const comPos = lista.filter(r => typeof r.lat === "number" && typeof r.lon === "number");
  const temQtd = comPos.some(r => typeof r.trabalhadores_por_unidade === "number");
  const maxQ = Math.max(1, ...comPos.map(r => Number(r.trabalhadores_por_unidade) || 0));
  comPos.forEach(r => {
    const raio = temQtd ? 5 + 18 * Math.sqrt((Number(r.trabalhadores_por_unidade) || 0) / maxQ) : 7;
    const mk = L.circleMarker([r.lat, r.lon], { radius: raio, fillOpacity: temQtd ? 0.75 : 1, ...estiloTipo(r.tipo) });
    mk.bindPopup(`<b>${esc(r.unidade)}</b><br>${esc(r.tipo)}, zona ${esc(String(r.zona).toLowerCase())}` +
      (r.endereco_contrato ? `<br>${esc(r.endereco_contrato)}` : "") +
      (temQtd ? `<br><b>${num(r.trabalhadores_por_unidade)}</b> trabalhadores terceirizados` : "") +
      `<br><small>${PRECISAO[r.precisao] || ""}</small>`);
    camadaPontos.addLayer(mk);
    marcadores.set(r.unidade, mk);
  });
  if (comPos.length) mapa.fitBounds(L.latLngBounds(comPos.map(r => [r.lat, r.lon])), { padding: [28, 28], maxZoom: 15 });
  const sem = lista.filter(r => typeof r.lat !== "number");
  document.getElementById("nota-mapa").innerHTML =
    `${comPos.length} de ${lista.length} locais aparecem no mapa. As posições são aproximadas, calculadas a partir do endereço que está no contrato; clique num ponto para ver a precisão.` +
    (temQtd ? "" : " <b>Todos os pontos têm o mesmo tamanho</b> porque a Prefeitura não informou quantos trabalhadores há em cada unidade. Quando esse número chegar, o mapa passa a mostrar onde há mais gente.") +
    (sem.length ? ` Sem localização: ${sem.map(r => esc(r.unidade)).join(", ")}.` : "");
}

function focarNoMapa(nome) {
  const mk = marcadores.get(nome);
  if (!mk || !mapa) return;
  document.getElementById("mapa").scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "center" });
  mapa.setView(mk.getLatLng(), 15);
  mk.openPopup();
}

/* =====================================================================
   4. ANIMACOES AO ROLAR (aparecer, barras crescendo, numeros contando)
   ===================================================================== */
const reduzirMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
let obsRevelar = null;

function prepararRevelar() {
  if (reduzirMovimento || !("IntersectionObserver" in window)) return;
  obsRevelar ||= new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add("visivel");
    if (e.target.matches(".kpi, .destaque")) contar(e.target);
    obsRevelar.unobserve(e.target);
  }), { threshold: 0.12 });
  document.querySelectorAll(".secao-cab, .cartao, .kpi, .mini, .lacuna, .destaque, .aviso").forEach(el => {
    if (el.classList.contains("revelar")) return;
    el.classList.add("revelar");
    obsRevelar.observe(el);
  });
}

function contar(raiz) {
  const el = raiz.querySelector(".kpi-valor, .destaque-num");
  if (!el) return;
  const tn = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
  if (!tn) return;
  const txt = tn.textContent, m = txt.match(/\d[\d.]*(,\d+)?/);
  if (!m) return;
  const dec = m[1] ? m[1].length - 1 : 0;
  const alvo = parseFloat(m[0].replace(/\./g, "").replace(",", "."));
  const ini = performance.now(), dur = 1100;
  const passo = t => {
    const k = Math.min(1, (t - ini) / dur), ease = 1 - Math.pow(1 - k, 3);
    tn.textContent = txt.replace(m[0], num(alvo * ease, dec));
    if (k < 1) requestAnimationFrame(passo); else tn.textContent = txt;
  };
  requestAnimationFrame(passo);
}
