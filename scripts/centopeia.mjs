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

// Robô original em pixel (24 x 26): antena, visor com dois olhos, núcleo de energia no peito,
// jetpack embaixo e o canhão no braço direito, apontado para cima.
const ROBO = [
  ".......K..........KccK..",
  ".......P..........KGGK..",
  ".......K..........KGGK..",
  "....KKKKKKKK......KGGK..",
  "...KWWLLLLLMK.....KMLK..",
  "..KWLLLLLLLMDK....KMLK..",
  "..KLLKKKKKKKDK....KMLK..",
  "..KLKVEeVVEeVKK...KMLK..",
  "..KLKVEEVVEEVKK...KMLK..",
  "..KMLKKKKKKKDK....KMLK..",
  "..KMLLLPPLLLDK....KDMK..",
  "...KDMMMMMMDK.....KDMK..",
  "....KKKKKKKK......KDMK..",
  ".....KDMMDK.......KDMK..",
  "..KKKKKKKKKKKK..KKKMMK..",
  ".KWLLLLKaaKLLMKKMMMMDK..",
  ".KLLLLKaAAaKLMDDDDDDK...",
  ".KLLMMKAAAAKMMDKKKKK....",
  ".KLMMMKaAAaKMDDK........",
  ".KMMMMMKaaKMMDK.........",
  "..KDMMMMMMMMDK..........",
  "...KKDDDDDDKK...........",
  "....KGGK..KGGK..........",
  "....KGGK..KGGK..........",
  ".....FF....FF...........",
  ".....ff....ff...........",
];
const COR_ROBO = {
  K: "#0f0d16", W: "#f6f8fc", L: "#d3d8e2", M: "#9aa2b3", D: "#5d6577", V: "#1a1426",
  E: VERMELHO, e: "#ffc2cb", G: "#2e3340", c: VERMELHO, A: "#38bdf8", a: "#bae6fd", P: "#8b5cf6",
  F: "#ffd166", f: "#ff6a1a",
};
const PX = 2;
const CANO_X = 20 * PX; // meio do cano (entre as colunas 19 e 20 do desenho)

// ---------- geometria ----------

const CELULA = 10;
const PASSO = 13;
const MARGEM = 16;
const TOPO_GRADE = 36;
const LINHAS_GRADE = 7;
const LINHA_FUNDO = 10; // a centopeia desce até aqui, já fora da grade, na zona do robô
const ZONA_TOPO = LINHAS_GRADE; // na zona do robô ela vai e volta entre ZONA_TOPO e LINHA_FUNDO
const BASE_GRADE = TOPO_GRADE + LINHAS_GRADE * PASSO - (PASSO - CELULA);
const ROBO_Y = TOPO_GRADE + (LINHA_FUNDO + 1) * PASSO + 4;
const ALTURA = ROBO_Y + ROBO.length * PX + 30;
const cx = (c) => MARGEM + c * PASSO + CELULA / 2;
const cy = (l) => TOPO_GRADE + l * PASSO + CELULA / 2;

// ---------- tempo ----------

const INICIO = 1.0; // antes disso: READY? e os cubos se materializando
const TICK = 0.16; // segundos por casa andada
const VOO_LASER = 0.06;
const RECARGA = 7; // ticks entre tiros
const TAMANHO = 16; // segmentos da centopeia
const MAX_TICKS = 520;

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
  let centopeias = [{ corpo: segs.map((s) => s.id), dir: 1, vdir: 1 }];
  const tiros = [];
  const robo = [[Math.floor(colunas / 2), 0]]; // [coluna, tick]
  let roboCol = Math.floor(colunas / 2);
  let recarga = 0;
  let tick = 0;

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
        if (nl > LINHA_FUNDO) { cp.vdir = -1; nl = hl - 1; }
        if (nl < ZONA_TOPO && cp.vdir === -1 && hl >= ZONA_TOPO) { cp.vdir = 1; nl = hl + 1; }
        prox = [hc, nl];
        cp.dir = -cp.dir;
      }
      cp.corpo.forEach((id, i) => segs[id].pos.push(i === 0 ? prox : anteriores[i - 1]));
    }
    for (const s of segs) if (s.morte != null && s.pos.length <= tick) s.pos.push(s.pos.at(-1));

    // 2) o robô persegue o segmento mais baixo e atira quando está na coluna dele.
    //    Os blocos de commit seguram o tiro: só vale segmento sem bloco entre ele e o robô.
    const livre = ([c, l]) => {
      for (let r = l + 1; r < LINHAS_GRADE; r++) if (obstaculo.has(`${c},${r}`)) return false;
      return true;
    };
    const vivos = centopeias.flatMap((cp) => cp.corpo).map((id) => ({ id, p: ondeEsta(id) })).filter((v) => v.p[0] >= 0 && livre(v.p));
    if (vivos.length) {
      const alvo = vivos.reduce((m, v) => (v.p[1] > m.p[1] || (v.p[1] === m.p[1] && Math.abs(v.p[0] - roboCol) < Math.abs(m.p[0] - roboCol)) ? v : m));
      const passo = Math.max(-1, Math.min(1, alvo.p[0] - roboCol));
      roboCol += passo;
    }
    robo.push([roboCol, tick]);
    if (recarga > 0) recarga--;
    const naColuna = vivos.filter((v) => v.p[0] === roboCol);
    if (recarga === 0 && naColuna.length) {
      const atingido = naColuna.reduce((m, v) => (v.p[1] > m.p[1] ? v : m));
      recarga = RECARGA;
      const seg = segs[atingido.id];
      seg.morte = tick;
      // separa a centopeia onde o segmento caiu
      const novas = [];
      for (const cp of centopeias) {
        const k = cp.corpo.indexOf(atingido.id);
        if (k === -1) { novas.push(cp); continue; }
        const frente = cp.corpo.slice(0, k);
        const tras = cp.corpo.slice(k + 1);
        if (frente.length) novas.push({ corpo: frente, dir: cp.dir, vdir: cp.vdir });
        if (tras.length) {
          const [c1, l1] = ondeEsta(tras[0]);
          const dir = l1 === atingido.p[1] && c1 !== atingido.p[0] ? Math.sign(atingido.p[0] - c1) : cp.dir;
          if (segs[tras[0]].cabecaDesde == null) segs[tras[0]].cabecaDesde = tick;
          novas.push({ corpo: tras, dir, vdir: cp.vdir });
        }
      }
      centopeias = novas;
      tiros.push({ tick, col: roboCol, linha: atingido.p[1], cabeca: segs[atingido.id].cabecaDesde != null });
    }
  }
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
  const pernas =
    `<g class="pernaC" ${d}><path ${tracoPerna} d="M-2.5 -4.5 L-4.2 -8.2 L-6.4 -8.8 M2.5 -4.5 L4.2 -8.2 L6.4 -8.8"/>` +
    `<circle cx="-4.2" cy="-8.2" r=".7" fill="#9aa2b3"/><circle cx="4.2" cy="-8.2" r=".7" fill="#9aa2b3"/></g>` +
    `<g class="pernaB" ${d2}><path ${tracoPerna} d="M-2.5 4.5 L-4.2 8.2 L-6.4 8.8 M2.5 4.5 L4.2 8.2 L6.4 8.8"/>` +
    `<circle cx="-4.2" cy="8.2" r=".7" fill="#9aa2b3"/><circle cx="4.2" cy="8.2" r=".7" fill="#9aa2b3"/></g>`;
  const corpo =
    `<ellipse rx="6.7" ry="6.1" fill="#0f0d16"/><ellipse rx="5.9" ry="5.3" fill="url(#casco)"/>` +
    // placas sobrepostas: duas juntas curvas e os rebites
    `<path d="M-2.4 -5.1 Q-3.7 0 -2.4 5.1 M2.4 -5.1 Q3.7 0 2.4 5.1" stroke="#0f0d16" stroke-opacity=".4" stroke-width=".9" fill="none"/>` +
    `<circle cx="-4.3" cy="-1.6" r=".55" fill="#f6f8fc"/><circle cx="4.3" cy="-1.6" r=".55" fill="#f6f8fc"/><circle cx="-4.3" cy="1.8" r=".55" fill="#3b4150"/><circle cx="4.3" cy="1.8" r=".55" fill="#3b4150"/>` +
    `<ellipse cx="-1.4" cy="-3.3" rx="2.6" ry="1" fill="#ffffff" opacity=".75"/>` +
    // LED com brilho
    `<circle r="2.6" fill="#3a0d16"/><circle class="led" ${d} r="1.8" fill="${VERMELHO}" filter="url(#brilho)"/><circle cx="-.6" cy="-.6" r=".55" fill="#ffd6dc"/>`;
  const cabeca =
    `<g class="antenas" ${d}><path ${traco} d="M-2 -5.6 Q-3.6 -9.4 -6.6 -10.8 M2 -5.6 Q3.6 -9.4 6.6 -10.8"/>` +
    `<circle cx="-6.6" cy="-10.8" r="1.4" fill="${VERMELHO}" filter="url(#brilho)"/><circle cx="6.6" cy="-10.8" r="1.4" fill="${VERMELHO}" filter="url(#brilho)"/></g>` +
    `<g class="mandE"><path ${tracoGrosso} d="M-2.6 4.6 Q-4 7.6 -1.3 8.9"/></g>` +
    `<g class="mandD"><path ${tracoGrosso} d="M2.6 4.6 Q4 7.6 1.3 8.9"/></g>` +
    `<ellipse rx="7.5" ry="6.9" fill="#0f0d16"/><ellipse rx="6.7" ry="6.1" fill="url(#casco)"/>` +
    `<path d="M-5.3 -2.2 Q0 -7 5.3 -2.2 L4.2 -.9 Q0 -4.6 -4.2 -.9 Z" fill="#8b5cf6"/><path d="M-3.6 -3.3 Q0 -5.6 3.6 -3.3" stroke="#c4b5fd" stroke-width=".7" fill="none"/>` +
    `<ellipse cx="-2.7" cy=".7" rx="1.9" ry="1.4" fill="#3a0d16"/><ellipse cx="2.7" cy=".7" rx="1.9" ry="1.4" fill="#3a0d16"/>` +
    `<g class="led" filter="url(#brilho)"><ellipse cx="-2.7" cy=".7" rx="1.4" ry="1" fill="${VERMELHO}"/><ellipse cx="2.7" cy=".7" rx="1.4" ry="1" fill="${VERMELHO}"/></g>` +
    `<circle cx="-3.1" cy=".3" r=".45" fill="#ffd6dc"/><circle cx="2.3" cy=".3" r=".45" fill="#ffd6dc"/>` +
    `<ellipse cx="-2" cy="-4.4" rx="2.4" ry=".8" fill="#ffffff" opacity=".6"/>` +
    `<path d="M-2.4 3.6 L2.4 3.6" stroke="#0f0d16" stroke-opacity=".6" stroke-width=".9"/>`;
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
    `@keyframes pernaC{from{transform:rotate(-16deg)}to{transform:rotate(16deg)}}.pernaC{animation:pernaC .4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 100%}`,
    `@keyframes pernaB{from{transform:rotate(16deg)}to{transform:rotate(-16deg)}}.pernaB{animation:pernaB .4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0%}`,
    `@keyframes ondula{from{transform:translateY(-1.2px)}to{transform:translateY(1.2px)}}.ondula{animation:ondula .8s ease-in-out infinite alternate}`,
    `@keyframes led{from{opacity:.5}to{opacity:1}}.led{animation:led .5s ease-in-out infinite alternate}`,
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
    camadas.segmentos.unshift(`<g class="${mov}"><g class="${vida}"><g class="ondula" ${sprite.d}>${sprite.pernas}${sprite.corpo}${cabeca}</g></g></g>`);
  }

  // tiros e explosões
  const rndX = aleatorio(4242);
  for (const tiro of sim.tiros) {
    const t = tempo(tiro.tick);
    const impacto = t + VOO_LASER;
    const x = cx(tiro.col);
    const y = cy(tiro.linha);
    const distancia = ROBO_Y - y;
    const laser = anima([
      [0, "opacity:0;transform:translateY(0)"],
      [t, "opacity:0;transform:translateY(0)"],
      [t + 0.01, "opacity:1;transform:translateY(0)"],
      [impacto, `opacity:1;transform:translateY(-${distancia}px)`],
      [impacto + 0.01, `opacity:0;transform:translateY(-${distancia}px)`],
      [ciclo, "opacity:0;transform:translateY(0)"],
    ]);
    camadas.lasers.push(
      `<g transform="translate(${x} ${ROBO_Y})"><g class="${laser}" style="opacity:0">` +
        `<rect x="-3.5" y="-2" width="7" height="18" rx="3.5" fill="${VERMELHO}" opacity=".35"/>` +
        `<rect x="-1.5" y="0" width="3" height="14" rx="1.5" fill="${VERMELHO}"/><rect x="-.5" y="1" width="1" height="7" fill="#ffd0d6"/></g></g>`,
    );
    const cano = anima([[0, "opacity:0"], [t, "opacity:0"], [t + 0.01, "opacity:1"], [t + 0.09, "opacity:0"], [ciclo, "opacity:0"]]);
    camadas.lasers.push(`<g class="${cano}" style="opacity:0"><circle cx="${x}" cy="${ROBO_Y - 1}" r="4" fill="#ffd0d6"/><circle cx="${x}" cy="${ROBO_Y - 1}" r="2" fill="#fff"/></g>`);
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
  const robo = { corpo: [], olhos: [], chama: [], chama2: [], nucleo: [], cano: [] };
  const grupo = { E: "olhos", e: "olhos", F: "chama", f: "chama2", A: "nucleo", a: "nucleo", c: "cano" };
  ROBO.forEach((linha, y) => {
    if (linha.length !== ROBO[0].length) throw new Error(`linha do robô com largura errada: ${linha}`);
    [...linha].forEach((ch, x) => {
      if (ch === ".") return;
      if (!COR_ROBO[ch]) throw new Error(`cor do robô sem definição: ${ch}`);
      robo[grupo[ch] ?? "corpo"].push(`<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${COR_ROBO[ch]}"/>`);
    });
  });
  const larguraRobo = ROBO[0].length * PX;
  const alturaRobo = ROBO.length * PX;
  const xRobo = (c) => (cx(c) - CANO_X).toFixed(1);
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
      return [[t, "transform:translateY(0)"], [t + 0.02, "transform:translateY(3px)"], [t + 0.1, "transform:translateY(0)"]];
    }),
    [ciclo, "transform:translateY(0)"],
  ]);
  css.push(
    `@keyframes flutua{from{transform:translateY(0)}to{transform:translateY(-3px)}}.flutua{animation:flutua .8s ease-in-out infinite alternate}`,
    `@keyframes chama{from{transform:scaleY(1);opacity:1}to{transform:scaleY(.45);opacity:.7}}.chama{animation:chama .1s steps(2) infinite alternate;transform-box:fill-box;transform-origin:top}`,
    `.chama2{animation:chama .13s steps(2) .05s infinite alternate;transform-box:fill-box;transform-origin:top}`,
    `@keyframes halo{from{opacity:.55}to{opacity:.9}}.halo{animation:halo 1.4s ease-in-out infinite alternate}`,
    `@keyframes olhos{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.15)}}.olhos{animation:olhos 3.3s infinite;transform-box:fill-box;transform-origin:center}`,
    `@keyframes nucleo{from{opacity:.55}to{opacity:1}}.nucleo{animation:nucleo .5s ease-in-out infinite alternate}`,
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`,
  );
  const roboSvg = `<g class="${voo}" style="transform:translateX(${xRobo(sim.robo[0][0])}px)"><g transform="translate(0 ${ROBO_Y})"><g class="flutua"><g class="${recuo}" shape-rendering="crispEdges">
<ellipse class="halo" cx="${larguraRobo / 2}" cy="${alturaRobo / 2}" rx="${larguraRobo * 0.75}" ry="${alturaRobo * 0.7}" fill="url(#halo)" shape-rendering="auto"/>
<g>${robo.corpo.join("")}</g><g class="nucleo" filter="url(#brilho)">${robo.nucleo.join("")}</g><g class="olhos" filter="url(#brilho)">${robo.olhos.join("")}</g>
<g filter="url(#brilho)">${robo.cano.join("")}</g><g class="chama2" filter="url(#brilho)">${robo.chama2.join("")}</g><g class="chama" filter="url(#brilho)">${robo.chama.join("")}</g>
</g></g></g></g>`;

  const data = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${ALTURA}" viewBox="0 0 ${largura} ${ALTURA}" role="img" aria-label="Centopeia mecânica descendo pelo gráfico de contribuições de ${usuario ?? "GitHub"} enquanto um robô atira nela: ${total} contribuições no último ano">
<defs>
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
