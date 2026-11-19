/* Painel ODSS | terceirizados da saude
   Le os CSVs da pasta dados/ (separador ; e decimal com virgula) e monta o painel.
   Para incluir outro municipio, basta acrescentar linhas nos CSVs com a coluna "municipio". */

const ARQUIVOS = [
  "municipios", "perfil_sexo", "perfil_faixa_etaria", "funcao_regime",
  "contratado_x_alocado", "contrato_itens", "unidades", "conferencia_totais",
  "limitacoes", "campos_disponiveis",
];
const D = {};
const raiz = document.documentElement;
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
let dicaAtual = "";
function mostrarDica(html, x, y) {
  if (html !== dicaAtual) { dica.innerHTML = html; dicaAtual = html; }
  dica.hidden = false;
  const r = dica.getBoundingClientRect();
  let left = x + 16, top = y + 16;
  if (left + r.width > innerWidth - 8) left = x - r.width - 16;
  if (top + r.height > innerHeight - 8) top = y - r.height - 16;
  dica.style.left = Math.max(8, left) + "px"; dica.style.top = Math.max(8, top) + "px";
}
function esconderDica() { dica.hidden = true; dicaAtual = ""; }
/* dentro de uma "area" (grade de vagas, colunas, barras) a dica nao some
   quando o mouse passa pelos espacos entre os itens */
document.addEventListener("mousemove", e => {
  const alvo = e.target.closest("[data-dica]");
  if (alvo) mostrarDica(alvo.dataset.dica, e.clientX, e.clientY);
  else if (dicaAtual && e.target.closest("[data-dica-area]")) mostrarDica(dicaAtual, e.clientX, e.clientY);
  else if (!dica.hidden) esconderDica();
});
document.addEventListener("focusin", e => {
  const alvo = e.target.closest("[data-dica]");
  if (!alvo) return;
  const r = alvo.getBoundingClientRect();
  mostrarDica(alvo.dataset.dica, r.left + r.width / 2, r.bottom);
});
document.addEventListener("focusout", esconderDica);
document.addEventListener("scroll", esconderDica, { passive: true });

/* conteudo padronizado das dicas: titulo, numero grande, linhas com a marca do grafico */
const dTit = t => `<div class="d-tit">${t}</div>`;
const dNum = (n, txt) => `<div class="d-num"><b>${n}</b><span>${txt}</span></div>`;
const dLinha = (marca, rot, val, cor) => `<div class="d-linha"><i class="d-m ${marca}"></i><span>${rot}</span><b class="d-v ${cor}">${val}</b></div>`;
const dRod = (txt, tipo) => `<div class="d-rod ${tipo}">${txt}</div>`;
const dExtra = t => `<div class="d-extra">${t}</div>`;

function dicaHalter(l) {
  const dif = l.prev - l.inf;
  return dTit(esc(l.f)) +
    dLinha("anel", "Postos previstos por mês", num(l.prev), "azul") +
    dLinha("ponto", "Trabalhadores informados", num(l.inf), "coral") +
    dRod(dif === 0 ? "Igual ao previsto" : dif > 0 ? `${num(dif)} ${dif === 1 ? "posto" : "postos"} sem ninguém` : `${num(-dif)} a mais que o previsto`,
      dif > 0 ? "falta" : dif < 0 ? "sobra" : "ok");
}
function dicaVaga(l) {
  return dTit(esc(l.f)) +
    dLinha("q-cheio", "Postos com trabalhador", num(Math.min(l.inf, l.prev)), "azul") +
    dLinha("q-vazio", "Postos sem ninguém", num(Math.max(0, l.prev - l.inf)), "coral") +
    (l.inf > l.prev ? dRod(`${num(l.inf - l.prev)} a mais que o previsto`, "sobra") : "") +
    dExtra(`${num(l.prev)} ${l.prev === 1 ? "posto previsto" : "postos previstos"} por mês no contrato`);
}

/* ---------------- componentes ---------------- */
function barrasH(el, linhas, total) {
  const max = Math.max(...linhas.map(l => l.val), 1);
  el.innerHTML = `<div class="barras-h" data-dica-area>${linhas.map(l => `
      <div class="rot">${esc(l.rot)}${l.sub ? `<small>${esc(l.sub)}</small>` : ""}</div>
      <div class="trilho" tabindex="0" data-dica="${esc(dTit(esc(l.rot)) + dNum(num(l.val), `trabalhadores${total ? ` · ${pct(l.val, total)}` : ""}`) + (l.extra ? dExtra(l.extra) : ""))}">
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
  document.getElementById("hero-muni").textContent = `${m.municipio}/${m.uf}`;
  document.getElementById("hero-contrato").textContent = nomeContrato(m);
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
  const DESTINO = ["#pontos", "#perfil", "#funcoes", "#unidades", "#contrato", "#contrato"];
  const cards = [
    [num(tot), "trabalhadores terceirizados", "na rede municipal de saúde", "var(--azul)"],
    [pct(fem, soma(sexo, "trabalhadores")), "são mulheres", `${num(fem)} de ${num(soma(sexo, "trabalhadores"))}`, "var(--azul)"],
    [num(funcoes), "funções diferentes", "de motorista a recepcionista", "var(--azul)"],
    [num(un.length), "unidades de saúde", `${ubs.length} UBS, ${ubsRural} na zona rural`, "var(--azul)"],
    ["1", "empresa contratada", m.empresa, "var(--azul)"],
    [`R$ ${num(m.valor_anual_contrato_rs / 1e6, 1)} mi`, "por ano no contrato", reais(m.valor_anual_contrato_rs), "var(--azul)"],
  ];
  const SETA = `<svg class="kpi-ir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  document.getElementById("kpis").innerHTML = cards.map(([v, r, d, c], i) =>
    `<a class="kpi" href="${DESTINO[i]}" style="--cor:${c}">${SETA}<div class="kpi-valor">${v.startsWith("R$ ") ? `<small class="kpi-pre">R$</small>${esc(v.slice(3))}` : esc(v)}</div><div class="kpi-rotulo">${esc(r)}</div><div class="kpi-detalhe">${esc(d)}</div></a>`).join("");
}

/* sexo: grafico de rosca (pizza com furo), com o total no meio */
function renderSexo() {
  const s = doMuni("perfil_sexo"), tot = soma(s, "trabalhadores");
  const cores = ["var(--serie-1)", "var(--serie-2)"];
  const R = 70, C = 2 * Math.PI * R, folga = s.length > 1 ? 3 : 0;
  let acum = 0;
  const arcos = s.map((r, i) => {
    const len = r.trabalhadores / tot * C;
    const a = `<circle class="arco" r="${R}" cx="95" cy="95" tabindex="0" style="stroke:${cores[i]};--len:${Math.max(0, len - folga).toFixed(2)};--c:${C.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}"
      data-dica="${esc(dTit(esc(r.sexo)) + dNum(num(r.trabalhadores), `trabalhadores · ${pct(r.trabalhadores, tot)}`))}"></circle>`;
    acum += len;
    return a;
  }).join("");
  document.getElementById("graf-sexo").innerHTML = `
    <div class="rosca-caixa" data-dica-area>
      <svg class="rosca" viewBox="0 0 190 190" role="img" aria-label="${esc(s.map(r => `${r.sexo}: ${num(r.trabalhadores)} (${pct(r.trabalhadores, tot)})`).join("; "))}">
        <g transform="rotate(-90 95 95)">${arcos}</g>
        <text class="rosca-num" x="95" y="96">${num(tot)}</text><text class="rosca-rot" x="95" y="118">pessoas</text>
      </svg>
      <ul class="rosca-leg">${s.map((r, i) => `<li><i style="background:${cores[i]}"></i><div><span class="rl-nome">${esc(r.sexo)}</span><b class="rl-pct">${pct(r.trabalhadores, tot)}</b><span class="rl-n">${num(r.trabalhadores)} pessoas</span></div></li>`).join("")}</ul>
    </div>
    ${detalhesTabela([{ t: "Sexo", k: "sexo" }, { t: "Trabalhadores", k: "trabalhadores", num: 1 }, { t: "%", f: r => pct(r.trabalhadores, tot), num: 1 }], s)}`;
}

/* faixa etaria: colunas com eixo e linhas de grade pontilhadas bem discretas */
function renderIdade(m) {
  const f = doMuni("perfil_faixa_etaria"), tot = soma(f, "trabalhadores");
  const max = Math.max(...f.map(r => r.trabalhadores));
  const { passo, topo } = passoBonito(max * 1.12);
  const marcas = [];
  for (let t = 0; t <= topo + 0.001; t += passo) marcas.push(t);
  document.getElementById("graf-idade").innerHTML = `
    <div class="colunas-area">
      <div class="colunas" data-dica-area>
        <div class="grade-y" aria-hidden="true">${marcas.map(t => `<div class="gy${t === 0 ? " zero" : ""}" style="bottom:${t / topo * 100}%"><span>${num(t)}</span></div>`).join("")}</div>
        ${f.map(r => `<div class="coluna" tabindex="0" data-dica="${esc(dTit(esc(r.faixa_etaria)) + dNum(num(r.trabalhadores), `trabalhadores · ${pct(r.trabalhadores, tot)}`))}">
          <span class="val">${num(r.trabalhadores)}</span><div class="barra" style="height:${r.trabalhadores / topo * 100}%"></div></div>`).join("")}
      </div>
      <div class="colunas-rot">${f.map(r => `<span>${esc(r.faixa_etaria.replace(" anos", ""))}</span>`).join("")}</div>
    </div>
    ${detalhesTabela([{ t: "Faixa", k: "faixa_etaria" }, { t: "Trabalhadores", k: "trabalhadores", num: 1 }, { t: "%", f: r => pct(r.trabalhadores, tot), num: 1 }], f)}`;
  const dif = m.total_trabalhadores - tot;
  document.getElementById("nota-idade").textContent = dif
    ? `Idade em anos. As faixas somam ${num(tot)}, ${num(Math.abs(dif))} a ${dif > 0 ? "menos" : "mais"} que o total informado (${num(m.total_trabalhadores)}).`
    : "Idade em anos.";
}

/* numeros do topo: todos do mesmo tamanho, o maior que couber no quadro */
function ajustarKPIs() {
  const vals = [...document.querySelectorAll(".kpi-valor")];
  if (!vals.length || !vals[0].clientWidth) return;
  vals.forEach(v => { v.style.fontSize = ""; });
  let tam = parseFloat(getComputedStyle(vals[0]).fontSize);
  const cabe = () => vals.every(v => v.scrollWidth <= v.clientWidth + 1);
  while (!cabe() && tam > 16) { tam -= 1; vals.forEach(v => { v.style.fontSize = tam + "px"; }); }
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
  filtroSit = null;
  const caixa = document.getElementById("situacoes");
  caixa.innerHTML = sit.map(([s, c]) =>
    `<button type="button" class="mini mini-botao" aria-pressed="false" data-sit="${esc(s)}" style="--cor:${c}"><b>${cont(s)}</b><span>${SELO[s][1].toLowerCase().replace(/^./, x => x.toUpperCase())} (itens do contrato)</span></button>`).join("");
  caixa.onclick = e => {
    const b = e.target.closest("[data-sit]");
    if (!b) return;
    filtrarContrato(filtroSit === b.dataset.sit ? null : b.dataset.sit, true);
  };

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
  document.getElementById("graf-halteres").innerHTML = `<div class="halteres" data-dica-area>
    ${linhas.map(l => `<div class="rot">${esc(l.f)}</div>
      <div class="pista" tabindex="0" data-dica="${esc(dicaHalter(l))}">
        ${grades.map(t => `<i class="grade" style="left:${x(t)}%"></i>`).join("")}
        <i class="liga" style="left:${x(Math.min(l.prev, l.inf))}%;width:${x(Math.abs(l.prev - l.inf))}%"></i>
        <i class="p p1" style="left:${x(l.prev)}%"></i><i class="p p2" style="left:${x(l.inf)}%"></i>
      </div>`).join("")}
    <div></div><div class="eixo">${grades.map(t => `<span style="left:${x(t)}%">${num(t)}</span>`).join("")}</div>
  </div>`;

  filtrarContrato(null);
}

/* tabela item a item, com filtro pela situacao (clique nos quadros acima) */
let filtroSit = null;
function filtrarContrato(sit, abrir) {
  filtroSit = sit;
  const comp = doMuni("contratado_x_alocado");
  const lista = [...comp].filter(r => !sit || r.situacao === sit).sort((a, b) => a.item - b.item);
  document.querySelectorAll("#situacoes [data-sit]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sit === sit)));
  document.getElementById("filtro-contrato").innerHTML = sit
    ? `<p class="filtro-ativo">Mostrando só ${lista.length} ${lista.length === 1 ? "item" : "itens"}: <b>${esc(SELO[sit][1].toLowerCase())}</b>. <button type="button" class="link" id="limpar-contrato">Mostrar todos os ${comp.length}</button></p>`
    : "";
  const limpar = document.getElementById("limpar-contrato");
  if (limpar) limpar.onclick = () => filtrarContrato(null);
  document.getElementById("tab-contrato").innerHTML = tabela([
    { t: "Item", k: "item", num: 1 }, { t: "Função", k: "funcao" }, { t: "Regime", k: "regime" },
    { t: "Postos/mês", f: r => num(r.postos_por_mes), num: 1 }, { t: "Informados", k: "trabalhadores", num: 1 },
    { t: "Situação", html: r => selo(r.situacao) }, { t: "Custo mensal por posto", f: r => reais(r.valor_unitario_mensal_rs), num: 1 },
  ], lista);
  if (abrir) {
    const det = document.getElementById("det-contrato");
    det.open = true;
    marcarNavegacao();
    det.scrollIntoView({ behavior: reduzirMovimento ? "auto" : "smooth", block: "start" });
  }
}

function renderUnidades() {
  const u = doMuni("unidades");
  const sms = u.filter(r => r.citada_na_resposta_sms === "sim");
  const contaTipo = agrupar(sms.map(r => ({ ...r, um: 1 })), "tipo", "um").sort((a, b) => b.val - a.val);
  const corGrupo = { ubs: "var(--azul)", upa: "var(--coral)", esp: "var(--superficie)", outro: "var(--cinza)" };
  const caixa = document.getElementById("tipos-unidade");
  caixa.innerHTML =
    contaTipo.map(t => `<button type="button" class="mini mini-botao${grupoTipo(t.rot) === "esp" ? " anel" : ""}" aria-pressed="false" data-campo="tipo" data-valor="${esc(t.rot)}" style="--cor:${corGrupo[grupoTipo(t.rot)]}"><b>${t.val}</b><span>${esc(t.rot)}</span></button>`).join("") +
    `<button type="button" class="mini mini-botao" aria-pressed="false" data-campo="zona" data-valor="Rural" style="--cor:var(--areia)"><b>${sms.filter(r => r.zona === "Rural").length}</b><span>na zona rural</span></button>`;
  const regra = b => b.dataset.campo === "zona" ? r => r.zona === b.dataset.valor : r => r.tipo === b.dataset.valor;
  caixa.onmouseover = caixa.onfocusin = e => { const b = e.target.closest(".mini-botao"); if (b) destacarNoMapa(regra(b)); };
  caixa.onmouseleave = caixa.onfocusout = () => destacarNoMapa(null);
  caixa.onclick = e => {
    const b = e.target.closest(".mini-botao");
    if (!b) return;
    const ligado = b.getAttribute("aria-pressed") === "true";
    document.getElementById("filtro-tipo").value = "";
    document.getElementById("filtro-zona").value = "";
    if (!ligado) document.getElementById(b.dataset.campo === "zona" ? "filtro-zona" : "filtro-tipo").value = b.dataset.valor;
    filtrarUnidades();
    destacarNoMapa(null);
  };
  const leg = document.getElementById("legenda-mapa");
  leg.onmouseover = leg.onfocusin = e => { const s = e.target.closest("[data-grupo]"); if (s) destacarNoMapa(r => grupoTipo(r.tipo) === s.dataset.grupo); };
  leg.onmouseleave = leg.onfocusout = () => destacarNoMapa(null);

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
  document.getElementById("contagem-unidades").textContent = `(${lista.length} de ${base.length} locais)`;
  document.querySelectorAll("#tipos-unidade .mini-botao").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.campo === "zona" ? zona === b.dataset.valor && !tipo : tipo === b.dataset.valor && !zona)));
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

/* texto extra ("saiba mais") de cada dado que faltou */
function saibaMaisLacuna(campo, m) {
  const n = m.total_trabalhadores;
  if (/defici/i.test(campo)) {
    const cota = n < 100 ? 0 : n <= 200 ? 2 : n <= 500 ? 3 : n <= 1000 ? 4 : 5;
    return `<p>Empresas com 100 ou mais empregados têm de reservar de 2% a 5% das vagas para pessoas com deficiência ou reabilitadas pelo INSS (Lei 8.213/1991, art. 93).</p>` +
      (cota ? `<p>Só neste contrato são <b>${num(n)} trabalhadores</b>. Se esse fosse o total da empresa, a cota seria de ${cota}%: pelo menos <b>${num(Math.ceil(n * cota / 100))} pessoas</b>.</p>` : "") +
      `<p>A Lei de Licitações (Lei 14.133/2021, art. 116) obriga a empresa contratada a cumprir essa reserva durante todo o contrato e a comprovar isso sempre que a Prefeitura pedir.</p>`;
  }
  if (/ra[çc]a/i.test(campo)) {
    return `<p>Desde 2023, a Lei 14.553 obriga os empregadores a ter, nos registros de trabalho (como a ficha de admissão e a RAIS), um campo para a pessoa declarar a própria raça ou cor.</p>` +
      `<p>Ou seja, a empresa tem como informar esse dado. Com ele, daria para ver se há desigualdade racial no trabalho terceirizado da saúde.</p>`;
  }
  if (/escolar/i.test(campo)) {
    return `<p>O grau de instrução faz parte do cadastro de todo empregado no eSocial, o sistema do governo federal onde as empresas registram quem contratam.</p>` +
      `<p>Sem esse dado, não dá para saber se a formação das pessoas corresponde às funções que elas exercem.</p>`;
  }
  if (/lota|unidade/i.test(campo)) {
    return `<p>O próprio contrato (item 9.2.36) obriga a empresa a entregar todo mês ao fiscal da Prefeitura um relatório com o nome, o cargo e a lotação de cada trabalhador.</p>` +
      `<p>Com esse relatório, o mapa poderia mostrar quantas pessoas trabalham em cada unidade.</p>`;
  }
  if (/sal[áa]ri/i.test(campo)) {
    return `<p>Pelo item 9.2.36 do contrato, a empresa entrega todo mês os contracheques ao fiscal da Prefeitura. Ou seja, essa informação já chega à Prefeitura.</p>` +
      `<p>Atenção: o valor por posto que aparece no contrato é o custo total para o Município, e não o salário de quem trabalha.</p>`;
  }
  if (/benef/i.test(campo)) {
    return `<p>O vale-transporte é um direito previsto em lei (Lei 7.418/1985). Vale-alimentação e plano de saúde costumam vir da convenção coletiva de cada categoria.</p>` +
      `<p>Saber o que é pago mostraria se esses direitos estão sendo cumpridos.</p>`;
  }
  return "";
}

function renderLacunas(m) {
  const c = doMuni("campos_disponiveis").filter(r => /^Não|^Só a lista/.test(r.disponivel));
  const seta = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;
  const caixa = document.getElementById("lista-lacunas");
  caixa.innerHTML = c.map((r, i) => {
    const mais = saibaMaisLacuna(r.campo, m);
    return `<div class="lacuna${mais ? " tem-mais" : ""}"><div class="lacuna-topo"><div class="icone">${iconeLacuna(r.campo)}</div><span class="selo-falta">não informado</span></div><h4>${esc(r.campo)}</h4><p>${esc(r.disponivel === "Só a lista" ? "Veio só a lista de unidades, sem quantos trabalham em cada uma." : r.detalhe.replace(/^Idem$/, "Não foi fornecido pela Prefeitura."))}</p>` +
      (mais ? `<div class="lacuna-extra" id="lacuna-extra-${i}"><div><div class="lacuna-extra-in">${mais}</div></div></div>
        <button type="button" class="lacuna-mais" aria-expanded="false" aria-controls="lacuna-extra-${i}"><span>saiba mais</span>${seta}</button>` : "") +
      `</div>`;
  }).join("");
  caixa.onclick = e => {
    const b = e.target.closest(".lacuna-mais");
    if (!b) return;
    const aberta = b.closest(".lacuna").classList.toggle("aberta");
    b.setAttribute("aria-expanded", String(aberta));
    b.querySelector("span").textContent = aberta ? "fechar" : "saiba mais";
  };
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
  renderContrato(); renderVagas(); renderUnidades(); renderLacunas(m); renderMetodo();
  renderPontos(m);
  prepararRevelar();
  ajustarKPIs();
  atualizarMenu();
  sincronizarEscolhas();
}

/* ---------------- inicio ---------------- */
document.querySelectorAll(".abas button").forEach(b => b.addEventListener("click", () => {
  document.querySelectorAll(".abas button").forEach(x => x.setAttribute("aria-selected", x === b));
  vistaFuncoes = b.dataset.vista;
  renderFuncoes(D.municipios.find(r => r.municipio === muni));
}));
["busca-unidade", "filtro-tipo", "filtro-zona", "filtro-so-sms"].forEach(id =>
  document.getElementById(id).addEventListener("input", filtrarUnidades));

Promise.all([
  ...ARQUIVOS.map(a => fetch(`dados/${a}.csv`).then(r => { if (!r.ok) throw new Error(a); return r.text(); })
    .then(t => { D[a] = lerCSV(t); })),
  /* lista dos municipios pesquisados: se faltar, a capa mostra so os que tem dados */
  fetch("dados/municipios_pesquisados.csv").then(r => r.ok ? r.text() : "municipio\n").catch(() => "municipio\n")
    .then(t => { D.municipios_pesquisados = lerCSV(t); }),
])
  .then(() => {
    const pedido = new URLSearchParams(location.search).get("municipio");
    muni = temDados(pedido) ? pedido : D.municipios[0].municipio;
    iniciarEscolhas();
    if (temDados(pedido)) mostrarPainel(false);
    else mostrarCapa();
  })
  .catch(err => {
    const msg = `Não foi possível carregar os dados (${esc(err.message)}). Se você abriu o arquivo direto do computador, use o atalho <b>ver_painel_no_computador.bat</b>; o navegador bloqueia a leitura dos dados quando a página é aberta como arquivo.`;
    const e = document.getElementById("erro");
    e.hidden = false; e.innerHTML = msg;
    const c = document.getElementById("capa-erro");
    if (c) { c.hidden = false; c.innerHTML = msg; }
  });

/* =====================================================================
   1. CADA PONTO E UMA PESSOA (pontos que se reorganizam ao rolar)
   ===================================================================== */
const CINZA = "var(--cinza)";
let passoAtual = 0, pontosEtapas = [];

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

function layoutPontos(grupos, W, s) {
  const rotH = 22, gap = 18;
  const cols = Math.max(10, Math.floor(W / s));
  const pos = [], rots = [], seps = [];
  let y = 0;
  grupos.forEach((g, gi) => {
    rots.push({ y: y + 14, g });
    y += rotH;
    for (let k = 0; k < g.n; k++) pos.push({ x: (k % cols) * s + s / 2, y: y + Math.floor(k / cols) * s + s / 2, cor: g.cor });
    y += Math.ceil(g.n / cols) * s;
    if (gi < grupos.length - 1) seps.push(y + gap / 2);
    y += gap;
  });
  const fim = y - gap + 8;
  const fecho = grupos.length > 1 ? fim : null;
  return { pos, rots, seps, fecho, total: grupos.reduce((a, g) => a + g.n, 0), h: fecho === null ? fim : fim + 26, s };
}

function renderPontos(m) {
  const svg = document.getElementById("svg-pontos");
  pontosEtapas = etapasPontos(m);
  passoAtual = 0;
  const n = pontosEtapas.length;
  document.getElementById("passos").innerHTML = pontosEtapas.map((e, i) =>
    `<div class="passo${i === 0 ? " ativo" : ""}" data-passo="${i}" aria-hidden="${i !== 0}"><div class="passo-cartao"><span class="passo-num">${i + 1} de ${n}</span><p>${e.texto}</p></div></div>`).join("");
  document.getElementById("progresso").innerHTML = pontosEtapas.map((e, i) =>
    `<button type="button" class="seg${i === 0 ? " feito" : ""}" data-ir="${i}" aria-label="Ir para a etapa ${i + 1} de ${n}"><span></span></button>`).join("");
  svg.innerHTML = `<g class="rotulos"></g>` + Array.from({ length: m.total_trabalhadores }, () => `<circle class="pt" cx="0" cy="0" r="3"></circle>`).join("");
  configurarHistoria();
  desenharPontos(true);
  ativarPasso(0, true);
}

function desenharPontos(semAnim) {
  const svg = document.getElementById("svg-pontos");
  if (!svg || !pontosEtapas.length) return;
  const caixa = svg.parentElement, cs = getComputedStyle(caixa);
  const W = Math.floor(caixa.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
  if (W <= 0) return;
  /* altura livre no quadro; os pontos de cada etapa ficam do maior tamanho que couber */
  const alt = Math.floor(caixa.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
  const grupos = pontosEtapas[passoAtual].grupos;
  let L;
  if (alt > 120) {
    for (let t = 26; t >= 4; t -= 0.5) { L = layoutPontos(grupos, W, t); if (L.h <= alt) break; }
  } else L = layoutPontos(grupos, W, W < 480 ? 7 : 9);
  const H = Math.max(alt > 120 ? alt : 0, L.h);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.style.height = H + "px";
  const pts = svg.querySelectorAll(".pt"), n = pts.length;
  const dy = Math.round((H - L.h) / 2); /* cada etapa fica centralizada no quadro */
  const raio = Math.min(L.s * 0.38, 9);
  pts.forEach((c, i) => {
    const p = L.pos[i];
    if (semAnim) c.style.transition = "none";
    c.setAttribute("r", raio.toFixed(2));
    c.style.r = raio.toFixed(2) + "px";
    c.style.transitionDelay = semAnim ? "0ms" : `${Math.round(i / n * 450)}ms`;
    if (p) { c.style.transform = `translate(${p.x}px, ${p.y + dy}px)`; c.style.fill = p.cor; c.style.opacity = 1; }
    else c.style.opacity = 0;
  });
  if (semAnim) { svg.getBoundingClientRect(); pts.forEach(c => { c.style.transition = ""; }); }
  const g = svg.querySelector(".rotulos");
  g.classList.remove("mostra");
  /* linhas entre os grupos e um fecho com o total: deixam claro onde cada grupo termina */
  g.innerHTML = L.rots.map(r =>
    `<text x="0" y="${r.y + dy}"><tspan class="r-nome">${esc(r.g.rot)}</tspan><tspan class="r-num" dx="8">${num(r.g.n)}${L.rots.length > 1 ? ` (${pct(r.g.n, L.total)})` : ""}</tspan></text>`).join("") +
    L.seps.map(y => `<line class="sep" x1="0" x2="${W}" y1="${y + dy}" y2="${y + dy}"></line>`).join("") +
    (L.fecho !== null ? `<line class="fecho" x1="0" x2="${W}" y1="${L.fecho + dy}" y2="${L.fecho + dy}"></line><text class="r-total" x="${W}" y="${L.fecho + dy + 18}" text-anchor="end">Total: ${num(L.total)} pessoas</text>` : "");
  requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("mostra")));
  svg.setAttribute("aria-label", "Gráfico de pontos, cada ponto é um trabalhador. " + L.rots.map(r => `${r.g.rot}: ${r.g.n}`).join("; "));
}

/* ---------- passo a passo: cada movimento de rolagem avanca uma etapa ---------- */
const hist = { passo: 480 };
let travado = false, tTrava = 0, ultimoWheel = 0, navegando = false, tNav = 0;
let passoAnimAte = 0, yAnterior = scrollY, toqueY = null, toqueDentro = false;

function alturaTela() { return document.documentElement.clientHeight || innerHeight; }
function alturaTopo() {
  const t = document.querySelector(".topo");
  const h = t ? t.offsetHeight : 0;
  raiz.style.setProperty("--topo-h", h + "px");
  return h;
}
function configurarHistoria() {
  const el = document.getElementById("historia"), palco = document.getElementById("palco");
  if (!el || !palco || !pontosEtapas.length || naCapa()) return;
  const vh = alturaTela(), th = alturaTopo();
  hist.passo = Math.round(vh * 0.6);
  palco.style.height = (vh - th) + "px";
  el.style.height = (vh - th + (pontosEtapas.length - 1) * hist.passo + Math.round(hist.passo * 0.35)) + "px";
}
function limitesHistoria() {
  const el = document.getElementById("historia");
  const th = parseFloat(raiz.style.getPropertyValue("--topo-h")) || 0;
  const ini = el.getBoundingClientRect().top + scrollY - th;
  return { ini, fim: ini + (pontosEtapas.length - 1) * hist.passo };
}
function dentroDaHistoria(y = scrollY) {
  if (!pontosEtapas.length || naCapa()) return false;
  const { ini, fim } = limitesHistoria();
  return y >= ini - 3 && y <= fim + 3;
}
/* rolagens feitas por links do menu, do mapa etc. passam direto pela historia */
function marcarNavegacao(ms = 1400) {
  navegando = true;
  clearTimeout(tNav);
  tNav = setTimeout(() => { navegando = false; yAnterior = scrollY; }, ms);
}
document.addEventListener("click", e => { if (e.target.closest('a[href^="#"]')) marcarNavegacao(); });

function ativarPasso(i, forcar) {
  const n = pontosEtapas.length;
  if (!n || (i === passoAtual && !forcar)) return;
  const mudou = i !== passoAtual;
  passoAtual = i;
  document.querySelectorAll("#passos .passo").forEach(p => {
    const k = +p.dataset.passo;
    p.classList.toggle("ativo", k === i);
    p.classList.toggle("antes", k < i);
    p.setAttribute("aria-hidden", String(k !== i));
  });
  document.querySelectorAll("#progresso .seg").forEach((b, k) => {
    b.classList.toggle("feito", k <= i);
    if (k === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
  });
  document.getElementById("passo-ant").disabled = i === 0;
  document.getElementById("passo-prox").disabled = i === n - 1;
  document.getElementById("palco-dica").textContent = i === n - 1 ? "Pronto! Continue rolando para seguir" : "Role a tela para ver a próxima";
  if (mudou) desenharPontos(reduzirMovimento);
}
function irParaPasso(k) {
  if (!pontosEtapas.length) return;
  k = Math.max(0, Math.min(pontosEtapas.length - 1, k));
  const { ini } = limitesHistoria();
  passoAnimAte = performance.now() + 850;
  window.scrollTo({ top: Math.round(ini + k * hist.passo), behavior: reduzirMovimento ? "instant" : "smooth" });
  ativarPasso(k);
}
function pararEm(top, k) {
  window.scrollTo({ top: Math.round(top), behavior: "instant" });
  yAnterior = Math.round(top);
  passoAnimAte = performance.now() + 150;
  ativarPasso(k);
}

/* mouse e touchpad: um "giro" da rodinha = uma etapa */
addEventListener("wheel", e => {
  if (!pontosEtapas.length || naCapa() || navegando || e.ctrlKey) return;
  if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
  const agora = performance.now();
  const px = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? alturaTela() : 1);
  const y = scrollY, { ini, fim } = limitesHistoria(), dentro = y >= ini - 3 && y <= fim + 3;
  if (travado) {
    /* espera o gesto terminar (o touchpad continua mandando movimento por inercia) */
    if (agora - ultimoWheel > 200 && agora - tTrava > 500) travado = false;
    else { ultimoWheel = agora; if (dentro) e.preventDefault(); return; }
  }
  ultimoWheel = agora;
  const n = pontosEtapas.length;
  let alvo = null;
  if (!dentro) {
    if (px > 0 && y < ini - 3 && y + px > ini - 3) alvo = 0;            /* chegando por cima: para na 1a etapa */
    else if (px < 0 && y > fim + 3 && y + px < fim + 3) alvo = n - 1;   /* voltando por baixo: para na ultima */
  } else if (px > 0 && passoAtual < n - 1) alvo = passoAtual + 1;
  else if (px < 0 && passoAtual > 0) alvo = passoAtual - 1;
  if (alvo === null) return;
  e.preventDefault();
  travado = true; tTrava = agora;
  irParaPasso(alvo);
}, { passive: false });

/* celular: um deslize = uma etapa */
addEventListener("touchstart", e => {
  if (e.touches.length !== 1) { toqueY = null; return; }
  toqueY = e.touches[0].clientY;
  toqueDentro = dentroDaHistoria();
}, { passive: true });
addEventListener("touchmove", e => {
  if (!toqueDentro || toqueY === null) return;
  const dy = toqueY - e.touches[0].clientY;
  if ((dy > 0 && passoAtual < pontosEtapas.length - 1) || (dy < 0 && passoAtual > 0)) e.preventDefault();
}, { passive: false });
addEventListener("touchend", e => {
  if (!toqueDentro || toqueY === null) return;
  const dy = toqueY - e.changedTouches[0].clientY;
  toqueY = null;
  if (Math.abs(dy) < 30) return;
  if (dy > 0 && passoAtual < pontosEtapas.length - 1) irParaPasso(passoAtual + 1);
  else if (dy < 0 && passoAtual > 0) irParaPasso(passoAtual - 1);
}, { passive: true });

/* teclado: setas e Page Up/Down andam uma etapa */
addEventListener("keydown", e => {
  if (!dentroDaHistoria() || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target.closest("input, select, textarea, button, a, [role=listbox]")) return;
  const n = pontosEtapas.length;
  if (["ArrowDown", "PageDown", " "].includes(e.key) && passoAtual < n - 1) { e.preventDefault(); irParaPasso(passoAtual + 1); }
  else if (["ArrowUp", "PageUp"].includes(e.key) && passoAtual > 0) { e.preventDefault(); irParaPasso(passoAtual - 1); }
});

/* qualquer outra rolagem: acompanha a etapa e segura quem chega rapido demais */
addEventListener("scroll", () => {
  const y = scrollY;
  if (pontosEtapas.length && !naCapa() && !navegando && performance.now() > passoAnimAte) {
    const { ini, fim } = limitesHistoria(), n = pontosEtapas.length;
    const salto = Math.abs(y - yAnterior) < alturaTela() * 1.5;
    if (salto && yAnterior < ini - 4 && y > ini + 4 && y <= fim) return pararEm(ini, 0);
    if (salto && yAnterior > fim + 4 && y < fim - 4 && y >= ini) return pararEm(fim, n - 1);
    ativarPasso(Math.max(0, Math.min(n - 1, Math.round((y - ini) / hist.passo))));
  }
  yAnterior = y;
}, { passive: true });

document.getElementById("progresso").addEventListener("click", e => { const b = e.target.closest("[data-ir]"); if (b) irParaPasso(+b.dataset.ir); });
document.getElementById("passo-ant").addEventListener("click", () => irParaPasso(passoAtual - 1));
document.getElementById("passo-prox").addEventListener("click", () => irParaPasso(passoAtual + 1));

/* barrinha de rolagem do menu (celular) */
function atualizarMenu() {
  const nav = document.querySelector(".menu"), caixa = document.querySelector(".menu-caixa"), barra = document.querySelector(".menu-trilho span");
  if (!nav || !caixa || !nav.clientWidth) return;
  const sobra = nav.scrollWidth - nav.clientWidth;
  caixa.classList.toggle("rola", sobra > 2);
  caixa.classList.toggle("no-fim", nav.scrollLeft >= sobra - 2);
  if (sobra > 2 && barra) {
    barra.style.width = (nav.clientWidth / nav.scrollWidth * 100) + "%";
    barra.style.left = (nav.scrollLeft / nav.scrollWidth * 100) + "%";
  }
}
document.querySelector(".menu")?.addEventListener("scroll", atualizarMenu, { passive: true });

let tempoRedim;
function aoRedimensionar() {
  if (naCapa()) return;
  configurarHistoria();
  desenharPontos(true);
  ajustarKPIs();
  atualizarMenu();
  if (mapa) mapa.invalidateSize();
}
addEventListener("resize", () => { clearTimeout(tempoRedim); tempoRedim = setTimeout(aoRedimensionar, 150); });
document.fonts?.ready.then(() => aoRedimensionar());

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
    const dica = esc(dicaVaga(l));
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

/* as cores dos pontos vem do CSS, para acompanhar o modo claro ou escuro */
function estiloTipo(t) {
  const css = getComputedStyle(document.documentElement), cor = n => css.getPropertyValue(n).trim();
  const fundo = cor("--superficie");
  if (t === "UBS") return { fillColor: cor("--azul"), color: fundo, weight: 2 };
  if (t === "UPA" || t === "Urgência") return { fillColor: cor("--coral"), color: fundo, weight: 2 };
  if (t === "Cemitério" || t === "Outro") return { fillColor: cor("--cinza"), color: fundo, weight: 2 };
  return { fillColor: fundo, color: cor("--azul"), weight: 3 };
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
    mk.tipo = r.tipo; mk.dados = r; mk.fo = temQtd ? 0.75 : 1;
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
  marcarNavegacao();
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
  }), { threshold: 0, rootMargin: "0px 0px -8% 0px" });
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

/* =====================================================================
   5. MODO CLARO / ESCURO
   O modo inicial segue o do computador ou celular; a escolha da pessoa
   fica guardada neste navegador. Ha um botao na capa e outro no topo.
   ===================================================================== */
(function () {
  const botoes = document.querySelectorAll(".botao-modo");
  const meta = document.querySelector('meta[name="theme-color"]');
  const ajustar = () => {
    const escuro = raiz.dataset.modo === "escuro";
    const txt = escuro ? "Ativar modo claro" : "Ativar modo escuro";
    botoes.forEach(b => { b.setAttribute("aria-label", txt); b.title = txt; });
    if (meta) meta.content = escuro ? "#15223A" : "#FFFFFF";
    destacarNoMapa(null);
  };
  const aplicar = modo => {
    raiz.dataset.modo = modo;
    try { localStorage.setItem("modo", modo); } catch (e) {}
    ajustar();
  };
  botoes.forEach(b => b.addEventListener("click", () => {
    const novo = raiz.dataset.modo === "escuro" ? "claro" : "escuro";
    /* troca suave: a pagina inteira se funde de um modo para o outro, de uma vez so */
    if (document.startViewTransition && !reduzirMovimento) document.startViewTransition(() => aplicar(novo));
    else aplicar(novo);
  }));
  /* durante a fusao o navegador cobre a pagina com uma "foto" e os cliques caem nela;
     se o clique cair em cima do botao, repassa para o botao (cliques rapidos nao se perdem) */
  document.addEventListener("click", e => {
    if (e.target !== raiz) return;
    const b = [...botoes].find(x => {
      const r = x.getBoundingClientRect();
      return r.width && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    });
    if (b) { e.stopImmediatePropagation(); b.click(); }
  }, true);
  /* se a pessoa ainda nao escolheu, acompanha a troca do sistema */
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", e => {
    let salvo = null;
    try { salvo = localStorage.getItem("modo"); } catch (err) {}
    if (!salvo) { raiz.dataset.modo = e.matches ? "escuro" : "claro"; ajustar(); }
  });
  ajustar();
})();

/* =====================================================================
   6. INTERACOES EXTRAS
   ===================================================================== */
/* grupo de cor de cada tipo de unidade (o mesmo da legenda do mapa) */
function grupoTipo(t) {
  if (t === "UBS") return "ubs";
  if (t === "UPA" || t === "Urgência") return "upa";
  if (t === "Cemitério" || t === "Outro") return "outro";
  return "esp";
}

/* acende no mapa so as unidades que passam no teste; null volta ao normal */
function destacarNoMapa(teste) {
  marcadores.forEach(mk => {
    const liga = !teste || teste(mk.dados);
    mk.setStyle({ ...estiloTipo(mk.tipo), opacity: liga ? 1 : 0.15, fillOpacity: liga ? mk.fo : 0.1 });
    if (teste && liga) mk.bringToFront();
  });
  const el = document.getElementById("mapa");
  if (el) el.classList.toggle("destacando", !!teste);
}

/* icones simples, um para cada dado que faltou */
const ICONES_LACUNA = [
  [/ra[çc]a|cor/i, '<circle cx="9" cy="8" r="3.2"/><circle cx="16.5" cy="9.5" r="2.6"/><path d="M3.5 20c0-3.3 2.5-5.6 5.5-5.6s5.5 2.3 5.5 5.6"/><path d="M14.8 14.6c.5-.1 1.1-.2 1.7-.2 2.5 0 4.5 1.9 4.5 4.6"/>'],
  [/escolar/i, '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.6c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11"/><path d="M21.5 9v5"/>'],
  [/defici/i, '<circle cx="11" cy="4.5" r="1.8"/><path d="M11 7.5v6h5.5l2.5 5.5"/><path d="M11 10.5h5"/><path d="M8.2 11.4a5.5 5.5 0 1 0 7.6 6.3"/>'],
  [/lota|unidade/i, '<path d="M4 21V8.5L12 4l8 4.5V21"/><path d="M2.5 21h19"/><path d="M12 9v5M9.5 11.5h5"/><path d="M10 21v-3.5h4V21"/>'],
  [/sal[áa]ri/i, '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>'],
  [/benef/i, '<rect x="3" y="9" width="18" height="4" rx="1"/><path d="M5 13v7.5h14V13"/><path d="M12 9v11.5"/><path d="M12 9c-1.6-3.6-5.5-4.2-5.5-1.6 0 1.6 2.6 1.6 5.5 1.6zM12 9c1.6-3.6 5.5-4.2 5.5-1.6 0 1.6-2.6 1.6-5.5 1.6z"/>'],
];
function iconeLacuna(campo) {
  const achado = ICONES_LACUNA.find(([re]) => re.test(campo));
  const corpo = achado ? achado[1] : '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;
}

/* =====================================================================
   7. CAPA E ESCOLHA DE MUNICIPIO E CONTRATO
   Os municipios pesquisados vem de dados/municipios_pesquisados.csv.
   So os que tem linha em dados/municipios.csv podem ser escolhidos;
   os outros aparecem em cinza.
   ===================================================================== */
const naCapa = () => raiz.classList.contains("na-capa");
const temDados = nome => !!nome && D.municipios.some(m => m.municipio === nome);
const nomeContrato = m => String(m.contrato).replace(/\s*\(.*\)\s*$/, "");
const AVISO_MUNI = "Os municípios em cinza ainda não têm dados publicados.";
let renderizado = null;
const escolhas = {};

function opcoesMunicipio() {
  const comDados = new Set(D.municipios.map(m => m.municipio));
  const todos = [...new Set([...(D.municipios_pesquisados || []).map(r => r.municipio).filter(Boolean), ...comDados])]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  return todos.map(nome => ({ valor: nome, rotulo: nome, desabilitado: !comDados.has(nome) }));
}
function opcoesContrato() {
  return D.municipios.filter(m => m.municipio === muni).map(m => ({ valor: nomeContrato(m), rotulo: nomeContrato(m), desc: m.empresa }));
}
function urlPainel() {
  const c = opcoesContrato()[0]?.valor || "";
  return `?municipio=${encodeURIComponent(muni)}&contrato=${encodeURIComponent(c)}`;
}

function iniciarEscolhas() {
  const aoMudarMuni = v => {
    muni = v;
    const oc = opcoesContrato();
    escolhas.contratoCapa.atualizar(oc, oc[0]?.valor);
    escolhas.contratoPainel.atualizar(oc, oc[0]?.valor);
    sincronizarEscolhas();
    if (!naCapa()) { history.replaceState(null, "", urlPainel()); renderTudo(); renderizado = muni; }
  };
  const oc = opcoesContrato();
  escolhas.muniCapa = criarEscolha(document.getElementById("esc-muni"), { opcoes: opcoesMunicipio(), valor: muni, rotuloId: "rot-muni", aviso: AVISO_MUNI, aoMudar: aoMudarMuni });
  escolhas.contratoCapa = criarEscolha(document.getElementById("esc-contrato"), { opcoes: oc, valor: oc[0]?.valor, rotuloId: "rot-contrato" });
  escolhas.muniPainel = criarEscolha(document.getElementById("troca-muni"), { compacto: true, textoBotao: "Mudar de município", opcoes: opcoesMunicipio(), valor: muni, aviso: AVISO_MUNI, aoMudar: aoMudarMuni });
  escolhas.contratoPainel = criarEscolha(document.getElementById("troca-contrato"), { compacto: true, textoBotao: "Ver outro contrato", opcoes: oc, valor: oc[0]?.valor });
  document.getElementById("botao-entrar").onclick = () => mostrarPainel(true);
}
function sincronizarEscolhas() {
  if (!escolhas.muniCapa) return;
  escolhas.muniCapa.definir(muni);
  escolhas.muniPainel.definir(muni);
}

function mostrarPainel(empurrar) {
  if (empurrar) history.pushState({ painel: 1 }, "", urlPainel());
  escolhaAberta?.fechar();
  raiz.classList.remove("na-capa");
  esconderDica();
  window.scrollTo({ top: 0, behavior: "instant" });
  yAnterior = 0;
  if (renderizado !== muni) { renderTudo(); renderizado = muni; }
  else aoRedimensionar();
}
function mostrarCapa() {
  raiz.classList.add("na-capa");
  esconderDica();
  escolhaAberta?.fechar();
  window.scrollTo({ top: 0, behavior: "instant" });
}
addEventListener("popstate", () => {
  const p = new URLSearchParams(location.search).get("municipio");
  if (temDados(p)) { muni = p; sincronizarEscolhas(); mostrarPainel(false); }
  else mostrarCapa();
});
document.querySelector(".topo .marca")?.addEventListener("click", e => {
  e.preventDefault();
  history.pushState(null, "", location.pathname);
  mostrarCapa();
});

/* ---------- lista de escolha (substitui o <select> para poder mostrar
   opcoes em cinza com aviso e ter a seta bem alinhada) ---------- */
let escolhaAberta = null;
function criarEscolha(caixa, cfg) {
  let opcoes = cfg.opcoes || [], valor = cfg.valor, foco = -1;
  const id = caixa.id;
  caixa.classList.add("escolha");
  if (cfg.compacto) caixa.classList.add("compacta");
  caixa.innerHTML = `<button type="button" class="escolha-botao" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-lista"${cfg.rotuloId ? ` aria-labelledby="${cfg.rotuloId} ${id}-txt"` : ""}>` +
    `<span class="escolha-txt" id="${id}-txt"></span><svg class="escolha-seta" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` +
    `<div class="escolha-lista" id="${id}-lista" role="listbox" tabindex="-1" hidden></div>`;
  const botao = caixa.querySelector(".escolha-botao"), lista = caixa.querySelector(".escolha-lista"), txt = caixa.querySelector(".escolha-txt");
  /* a lista fica direto no <body>: assim as animacoes da capa e do topo nao a deslocam nem a cortam */
  document.body.appendChild(lista);
  const OK = `<svg class="op-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

  const montar = () => {
    const sel = opcoes.find(o => o.valor === valor);
    txt.textContent = cfg.textoBotao || (sel ? sel.rotulo : "Nenhum disponível");
    lista.innerHTML = opcoes.map((o, i) =>
      `<div class="escolha-op" role="option" id="${id}-op${i}" data-i="${i}" aria-selected="${o.valor === valor}"${o.desabilitado ? ' aria-disabled="true"' : ""}>` +
      `<span class="op-txt"><span class="op-nome">${esc(o.rotulo)}</span>${o.desc ? `<span class="op-desc">${esc(o.desc)}</span>` : ""}</span>` +
      (o.desabilitado ? `<span class="op-tag">sem dados</span>` : OK) + `</div>`).join("") +
      (cfg.aviso && opcoes.some(o => o.desabilitado) ? `<p class="escolha-aviso">${esc(cfg.aviso)}</p>` : "");
    botao.disabled = !opcoes.length;
  };
  const habilitados = () => opcoes.map((o, i) => (o.desabilitado ? -1 : i)).filter(i => i >= 0);
  const marcarFoco = i => {
    foco = i;
    lista.querySelectorAll(".escolha-op").forEach(el => el.classList.toggle("foco", +el.dataset.i === i));
    if (i < 0) return;
    lista.setAttribute("aria-activedescendant", `${id}-op${i}`);
    /* rola so dentro da lista (nao a pagina) para a opcao ficar visivel */
    const el = document.getElementById(`${id}-op${i}`);
    if (el && el.offsetTop < lista.scrollTop) lista.scrollTop = el.offsetTop - 6;
    else if (el && el.offsetTop + el.offsetHeight > lista.scrollTop + lista.clientHeight) lista.scrollTop = el.offsetTop + el.offsetHeight - lista.clientHeight + 6;
  };
  const posicionar = () => {
    const r = botao.getBoundingClientRect();
    lista.style.minWidth = Math.max(r.width, 230) + "px";
    const h = lista.offsetHeight, w = lista.offsetWidth;
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8 && r.top - h - 6 > 8) top = r.top - h - 6;
    lista.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
    lista.style.top = top + "px";
  };
  const abrir = () => {
    if (escolhaAberta && escolhaAberta !== api) escolhaAberta.fechar();
    lista.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    posicionar();
    const atual = opcoes.findIndex(o => o.valor === valor);
    marcarFoco(atual >= 0 && !opcoes[atual].desabilitado ? atual : (habilitados()[0] ?? -1));
    lista.focus({ preventScroll: true });
    escolhaAberta = api;
  };
  const fechar = devolver => {
    if (lista.hidden) return;
    lista.hidden = true;
    botao.setAttribute("aria-expanded", "false");
    if (escolhaAberta === api) escolhaAberta = null;
    if (devolver) botao.focus({ preventScroll: true });
  };
  const escolher = i => {
    const o = opcoes[i];
    if (!o) return;
    if (o.desabilitado) { /* chama atencao para o aviso */
      const av = lista.querySelector(".escolha-aviso");
      if (av) { av.classList.remove("pulsa"); void av.offsetWidth; av.classList.add("pulsa"); }
      return;
    }
    const mudou = o.valor !== valor;
    valor = o.valor;
    montar();
    fechar(true);
    if (mudou && cfg.aoMudar) cfg.aoMudar(valor);
  };
  botao.addEventListener("click", () => (lista.hidden ? abrir() : fechar()));
  botao.addEventListener("keydown", e => { if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); abrir(); } });
  lista.addEventListener("click", e => { const op = e.target.closest(".escolha-op"); if (op) escolher(+op.dataset.i); });
  lista.addEventListener("keydown", e => {
    const hab = habilitados(), p = hab.indexOf(foco);
    if (e.key === "ArrowDown") { e.preventDefault(); marcarFoco(hab[Math.min(hab.length - 1, p + 1)]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarFoco(hab[Math.max(0, p - 1)]); }
    else if (e.key === "Home") { e.preventDefault(); marcarFoco(hab[0]); }
    else if (e.key === "End") { e.preventDefault(); marcarFoco(hab[hab.length - 1]); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(foco); }
    else if (e.key === "Escape") { e.preventDefault(); fechar(true); }
    else if (e.key === "Tab") fechar();
  });
  const api = {
    fechar,
    definir(v) { valor = v; montar(); },
    atualizar(ops, v) { opcoes = ops || []; valor = v; montar(); },
  };
  montar();
  return api;
}
document.addEventListener("mousedown", e => { if (escolhaAberta && !(e.target.closest && e.target.closest(".escolha, .escolha-lista"))) escolhaAberta.fechar(); });
addEventListener("scroll", () => escolhaAberta?.fechar(), { passive: true });
addEventListener("resize", () => escolhaAberta?.fechar());

/* desenho de pontos da capa (so decoracao, nas cores do ODSS) */
(function desenharCapa() {
  const svg = document.getElementById("capa-pontos");
  if (!svg) return;
  const cols = 13, lins = 11, s = 32;
  let semente = 11, h = "";
  const sorte = () => (semente = (semente * 9301 + 49297) % 233280) / 233280;
  for (let l = 0; l < lins; l++) for (let c = 0; c < cols; c++) {
    const v = sorte();
    const cls = v < 0.07 ? "c-coral" : v < 0.15 ? "c-areia" : v < 0.18 ? "c-laranja" : v < 0.19 ? "c-rosa" : "c-base";
    h += `<circle cx="${c * s + s / 2}" cy="${l * s + s / 2}" r="${cls === "c-base" ? 5 : 7}" class="${cls}" style="animation-delay:${(sorte() * 5).toFixed(2)}s"></circle>`;
  }
  svg.setAttribute("viewBox", `0 0 ${cols * s} ${lins * s}`);
  svg.innerHTML = h;
})();

/* =====================================================================
   8. (assinatura)
   ===================================================================== */
(function () {
  const TROCAS = 20, DURACAO = 30000; /* cada clique no botao de modo e uma troca */
  let vezes = 0, mostrando = false;
  /* cubo em 2D: tres faces 3x3 */
  const cubo = () => {
    const P = (o, a, b, u, v) => [o[0] + a[0] * u + b[0] * v, o[1] + a[1] * u + b[1] * v].map(n => +n.toFixed(2)).join(",");
    const faces = [
      { o: [3, 7], a: [9, -5], b: [9, 5], cor: "var(--areia)" },
      { o: [3, 7], a: [9, 5], b: [0, 10], cor: "var(--coral)" },
      { o: [12, 12], a: [9, -5], b: [0, 10], cor: "#00407D" },
    ];
    return `<svg viewBox="0 0 24 24" aria-hidden="true">` + faces.map(f => {
      const borda = `M${P(f.o, f.a, f.b, 0, 0)} L${P(f.o, f.a, f.b, 1, 0)} L${P(f.o, f.a, f.b, 1, 1)} L${P(f.o, f.a, f.b, 0, 1)}Z`;
      const grade = [1 / 3, 2 / 3].map(t => `M${P(f.o, f.a, f.b, t, 0)} L${P(f.o, f.a, f.b, t, 1)} M${P(f.o, f.a, f.b, 0, t)} L${P(f.o, f.a, f.b, 1, t)}`).join(" ");
      return `<path d="${borda}" fill="${f.cor}"/><path d="${grade}" stroke="#fff" stroke-width=".7" fill="none"/>`;
    }).join("") + `</svg>`;
  };
  const mostrar = () => {
    mostrando = true;
    const el = document.createElement("div");
    el.className = "assinatura";
    el.setAttribute("role", "note");
    el.innerHTML = `${cubo()}<span>Powered by FNVT</span>`;
    document.body.appendChild(el);
    /* fica preso na tela, logo acima do selo "Powered by Netlify" (que o Netlify poe no canto) */
    const posicionar = () => {
      const nf = [...document.querySelectorAll("iframe")].find(f => {
        const r = f.getBoundingClientRect();
        return getComputedStyle(f).position === "fixed" && r.width > 0 && r.bottom >= innerHeight - 4 && r.left > innerWidth / 2;
      });
      if (nf) {
        const r = nf.getBoundingClientRect();
        el.style.bottom = Math.round(innerHeight - r.top - 4) + "px";
        el.style.right = Math.max(8, Math.round(document.documentElement.clientWidth - r.right + 20)) + "px";
      } else { el.style.bottom = "20px"; el.style.right = "20px"; }
    };
    posicionar();
    const vigia = setInterval(posicionar, 1000); /* acompanha se o selo do Netlify carregar depois ou mudar de lugar */
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("visivel")));
    setTimeout(() => {
      el.classList.remove("visivel");
      setTimeout(() => { el.remove(); clearInterval(vigia); mostrando = false; }, 900);
    }, DURACAO);
  };
  document.addEventListener("click", e => {
    if (e.target === document.documentElement) return; /* clique durante a troca suave de cores: nao conta nem zera */
    if (!(e.target.closest && e.target.closest(".botao-modo"))) { vezes = 0; return; }
    if (++vezes >= TROCAS && !mostrando) { vezes = 0; mostrar(); }
  });
})();
