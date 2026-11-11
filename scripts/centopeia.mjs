// Gera o SVG animado do perfil: uma centopeia mecânica desce pelo gráfico de contribuições
// e o robô atira nela lá de baixo. Os dias com commit são cubos 3D que servem de obstáculo:
// ao bater num deles (ou na borda), a centopeia desce uma linha e volta. Segmento atingido
// explode; se for do meio, ela se parte em duas e cada metade segue com a própria cabeça.
//
// Uso:
//   GITHUB_TOKEN=... node scripts/centopeia.mjs --usuario ChMoreiraa --saida dist
//   node scripts/centopeia.mjs --entrada contrib.json --saida dist   (sem rede, para testar)
//
// Saída: centopeia-dark.svg e centopeia-light.svg na pasta --saida.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const usuario = args.usuario ?? process.env.GITHUB_REPOSITORY_OWNER;
const saida = args.saida ?? "dist";

// ---------- dados ----------

const QUERY = `query($login:String!){user(login:$login){contributionsCollection{contributionCalendar{
  totalContributions weeks{contributionDays{date contributionCount contributionLevel weekday}}}}}}`;

async function carregarCalendario() {
  if (args.entrada) {
    const json = JSON.parse((await readFile(args.entrada, "utf8")).replace(/^﻿/, ""));
    return json.data.user.contributionsCollection.contributionCalendar;
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token || !usuario) throw new Error("Faltam GITHUB_TOKEN e/ou --usuario.");
  const resp = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "perfil-centopeia" },
    body: JSON.stringify({ query: QUERY, variables: { login: usuario } }),
  });
  const json = await resp.json();
  if (!resp.ok || json.errors) throw new Error(`GraphQL falhou: ${resp.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar;
}

// ---------- paleta ----------

const NIVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const TEMAS = {
  dark: {
    vazio: "#1c1a26",
    niveis: [null, "#4c2f8f", "#6d46c9", "#8b5cf6", "#c4b5fd"],
    estrela: "#cbd5ff",
    hud: "#ece9f7",
    hudFraco: "#8f8aa8",
    sombra: "#000000",
    sombraOp: 0.55,
    linhaZona: "#2b2640",
    perna: "#aeb5c3",
  },
  light: {
    vazio: "#ece9f3",
    niveis: [null, "#c9b8fb", "#a487f8", "#7c4dee", "#4c1d95"],
    estrela: "#9a93b8",
    hud: "#241f33",
    hudFraco: "#6b6880",
    sombra: "#2a1f4d",
    sombraOp: 0.28,
    linhaZona: "#ddd6ee",
    perna: "#4b5263",
  },
};
const VERMELHO = "#ff2e4d";
const EXPLOSAO = ["#fff3b0", "#ffd166", "#ffb703", "#ff8c1a", "#ff5400", "#e63946"];

// Robô original em pixel (22 x 24 de corpo + 6 linhas de pernas): antena, capacete com visor de
// vidro (reflexo e olhos vermelhos atrás), ombreiras roxas, núcleo de energia no peito e
// propulsores nas costas. Ele segura um rifle de plasma, que é desenhado à parte e gira para mirar.
const CORPO = [
  "..........KK..........",
  "..........KP..........",
  ".......KKKKKKKK.......",
  ".....KKWWLLLLLMMKK....",
  "....KWWLLLLLLLLMMDK...",
  "....KWLLLLLLLLLMMDK...",
  "....KLKKKKKKKKKKKDK...",
  "....KLKvvVVVVVVVKDK...",
  "....KLKvVEEVVEEVKDK...",
  "....KLKVVVVVVVVVKDK...",
  "....KMKKKKKKKKKKKDK...",
  "....KMMMMPPPPMMMMDK...",
  ".....KDDMMMMMMDDK.....",
  ".......KKDDDDKK.......",
  "..KKKKKKKKKKKKKKKKKK..",
  ".KPPpKWLLLLLLLLMKPPpK.",
  ".KPPPKLLLKaaKLLMKPPPK.",
  ".KKKKKLLKaAAaKMMKKKKK.",
  "..KMKKLLKAAAAKMDKKMK..",
  "..KMKKLMKaAAaKMDKKMK..",
  "..KMKKMMMKaaKMMDKKMK..",
  "..KMK.KMMMMMMMDK.KMK..",
  "..KHK.KDDDDDDDDK.KMK..",
  "...K..KKKKKKKKKK..K...",
];
// pernas: parado e dois passos de caminhada
const PERNAS = {
  parado: [
    ".......KMMK.KMMK......",
    ".......KDMK.KDMK......",
    ".......KPPK.KPPK......",
    ".......KMMK.KMMK......",
    "......KBBBK.KBBBK.....",
    "......KKKKK.KKKKK.....",
  ],
  passoA: [
    ".......KMMK.KMMK......",
    "......KDMK..KDMK......",
    "......KPPK...KPPK.....",
    ".....KMMK....KMMK.....",
    "....KBBBK....KBBBK....",
    "....KKKKK....KKKKK....",
  ],
  passoB: [
    ".......KMMK.KMMK......",
    ".......KDMK..KDMK.....",
    "........KPPK.KPPK.....",
    "........KMMK..KMMK....",
    "........KBBBK.KBBBK...",
    "........KKKKK.KKKKK...",
  ],
};
// rifle de plasma apontado para cima (8 x 26); a coluna 4 é o eixo, a mão direita fica na linha 21
const RIFLE = [
  "...cc...",
  "..KccK..",
  ".KPKKPK.",
  "..KGGK..",
  "..KGGK..",
  "..KGLK..",
  "..KGGK..",
  "..KGGK..",
  "..KGLK..",
  "..KGGK..",
  "..KGGK..",
  ".KKGGKK.",
  ".KPpPpK.",
  ".KpPpPK.",
  ".KPpPpK.",
  "KKMMMMKK",
  "KLLMMMDK",
  "KLMMMMDK",
  "KHHKKMDK",
  ".KMMMMK.",
  "..KMMK..",
  "..KHHK..",
  "..KHHK..",
  "..KDDK..",
  "..KDDK..",
  "...KK...",
];
const COR_ROBO = {
  K: "#0f0d16", W: "#f6f8fc", L: "#d3d8e2", M: "#9aa2b3", D: "#5d6577", B: "#3b4150", H: "#c9ced8",
  V: "#1b2a4a", v: "#7dd3fc", E: VERMELHO, G: "#2e3340", c: VERMELHO, A: "#38bdf8", a: "#bae6fd",
  P: "#8b5cf6", p: "#c4b5fd", F: "#ffd166", f: "#ff6a1a",
};
const PX = 2;
const ALTURA_ROBO = (CORPO.length + PERNAS.parado.length) * PX;
const LARGURA_ROBO = CORPO[0].length * PX;
const PIVO = { x: 21 * PX, y: 21.5 * PX }; // onde a mão direita segura o rifle, ao lado do corpo
const RIFLE_PIVO = { x: 4 * PX, y: 21.5 * PX }; // o mesmo ponto, no desenho do rifle
const COMPRIMENTO_RIFLE = RIFLE_PIVO.y; // do eixo até a boca do cano
const ANGULO_MAX = 58; // graus, para cada lado
const COL_MIN_ROBO = 2; // nas colunas 0 e 1 o corpo do robô sairia pela esquerda

// ---------- geometria ----------

const CELULA = 10;
const PASSO = 13;
const MARGEM = 16;
const TOPO_GRADE = 36;
const LINHAS_GRADE = 7;
const LINHA_FUNDO = 10; // a centopeia desce até aqui, já fora da grade, na zona do robô
const BASE_GRADE = TOPO_GRADE + LINHAS_GRADE * PASSO - (PASSO - CELULA);
const ROBO_Y = TOPO_GRADE + (LINHA_FUNDO + 1) * PASSO + 2;
const ALTURA = ROBO_Y + ALTURA_ROBO + 28;
const cx = (c) => MARGEM + c * PASSO + CELULA / 2;
const cy = (l) => TOPO_GRADE + l * PASSO + CELULA / 2;
const PIVO_Y = ROBO_Y + PIVO.y; // altura do eixo do rifle na tela; o eixo fica sempre sobre a coluna do robô

/** Boca do cano quando o eixo está em (px, PIVO_Y) e o rifle gira `graus` (0 = para cima, + = direita). */
function bocaDoCano(px, graus) {
  const r = (graus * Math.PI) / 180;
  return [px + COMPRIMENTO_RIFLE * Math.sin(r), PIVO_Y - COMPRIMENTO_RIFLE * Math.cos(r)];
}

// ---------- tempo ----------

const INICIO = 1.0; // antes disso: READY? e os cubos se materializando
const TICK = 0.16; // segundos por casa andada
const VOO_LASER = 0.06;
const RECARGA = 6; // ticks entre tiros
const TAMANHO = 28; // segmentos da centopeia: uma bem comprida, que o robô vai picando
const MAX_TICKS = 1100;

// ---------- utilidades de animação ----------

let ciclo = 20;
const css = [];
let seq = 0;

/** Cria um @keyframes a partir de [segundos, "propriedades"] e devolve o nome da classe. */
function anima(paradas) {
  const nome = `a${(seq++).toString(36)}`;
  let ultimo = -1;
  const corpo = paradas
    .map(([t, regra]) => {
      let p = Math.max(0, Math.min(100, (t / ciclo) * 100));
      if (p <= ultimo) p = Math.min(100, ultimo + 0.005);
      ultimo = p;
      return `${+p.toFixed(3)}%{${regra}}`;
    })
    .join("");
  css.push(`@keyframes ${nome}{${corpo}}.${nome}{animation:${nome} ${ciclo}s linear infinite}`);
  return nome;
}

/** Clareia (f > 0) ou escurece (f < 0) uma cor #rrggbb. */
function tom(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  return (
    "#" +
    [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) => Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, "0"))
      .join("")
  );
}

function aleatorio(semente) {
  let s = semente;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

// ---------- simulação ----------

function simular(semanas) {
  const colunas = semanas.length;
  const obstaculo = new Set();
  semanas.forEach((s, c) => s.contributionDays.forEach((d) => d.contributionCount > 0 && obstaculo.add(`${c},${d.weekday}`)));
  const bloqueado = (c, l) => c < 0 || c >= colunas || obstaculo.has(`${c},${l}`);

  // segmentos são entidades fixas; as centopeias são listas delas (a primeira é a cabeça)
  const segs = Array.from({ length: TAMANHO }, (_, i) => ({
    id: i,
    pos: [[-2 - i, 0]], // posição por tick
    morte: null,
    cabecaDesde: i === 0 ? 0 : null,
  }));
  // `fundo` é a linha mais baixa que cada pedaço visita: a maioria passeia só entre os commits (0 a 6)
  let centopeias = [{ corpo: segs.map((s) => s.id), dir: 1, vdir: 1, fundo: LINHAS_GRADE - 1 }];
  const tiros = [];
  const robo = [[Math.floor(colunas / 2), 0]]; // [coluna, tick]
  let roboCol = Math.floor(colunas / 2);
  let recarga = 0;
  let tick = 0;
  let modo = "persegue";
  let semAlvo = 0;
  let maxPedacos = 1;
  const sorte = aleatorio(colunas * 131 + obstaculo.size);

  const ondeEsta = (id) => segs[id].pos.at(-1);

  while (centopeias.length && tick < MAX_TICKS) {
    tick++;
    // 1) anda: a cabeça decide, o corpo segue
    for (const cp of centopeias) {
      const anteriores = cp.corpo.map(ondeEsta);
      const [hc, hl] = anteriores[0];
      let prox;
      const entrando = hc < 0; // ainda fora da tela pela esquerda: só avança
      if (entrando || !bloqueado(hc + cp.dir, hl)) {
        prox = [hc + cp.dir, hl];
      } else {
        let nl = hl + cp.vdir;
        if (nl > cp.fundo) { cp.vdir = -1; nl = hl - 1; }
        if (nl < 0) { cp.vdir = 1; nl = hl + 1; }
        prox = [hc, nl];
        cp.dir = -cp.dir;
      }
      cp.corpo.forEach((id, i) => segs[id].pos.push(i === 0 ? prox : anteriores[i - 1]));
    }
    for (const s of segs) if (s.morte != null && s.pos.length <= tick) s.pos.push(s.pos.at(-1));

    // 2) o robô alterna dois modos:
    //    "persegue": anda até a coluna do segmento mais baixo e atira reto para cima;
    //    "segura": fica onde está, gira o rifle e atira na diagonal, de longe.
    //    Os blocos de commit seguram o tiro em qualquer ângulo.
    const vivos = centopeias.flatMap((cp) => cp.corpo).map((id) => ({ id, p: ondeEsta(id) })).filter((v) => v.p[0] >= 0);
    /** Segue a linha do cano até o alvo e devolve o primeiro segmento atingido (ou null se um bloco segurar). */
    const linhaDeTiro = (alvo) => {
      const px = cx(roboCol);
      const tx = cx(alvo.p[0]), ty = cy(alvo.p[1]);
      const graus = (Math.atan2(tx - px, PIVO_Y - ty) * 180) / Math.PI;
      if (Math.abs(graus) > ANGULO_MAX) return null;
      const [bx, by] = bocaDoCano(px, graus);
      const dist = Math.hypot(tx - bx, ty - by);
      for (let s = 0; s <= dist; s += 2) {
        const x = bx + ((tx - bx) * s) / dist, y = by + ((ty - by) * s) / dist;
        const atingido = vivos.find((v) => Math.hypot(cx(v.p[0]) - x, cy(v.p[1]) - y) < 6);
        if (atingido) return { atingido, graus, boca: [bx, by], impacto: [cx(atingido.p[0]), cy(atingido.p[1])] };
        const c = Math.floor((x - MARGEM) / PASSO), r = Math.floor((y - TOPO_GRADE + 3) / PASSO);
        const dentro = x - MARGEM - c * PASSO <= CELULA && y - TOPO_GRADE + 3 - r * PASSO <= CELULA + 3;
        if (dentro && r >= 0 && r < LINHAS_GRADE && obstaculo.has(`${c},${r}`)) return null;
      }
      return null;
    };
    // quanto mais no meio de um pedaço comprido, mais o tiro parte a centopeia: é o que ele prefere
    const indice = new Map();
    centopeias.forEach((cp) => cp.corpo.forEach((id, i) => indice.set(id, Math.min(i, cp.corpo.length - 1 - i))));
    const valor = (id) => indice.get(id) ?? 0;
    const tirosPossiveis = vivos.map(linhaDeTiro).filter(Boolean);
    const retos = tirosPossiveis.filter((t) => Math.abs(t.graus) < 4);
    if (modo === "persegue" && tirosPossiveis.length && sorte() < 0.06) modo = "segura";
    if (modo === "segura") {
      semAlvo = tirosPossiveis.length ? 0 : semAlvo + 1;
      if (semAlvo > 8) modo = "persegue";
    }
    if (modo === "persegue") {
      if (vivos.length) {
        const melhor = (a, b) => valor(a.id) - valor(b.id) || a.p[1] - b.p[1] || Math.abs(b.p[0] - roboCol) - Math.abs(a.p[0] - roboCol);
        const alvo = vivos.reduce((m, v) => (melhor(v, m) > 0 ? v : m));
        roboCol += Math.max(-1, Math.min(1, alvo.p[0] - roboCol));
        roboCol = Math.max(COL_MIN_ROBO, Math.min(colunas - 1, roboCol)); // não deixa o robô sair da tela
      }
    }
    robo.push([roboCol, tick]);
    if (recarga > 0) recarga--;
    const opcoes = modo === "persegue" ? retos : tirosPossiveis;
    if (recarga === 0 && opcoes.length) {
      // prefere o que mais parte a centopeia; empate, o mais baixo
      const tiro = opcoes.reduce((m, t) => (valor(t.atingido.id) > valor(m.atingido.id) || (valor(t.atingido.id) === valor(m.atingido.id) && t.impacto[1] > m.impacto[1]) ? t : m));
      const atingido = tiro.atingido;
      recarga = RECARGA;
      if (sorte() < 0.5) modo = modo === "persegue" ? "segura" : "persegue";
      const seg = segs[atingido.id];
      seg.morte = tick;
      // separa a centopeia onde o segmento caiu
      const novas = [];
      for (const cp of centopeias) {
        const k = cp.corpo.indexOf(atingido.id);
        if (k === -1) { novas.push(cp); continue; }
        const frente = cp.corpo.slice(0, k);
        const tras = cp.corpo.slice(k + 1);
        if (frente.length) novas.push({ corpo: frente, dir: cp.dir, vdir: cp.vdir, fundo: cp.fundo });
        if (tras.length) {
          const [c1, l1] = ondeEsta(tras[0]);
          const dir = l1 === atingido.p[1] && c1 !== atingido.p[0] ? Math.sign(atingido.p[0] - c1) : cp.dir;
          if (segs[tras[0]].cabecaDesde == null) segs[tras[0]].cabecaDesde = tick;
          // de vez em quando um pedaço novo desce até a zona do robô
          const fundo = sorte() < 0.25 ? LINHA_FUNDO : LINHAS_GRADE - 1;
          novas.push({ corpo: tras, dir, vdir: sorte() < 0.5 ? 1 : -1, fundo });
        }
      }
      centopeias = novas;
      maxPedacos = Math.max(maxPedacos, centopeias.length);
      tiros.push({ tick, graus: tiro.graus, boca: tiro.boca, impacto: tiro.impacto, cabeca: segs[atingido.id].cabecaDesde != null });
    }
  }
  if (args.debug) console.error(`ticks=${tick} tiros=${tiros.length} vivos=${centopeias.reduce((n, cp) => n + cp.corpo.length, 0)} max_pedacos=${maxPedacos}`);
  return { segs, tiros, robo, fim: tick };
}

// ---------- desenho ----------

/** Peças da centopeia mecânica. `atraso` desloca pernas e ondulação para formar uma onda pelo corpo. */
function desenharSegmento(atraso, corPerna) {
  const d = `style="animation-delay:-${atraso.toFixed(2)}s"`;
  const d2 = `style="animation-delay:-${(atraso + 0.2).toFixed(2)}s"`;
  const traco = `stroke="#0f0d16" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const tracoPerna = `stroke="${corPerna}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  const tracoGrosso = traco.replace('stroke-width="1.4"', 'stroke-width="1.7"');
  // Vista de lado, olhando para a direita (+x). O grupo de fora espelha e gira o desenho conforme a direção.
  // Pernas embaixo, em duas cores (coxa roxa, canela em metal), dando passos alternados.
  const coxa = `stroke="#8b5cf6" stroke-width="1.6" stroke-linecap="round" fill="none"`;
  const perna = (x) =>
    `<path ${coxa} d="M${x} 2.5 L${x + 1.6} 6.2"/><path ${tracoPerna} d="M${x + 1.6} 6.2 L${x - 0.4} 9.6"/><circle cx="${x + 1.6}" cy="6.2" r=".9" fill="#c4b5fd"/>`;
  const pernas = `<g class="pernaF" ${d}>${perna(-3.6)}</g><g class="pernaT" ${d2}>${perna(1.6)}</g>`;
  // segmento: barriga escura, carapaça em domo com borda clara, junta que encaixa no da frente
  const corpo =
    `<rect x="5.2" y="-1.6" width="3" height="3.6" rx="1" fill="#0f0d16"/><rect x="5.6" y="-1" width="2.4" height="2.4" rx=".8" fill="#5d6577"/>` +
    `<ellipse cy="2.2" rx="6.9" ry="3.8" fill="#0f0d16"/><ellipse cy="2.2" rx="6.1" ry="3" fill="#2a1b4d"/>` +
    `<path d="M-7 2.2 Q-7 -7.2 0 -7.2 Q7 -7.2 7 2.2 Z" fill="#0f0d16"/>` +
    `<path d="M-6.2 2 Q-6.2 -6.4 0 -6.4 Q6.2 -6.4 6.2 2 Z" fill="url(#carapaca)"/>` +
    `<path d="M-5.2 -2.4 Q-4.4 -5.6 0 -5.7 Q3.6 -5.6 4.8 -3.4" stroke="#ede9fe" stroke-width=".9" fill="none" opacity=".85"/>` +
    // placas sobrepostas: a borda de trás passa por cima da junta do segmento anterior
    `<path d="M-6.2 2 Q-6.6 -3.4 -4.4 -5.6" stroke="#4c1d95" stroke-width="1.1" fill="none"/>` +
    `<path d="M-6 2.4 L6 2.4" stroke="#ede9fe" stroke-width=".6" opacity=".35"/>` +
    // LED com anel de luz ciano, aceso em onda da cabeça para a cauda
    `<circle class="faixa" ${d} cy="-1.6" r="3.3" fill="none" stroke="#22d3ee" stroke-width="1.1" filter="url(#brilho)"/>` +
    `<circle cy="-1.6" r="2.3" fill="#3a0d16"/><circle class="led" ${d} cy="-1.6" r="1.8" fill="${VERMELHO}" filter="url(#brilho)"/><circle cx="-.6" cy="-2.2" r=".5" fill="#ffd6dc"/>`;
  // cabeça: maior, de lado, com o olho grande à frente, mandíbulas apontando para onde anda,
  // antenas para a frente e um farol que ilumina adiante
  const cabeca =
    `<path class="farol" d="M9.5 -4.2 L26 -12 L26 7 Z" fill="url(#facho)"/>` +
    `<g class="antenas" ${d}><path ${traco} d="M3 -7.4 Q7 -12.6 12.6 -12.8 M1 -7.8 Q3.6 -13.4 8.4 -15"/>` +
    `<circle cx="12.6" cy="-12.8" r="1.6" fill="#22d3ee" filter="url(#brilho)"/><circle cx="8.4" cy="-15" r="1.4" fill="#22d3ee" filter="url(#brilho)"/></g>` +
    `<g class="mandE"><path d="M7.4 3.2 Q12.4 3.6 11.6 7.6" stroke="#0f0d16" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M7.4 3.2 Q12.4 3.6 11.6 7.6" stroke="#aeb5c3" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="11.6" cy="7.6" r=".9" fill="#8b5cf6"/></g>` +
    `<ellipse cx="1" cy="2.6" rx="8.6" ry="4.6" fill="#0f0d16"/><ellipse cx="1" cy="2.6" rx="7.8" ry="3.8" fill="#2a1b4d"/>` +
    `<path d="M-7.6 2.6 Q-7.6 -9 1.6 -9 Q10.2 -9 10.2 1.6 Q10.2 4.6 7 4.6 L-7.6 4.6 Z" fill="#0f0d16"/>` +
    `<path d="M-6.8 2.4 Q-6.8 -8.2 1.6 -8.2 Q9.4 -8.2 9.4 1.4 Q9.4 3.8 7 3.8 L-6.8 3.8 Z" fill="url(#carapaca)"/>` +
    `<path d="M-5.6 -2.6 Q-4.4 -7.2 1.6 -7.3 Q6.8 -7.2 8.4 -3.4" stroke="#ede9fe" stroke-width="1" fill="none" opacity=".85"/>` +
    `<path d="M-6.8 2.4 Q-7.4 -3.6 -5 -6.6" stroke="#4c1d95" stroke-width="1.1" fill="none"/>` +
    `<g class="mandD"><path d="M6.4 3.6 Q10.6 5.6 8.6 9" stroke="#0f0d16" stroke-width="3" stroke-linecap="round" fill="none"/><path d="M6.4 3.6 Q10.6 5.6 8.6 9" stroke="#aeb5c3" stroke-width="1.4" stroke-linecap="round" fill="none"/><circle cx="8.6" cy="9" r=".9" fill="#8b5cf6"/></g>` +
    // farol na testa
    `<circle cx="8.6" cy="-4.4" r="1.6" fill="#ecfeff" filter="url(#brilho)"/>` +
    // olho grande de LED, que pisca
    `<ellipse cx="4.6" cy="-.4" rx="3.4" ry="2.9" fill="#0f0d16"/>` +
    `<g class="olhosC"><ellipse cx="4.8" cy="-.4" rx="2.6" ry="2.1" fill="${VERMELHO}" filter="url(#brilho)"/><circle cx="4" cy="-1.2" r=".8" fill="#ffe4e8"/></g>` +
    `<path d="M-3.2 -3.6 Q-1.6 -5 .4 -4.4" stroke="#ede9fe" stroke-width=".7" fill="none" opacity=".6"/>`;
  return { pernas, corpo, cabeca, d };
}

function gerarSvg(calendario, tema, hoje) {
  const T = TEMAS[tema];
  const semanas = calendario.weeks;
  const largura = MARGEM * 2 + semanas.length * PASSO - (PASSO - CELULA);
  const sim = simular(semanas);
  const tempo = (tick) => INICIO + tick * TICK;
  const fimJogo = tempo(sim.fim) + VOO_LASER;
  const fimVitoria = fimJogo + 3.4;
  ciclo = +(fimVitoria + 0.8).toFixed(2);
  const FIM = ciclo - 0.3;
  css.length = 0;
  seq = 0;
  const camadas = { estrelas: [], chao: [], cubos: [], segmentos: [], lasers: [], explosoes: [], hud: [] };

  // estrelas
  const rnd = aleatorio(semanas.length * 7919 + calendario.totalContributions);
  css.push(
    `@keyframes pisca{0%,100%{opacity:.15}50%{opacity:.9}}`,
    `.est1{animation:pisca 2.3s ease-in-out infinite}.est2{animation:pisca 3.1s ease-in-out .7s infinite}.est3{animation:pisca 1.7s ease-in-out 1.3s infinite}`,
  );
  for (let i = 0; i < 46; i++) {
    const sx = Math.round(rnd() * largura);
    const sy = Math.round(28 + rnd() * (ALTURA - 54));
    if (sy > TOPO_GRADE - 6 && sy < BASE_GRADE + 4) continue;
    camadas.estrelas.push(`<rect class="est${(i % 3) + 1}" x="${sx}" y="${sy}" width="${rnd() < 0.2 ? 2 : 1}" height="${rnd() < 0.2 ? 2 : 1}" fill="${T.estrela}"/>`);
  }

  // chão da grade e cubos 3D nos dias com commit, que surgem coluna a coluna
  css.push(`.surge{transform-box:fill-box;transform-origin:center}`);
  const surgeDe = new Map();
  const surge = (c) => {
    if (!surgeDe.has(c)) {
      const t0 = 0.05 + c * 0.012;
      surgeDe.set(c, anima([[0, "opacity:0;transform:scale(0)"], [t0, "opacity:0;transform:scale(0)"], [t0 + 0.16, "opacity:1;transform:scale(1.35)"], [t0 + 0.3, "opacity:1;transform:scale(1)"], [FIM - 0.05, "opacity:1;transform:scale(1)"], [FIM + 0.2, "opacity:0;transform:scale(0)"], [ciclo, "opacity:0;transform:scale(0)"]]));
    }
    return surgeDe.get(c);
  };
  const cubos = [];
  semanas.forEach((s, c) =>
    s.contributionDays.forEach((d) => {
      const x = MARGEM + c * PASSO;
      const y = TOPO_GRADE + d.weekday * PASSO;
      const nivel = NIVEL[d.contributionLevel] ?? 0;
      const titulo = `<title>${d.date}: ${d.contributionCount}</title>`;
      camadas.chao.push(`<rect x="${x}" y="${y}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.vazio}">${titulo}</rect>`);
      if (d.contributionCount > 0 && nivel) cubos.push({ c, dia: d.weekday, x, y, nivel, titulo });
    }),
  );
  cubos.sort((a, b) => a.dia - b.dia || b.c - a.c);
  for (const v of cubos) {
    const { x, y, nivel } = v;
    const L = CELULA;
    const P = [0, 2.5, 3, 3.5, 4.5][nivel];
    const base = T.niveis[nivel];
    camadas.chao.push(`<rect x="${x + 1}" y="${y + 2}" width="${L}" height="${L - 1}" rx="2" fill="${T.sombra}" opacity="${T.sombraOp}"/>`);
    camadas.cubos.push(
      `<g transform="translate(0 -2)"><g class="surge ${surge(v.c)}">` +
        `<polygon points="${x},${y} ${x + P},${y - P} ${x + L + P},${y - P} ${x + L},${y}" fill="${tom(base, 0.38)}"/>` +
        `<polygon points="${x + L},${y} ${x + L + P},${y - P} ${x + L + P},${y + L - P} ${x + L},${y + L}" fill="${tom(base, -0.38)}"/>` +
        `<rect x="${x}" y="${y}" width="${L}" height="${L}" rx=".6" fill="${base}">${v.titulo}</rect></g></g>`,
    );
  }
  // linha que marca a zona do robô
  camadas.chao.push(`<line x1="${MARGEM}" x2="${largura - MARGEM}" y1="${BASE_GRADE + 4.5}" y2="${BASE_GRADE + 4.5}" stroke="${T.linhaZona}" stroke-dasharray="2 4"/>`);

  // centopeia
  css.push(
    // pernas andam em onda (cada segmento atrasado em relação ao da frente) e o corpo ondula
    // passos: a perna da frente e a de trás balançam em fases opostas, presas no corpo
    `@keyframes pernaF{from{transform:rotate(-22deg)}to{transform:rotate(18deg)}}.pernaF{animation:pernaF .36s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}`,
    `@keyframes pernaT{from{transform:rotate(18deg)}to{transform:rotate(-22deg)}}.pernaT{animation:pernaT .36s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}`,
    `@keyframes ondula{from{transform:translateY(-1.2px)}to{transform:translateY(1.2px)}}.ondula{animation:ondula .8s ease-in-out infinite alternate}`,
    `@keyframes led{from{opacity:.5}to{opacity:1}}.led{animation:led .5s ease-in-out infinite alternate}`,
    // a luz ciano corre da cabeça para a cauda: cada segmento acende um pouco depois do anterior
    `@keyframes faixa{0%,100%{stroke-opacity:.4}12%{stroke-opacity:1}30%{stroke-opacity:.4}}.faixa{animation:faixa 1.4s linear infinite}`,
    `@keyframes farol{from{opacity:.55}to{opacity:1}}.farol{animation:farol 1.1s ease-in-out infinite alternate}`,
    `@keyframes olhosC{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}.olhosC{animation:olhosC 3.1s infinite;transform-box:fill-box;transform-origin:center}`,
    `@keyframes antenas{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}.antenas{animation:antenas .7s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}`,
    `@keyframes mandE{from{transform:rotate(0)}to{transform:rotate(22deg)}}.mandE{animation:mandE .3s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:100% 0%}`,
    `@keyframes mandD{from{transform:rotate(0)}to{transform:rotate(-22deg)}}.mandD{animation:mandD .3s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:0% 0%}`,
  );
  for (const s of sim.segs) {
    const sprite = desenharSegmento(s.id * 0.1, T.perna);
    // só as quinas do caminho viram parada: entre elas o movimento é reto e constante
    const pts = s.pos.map(([c, l], i) => [tempo(i), cx(c), cy(l)]);
    const ultimoTick = s.morte ?? pts.length - 1;
    const uteis = pts.slice(0, ultimoTick + 1);
    const paradas = [[0, uteis[0]]];
    for (let i = 1; i < uteis.length; i++) {
      const a = uteis[i - 1], b = uteis[i], d = uteis[i + 1];
      if (!d || b[1] - a[1] !== d[1] - b[1] || b[2] - a[2] !== d[2] - b[2]) paradas.push([b[0], b]);
    }
    const mov = anima([[0, `transform:translate(${uteis[0][1]}px,${uteis[0][2]}px)`], ...paradas.map(([t, p]) => [t, `transform:translate(${p[1]}px,${p[2]}px)`]), [ciclo, `transform:translate(${uteis.at(-1)[1]}px,${uteis.at(-1)[2]}px)`]]);
    const morre = s.morte != null ? tempo(s.morte) + VOO_LASER : FIM;
    const vida = anima([[0, "opacity:1"], [morre, "opacity:1"], [morre + 0.01, "opacity:0"], [ciclo - 0.01, "opacity:0"], [ciclo, "opacity:1"]]);
    let cabeca = "";
    if (s.cabecaDesde != null) {
      const vira = s.cabecaDesde === 0 ? 0 : tempo(s.cabecaDesde);
      const cls = s.cabecaDesde === 0 ? "" : anima([[0, "opacity:0"], [vira, "opacity:0"], [vira + 0.01, "opacity:1"], [ciclo - 0.01, "opacity:1"], [ciclo, "opacity:0"]]);
      cabeca = `<g class="${cls}" style="opacity:${s.cabecaDesde === 0 ? 1 : 0}">${sprite.cabeca}</g>`;
    }
    // direção de cada passo: andando de lado espelha (direita = 1, esquerda = -1); subindo ou descendo gira 90°.
    // A troca acontece durante o passo, então a cabeça vira na curva e cada segmento vira depois dela.
    const orient = (face, graus) => `transform:scaleX(${face}) rotate(${graus}deg)`;
    let face = 1, graus = 0;
    const virar = [[0, orient(1, 0)]];
    for (let i = 1; i < uteis.length; i++) {
      const dx = uteis[i][1] - uteis[i - 1][1], dy = uteis[i][2] - uteis[i - 1][2];
      let nf = face, ng = graus;
      if (dx) { nf = Math.sign(dx); ng = 0; } else if (dy) ng = dy > 0 ? 90 : -90;
      if (nf !== face || ng !== graus) {
        virar.push([tempo(i - 1), orient(face, graus)], [tempo(i - 1) + TICK * 0.6, orient(nf, ng)]);
        face = nf; graus = ng;
      }
    }
    virar.push([ciclo - 0.01, orient(face, graus)], [ciclo, orient(1, 0)]);
    const giro = anima(virar);
    camadas.segmentos.unshift(`<g class="${mov}"><g class="${vida}"><g class="${giro}"><g class="ondula" ${sprite.d}>${sprite.pernas}${sprite.corpo}${cabeca}</g></g></g></g>`);
  }

  // tiros e explosões
  const rndX = aleatorio(4242);
  for (const tiro of sim.tiros) {
    const t = tempo(tiro.tick);
    const impacto = t + VOO_LASER;
    const [bx, by] = tiro.boca;
    const [x, y] = tiro.impacto;
    const distancia = Math.max(0, Math.hypot(x - bx, y - by) - 8).toFixed(1);
    const laser = anima([
      [0, "opacity:0;transform:translateY(0)"],
      [t, "opacity:0;transform:translateY(0)"],
      [t + 0.01, "opacity:1;transform:translateY(0)"],
      [impacto, `opacity:1;transform:translateY(-${distancia}px)`],
      [impacto + 0.01, `opacity:0;transform:translateY(-${distancia}px)`],
      [ciclo, "opacity:0;transform:translateY(0)"],
    ]);
    camadas.lasers.push(
      `<g transform="translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${tiro.graus.toFixed(1)})"><g class="${laser}" style="opacity:0">` +
        `<rect x="-3.5" y="-2" width="7" height="18" rx="3.5" fill="${VERMELHO}" opacity=".35"/>` +
        `<rect x="-1.5" y="0" width="3" height="14" rx="1.5" fill="${VERMELHO}"/><rect x="-.5" y="1" width="1" height="7" fill="#ffd0d6"/></g></g>`,
    );
    const cano = anima([[0, "opacity:0"], [t, "opacity:0"], [t + 0.01, "opacity:1"], [t + 0.09, "opacity:0"], [ciclo, "opacity:0"]]);
    camadas.lasers.push(`<g class="${cano}" style="opacity:0" filter="url(#brilho)"><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="4.5" fill="#d8b4fe"/><circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="2.2" fill="#fff"/></g>`);
    const escala = tiro.cabeca ? 2.6 : 2.1;
    const dur = tiro.cabeca ? 0.7 : 0.5;
    const exp = anima([[0, "opacity:0;transform:scale(.2)"], [impacto, "opacity:0;transform:scale(.2)"], [impacto + 0.01, "opacity:1;transform:scale(.35)"], [impacto + dur, `opacity:0;transform:scale(${escala})`], [ciclo, "opacity:0;transform:scale(.2)"]]);
    const n = tiro.cabeca ? 14 : 10;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rndX() * 0.6;
      const raio = 6 + rndX() * 5;
      const tam = 2 + Math.round(rndX() * 2);
      parts.push(`<rect x="${(Math.cos(ang) * raio - tam / 2).toFixed(1)}" y="${(Math.sin(ang) * raio - tam / 2).toFixed(1)}" width="${tam}" height="${tam}" fill="${i % 4 === 3 ? "#9aa3b5" : EXPLOSAO[i % EXPLOSAO.length]}"/>`);
    }
    parts.push(`<circle r="4" fill="${EXPLOSAO[1]}" opacity=".9"/><circle r="2.2" fill="#fff"/>`);
    camadas.explosoes.push(`<g transform="translate(${x} ${y})"><g class="${exp}" style="opacity:0">${parts.join("")}</g></g>`);
  }

  // HUD: placar (cabeça 100, corpo 10) e segmentos restantes
  const fonte = `font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-weight="700"`;
  const marcos = [[0, 0, TAMANHO]];
  let soma = 0;
  let resta = TAMANHO;
  for (const tiro of sim.tiros) {
    soma += tiro.cabeca ? 100 : 10;
    resta--;
    marcos.push([tempo(tiro.tick) + VOO_LASER, soma, resta]);
  }
  const textos = (campo, x, ancora) =>
    marcos.map((m, i) => {
      const t0 = m[0];
      const t1 = marcos[i + 1]?.[0] ?? FIM;
      const ultimo = i === marcos.length - 1;
      const paradas =
        i === 0
          ? [[0, "opacity:1"], [t1, "opacity:1"], [t1 + 0.01, "opacity:0"], [FIM, "opacity:0"], [FIM + 0.01, "opacity:1"], [ciclo, "opacity:1"]]
          : [[0, "opacity:0"], [t0, "opacity:0"], [t0 + 0.01, "opacity:1"], [ultimo ? FIM : t1, "opacity:1"], [(ultimo ? FIM : t1) + 0.01, "opacity:0"], [ciclo, "opacity:0"]];
      const valor = campo === 1 ? String(m[1]).padStart(6, "0") : String(m[2]).padStart(2, "0");
      return `<text class="${anima(paradas)}" style="opacity:${ultimo ? 1 : 0}" x="${x}" y="18" text-anchor="${ancora}" fill="${campo === 1 ? T.hud : VERMELHO}">${valor}</text>`;
    });
  camadas.hud.push(
    `<g ${fonte} font-size="12" letter-spacing="1">`,
    `<text x="${MARGEM}" y="18" fill="${T.hudFraco}">SCORE</text>`,
    ...textos(1, MARGEM + 52, "start"),
    `<text x="${largura / 2}" y="18" text-anchor="middle" fill="${T.hudFraco}">ÚLTIMOS 12 MESES</text>`,
    `<text x="${largura - MARGEM - 26}" y="18" text-anchor="end" fill="${T.hudFraco}">SEGMENTOS</text>`,
    ...textos(2, largura - MARGEM, "end"),
    `</g>`,
  );

  // mensagens
  const meioY = BASE_GRADE + 34;
  const pronto = anima([[0, "opacity:1"], [INICIO, "opacity:1"], [INICIO + 0.05, "opacity:0"], [ciclo, "opacity:0"]]);
  const vitoria = anima([[0, "opacity:0"], [fimJogo + 0.4, "opacity:0"], [fimJogo + 0.41, "opacity:1"], [fimVitoria, "opacity:1"], [fimVitoria + 0.01, "opacity:0"], [ciclo, "opacity:0"]]);
  css.push(`@keyframes piscaTexto{0%,60%{fill-opacity:1}61%,100%{fill-opacity:.2}}.piscaTexto{animation:piscaTexto .7s infinite}`);
  const total = calendario.totalContributions.toLocaleString("pt-BR");
  const mensagens = `<g ${fonte} text-anchor="middle">
<g class="${pronto}"><text class="piscaTexto" x="${largura / 2}" y="${meioY}" font-size="15" letter-spacing="3" fill="${T.hud}">READY?</text></g>
<g class="${vitoria}" style="opacity:0"><text class="piscaTexto" x="${largura / 2}" y="${meioY - 4}" font-size="16" letter-spacing="3" fill="${EXPLOSAO[2]}">STAGE CLEAR</text>
<text x="${largura / 2}" y="${meioY + 13}" font-size="11" letter-spacing="1" fill="${T.hudFraco}">+${total} contribuições</text></g></g>`;

  // robô
  /** Transforma um desenho de letras em retângulos, separados por grupo de animação. */
  const pixels = (desenho, grupos = {}, dy = 0) => {
    const saida = { base: [] };
    desenho.forEach((linha, y) => {
      if (linha.length !== desenho[0].length) throw new Error(`linha com largura errada: ${linha}`);
      [...linha].forEach((ch, x) => {
        if (ch === ".") return;
        if (!COR_ROBO[ch]) throw new Error(`cor do robô sem definição: ${ch}`);
        const g = grupos[ch] ?? "base";
        (saida[g] ??= []).push(`<rect x="${x * PX}" y="${(y + dy) * PX}" width="${PX}" height="${PX}" fill="${COR_ROBO[ch]}"/>`);
      });
    });
    for (const k of Object.keys(saida)) saida[k] = saida[k].join("");
    return saida;
  };
  const corpo = pixels(CORPO, { E: "olhos", A: "nucleo", a: "nucleo", v: "reflexo" });
  const pernas = Object.fromEntries(Object.entries(PERNAS).map(([k, d]) => [k, pixels(d, {}, CORPO.length).base]));
  const rifle = pixels(RIFLE, { P: "bobina", p: "bobina", c: "boca" });
  // propulsores nas costas: bocal dos dois lados, logo abaixo das ombreiras
  const bocal = [0, 21].map((x) => `<rect x="${x * PX}" y="${18 * PX}" width="${PX}" height="${PX * 2}" fill="${COR_ROBO.G}"/>`).join("");
  const fogo = (cor, y) => [0, 21].map((x) => `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${cor}"/>`).join("");
  const larguraRobo = LARGURA_ROBO;
  const alturaRobo = ALTURA_ROBO;
  const xRobo = (c) => (cx(c) - PIVO.x).toFixed(1);

  // anda quando muda de coluna; parado, mostra as pernas juntas
  const movendo = sim.robo.map(([c], i) => i > 0 && c !== sim.robo[i - 1][0]);
  const trocasPernas = [[0, false]];
  movendo.forEach((m, i) => { if (m !== trocasPernas.at(-1)[1]) trocasPernas.push([tempo(sim.robo[i][1]) - TICK, m]); });
  const andando = anima([
    [0, "opacity:0"],
    ...trocasPernas.slice(1).flatMap(([t, m]) => [[t, `opacity:${m ? 0 : 1}`], [t + 0.01, `opacity:${m ? 1 : 0}`]]),
    [FIM, "opacity:0"],
    [ciclo, "opacity:0"],
  ]);
  const parado = anima([
    [0, "opacity:1"],
    ...trocasPernas.slice(1).flatMap(([t, m]) => [[t, `opacity:${m ? 1 : 0}`], [t + 0.01, `opacity:${m ? 0 : 1}`]]),
    [FIM, "opacity:1"],
    [ciclo, "opacity:1"],
  ]);

  // o rifle gira para mirar um pouco antes de cada tiro, e a bobina carrega
  let anguloAnterior = 0;
  const mira = [[0, "transform:rotate(0deg)"]];
  const carga = [[0, "opacity:.45"]];
  for (const tiro of sim.tiros) {
    const t = tempo(tiro.tick);
    mira.push([t - 0.3, `transform:rotate(${anguloAnterior.toFixed(1)}deg)`], [t - 0.05, `transform:rotate(${tiro.graus.toFixed(1)}deg)`]);
    carga.push([t - 0.4, "opacity:.45"], [t - 0.02, "opacity:1"], [t + 0.2, "opacity:.45"]);
    anguloAnterior = tiro.graus;
  }
  mira.push([FIM, `transform:rotate(${anguloAnterior.toFixed(1)}deg)`], [ciclo, "transform:rotate(0deg)"]);
  carga.push([ciclo, "opacity:.45"]);
  const miraCls = anima(mira);
  const cargaCls = anima(carga);
  const paradasRobo = [[0, sim.robo[0][0]]];
  for (let i = 1; i < sim.robo.length; i++) {
    const a = sim.robo[i - 1][0], b = sim.robo[i][0], d = sim.robo[i + 1]?.[0];
    if (d == null || b - a !== d - b) paradasRobo.push([tempo(sim.robo[i][1]), b]);
  }
  const voo = anima([[0, `transform:translateX(${xRobo(sim.robo[0][0])}px)`], [INICIO, `transform:translateX(${xRobo(sim.robo[0][0])}px)`], ...paradasRobo.slice(1).map(([t, c]) => [t, `transform:translateX(${xRobo(c)}px)`]), [FIM, `transform:translateX(${xRobo(sim.robo.at(-1)[0])}px)`], [ciclo, `transform:translateX(${xRobo(sim.robo[0][0])}px)`]]);
  const recuo = anima([
    [0, "transform:translateY(0)"],
    ...sim.tiros.flatMap((tiro) => {
      const t = tempo(tiro.tick);
      return [[t, "transform:translateY(0)"], [t + 0.02, "transform:translateY(2px)"], [t + 0.12, "transform:translateY(0)"]];
    }),
    [ciclo, "transform:translateY(0)"],
  ]);
  css.push(
    `@keyframes respira{from{transform:translateY(0)}to{transform:translateY(-1px)}}.respira{animation:respira .9s ease-in-out infinite alternate}`,
    `@keyframes chama{from{opacity:1}to{opacity:.35}}.chama{animation:chama .1s steps(2) infinite alternate}.chama2{animation:chama .13s steps(2) .05s infinite alternate}`,
    `@keyframes passoA{0%,49%{opacity:1}50%,100%{opacity:0}}.passoA{animation:passoA .32s infinite}`,
    `@keyframes passoB{0%,49%{opacity:0}50%,100%{opacity:1}}.passoB{animation:passoB .32s infinite}`,
    `@keyframes reflexo{0%,70%{opacity:.5}85%{opacity:1}100%{opacity:.5}}.reflexo{animation:reflexo 2.6s infinite}`,
    `@keyframes halo{from{opacity:.55}to{opacity:.9}}.halo{animation:halo 1.4s ease-in-out infinite alternate}`,
    `@keyframes olhos{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.15)}}.olhos{animation:olhos 3.3s infinite;transform-box:fill-box;transform-origin:center}`,
    `@keyframes nucleo{from{opacity:.55}to{opacity:1}}.nucleo{animation:nucleo .5s ease-in-out infinite alternate}`,
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`,
  );
  const roboSvg = `<g class="${voo}" style="transform:translateX(${xRobo(sim.robo[0][0])}px)"><g transform="translate(0 ${ROBO_Y})">
<ellipse class="halo" cx="${larguraRobo / 2}" cy="${alturaRobo / 2}" rx="${larguraRobo * 0.8}" ry="${alturaRobo * 0.62}" fill="url(#halo)"/>
<ellipse cx="${larguraRobo / 2}" cy="${alturaRobo + 1}" rx="${larguraRobo * 0.42}" ry="2.6" fill="#000" opacity="${tema === "dark" ? 0.5 : 0.22}"/>
<g class="${recuo}"><g shape-rendering="crispEdges">
<g class="${parado}">${pernas.parado}</g>
<g class="${andando}" style="opacity:0"><g class="passoA">${pernas.passoA}</g><g class="passoB">${pernas.passoB}</g></g>
<g class="respira">
${bocal}<g class="chama" filter="url(#brilho)">${fogo(COR_ROBO.F, 20)}</g><g class="chama2" filter="url(#brilho)">${fogo(COR_ROBO.f, 21)}</g>
${corpo.base}<g class="reflexo">${corpo.reflexo}</g><g class="nucleo" filter="url(#brilho)">${corpo.nucleo}</g><g class="olhos" filter="url(#brilho)">${corpo.olhos}</g>
<g transform="translate(${PIVO.x} ${PIVO.y})"><g class="${miraCls}"><g transform="translate(${-RIFLE_PIVO.x} ${-RIFLE_PIVO.y})">
${rifle.base}<g class="${cargaCls}" filter="url(#brilho)">${rifle.bobina}</g><g filter="url(#brilho)">${rifle.boca}</g>
</g></g></g>
</g></g></g></g></g>`;

  const data = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${ALTURA}" viewBox="0 0 ${largura} ${ALTURA}" role="img" aria-label="Centopeia mecânica descendo pelo gráfico de contribuições de ${usuario ?? "GitHub"} enquanto um robô atira nela: ${total} contribuições no último ano">
<defs>
<linearGradient id="carapaca" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ddd6fe"/><stop offset=".35" stop-color="#a78bfa"/><stop offset=".75" stop-color="#6d28d9"/><stop offset="1" stop-color="#3b1a7a"/></linearGradient>
<linearGradient id="facho" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a5f3fc" stop-opacity="${tema === "dark" ? 0.55 : 0.4}"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></linearGradient>
<radialGradient id="farol"><stop offset="0" stop-color="#67e8f9" stop-opacity="${tema === "dark" ? 0.35 : 0.25}"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0"/></radialGradient>
<linearGradient id="casco" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f6fa"/><stop offset=".45" stop-color="#a9b0bf"/><stop offset="1" stop-color="#4b5263"/></linearGradient>
<radialGradient id="halo"><stop offset="0" stop-color="#8b5cf6" stop-opacity="${tema === "dark" ? 0.35 : 0.22}"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
<filter id="brilho" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
<style>${css.join("")}</style>
<g shape-rendering="crispEdges">${camadas.estrelas.join("")}</g>
<g>${camadas.chao.join("")}</g>
<g>${camadas.cubos.join("")}</g>
<g>${camadas.lasers.join("")}</g>
<g>${camadas.segmentos.join("")}</g>
${roboSvg}
<g>${camadas.explosoes.join("")}</g>
${camadas.hud.join("")}
${mensagens}
<g font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="11" fill="${T.hudFraco}">
<text x="${MARGEM}" y="${ALTURA - 8}">${total} contribuições no último ano</text>
<text x="${largura - MARGEM}" y="${ALTURA - 8}" text-anchor="end">atualizado em ${data}</text>
</g>
</svg>
`;
}

const calendario = await carregarCalendario();
await mkdir(saida, { recursive: true });
const hoje = new Date();
for (const tema of Object.keys(TEMAS)) {
  const arquivo = join(saida, `centopeia-${tema}.svg`);
  await writeFile(arquivo, gerarSvg(calendario, tema, hoje));
  console.log(`gerado ${arquivo}`);
}
