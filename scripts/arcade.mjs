// Gera o SVG animado do perfil: uma batalha arcade em cima do gráfico de contribuições.
// Cada dia com commit é um invasor roxo, sempre no lugar exato do gráfico. Um robô atira
// laser vermelho em cada um; o dia com mais contribuições é o chefe e leva três tiros.
//
// Uso:
//   GITHUB_TOKEN=... node scripts/arcade.mjs --usuario ChMoreiraa --saida dist
//   node scripts/arcade.mjs --entrada contrib.json --saida dist   (sem rede, para testar)
//
// Saída: arcade-dark.svg e arcade-light.svg na pasta --saida.

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
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "perfil-arcade" },
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
    olho: "#0d0b14",
    estrela: "#cbd5ff",
    hud: "#ece9f7",
    hudFraco: "#8f8aa8",
    flash: "#ffffff",
    sombra: "#000000",
    sombraOp: .55,
  },
  light: {
    vazio: "#ece9f3",
    niveis: [null, "#c9b8fb", "#a487f8", "#7c4dee", "#4c1d95"],
    olho: "#1b1430",
    estrela: "#9a93b8",
    hud: "#241f33",
    hudFraco: "#6b6880",
    flash: "#fff7d6",
    sombra: "#2a1f4d",
    sombraOp: .28,
  },
};
const VERMELHO = "#ff2e4d";
const EXPLOSAO = ["#fff3b0", "#ffd166", "#ffb703", "#ff8c1a", "#ff5400", "#e63946"];

// Robô original em pixel (16 x 18), com o canhão no braço direito apontado para cima.
const ROBO = [
  "............KcK.",
  "............KCK.",
  "...KKKKKK...KCK.",
  "..KLLLMMMK..KCK.",
  ".KLLMMMMMDK.KCK.",
  ".KLKKKKKKDK.KCK.",
  ".KKEeKKeEKK.KMK.",
  ".KLKKKKKKDK.KMK.",
  ".KMMMMMMMDK.KMK.",
  "..KKKKKKKK..KMK.",
  ".KKMMKKMMKKKKMK.",
  "KMLMMAAMMMDMMDK.",
  "KMLMAAAAMMDKKK..",
  "KDMMMAAMMMDK....",
  ".KKDMMMMDKK.....",
  "...KMK.KMK......",
  "...KFK.KFK......",
  "....F...F.......",
];
const COR_ROBO = {
  K: "#0f0d16", L: "#eef1f6", M: "#b4bac7", D: "#6b7280", C: "#3a3f4b", c: VERMELHO,
  E: VERMELHO, e: "#ffb3bd", A: "#38bdf8", F: "#ffb703",
};
const PX = 3;
const CANO_X = 13 * PX + PX / 2; // centro do canhão, relativo ao robô

// ---------- geometria ----------

const CELULA = 10;
const PASSO = 13;
const MARGEM = 16;
const TOPO_GRADE = 36;
const BASE_GRADE = TOPO_GRADE + 7 * PASSO - (PASSO - CELULA);
const ROBO_Y = 178;
const ALTURA = ROBO_Y + ROBO.length * PX + 30;

// ---------- utilidades de animação ----------

let ciclo = 20;
const css = [];
let seq = 0;

/** Cria um @keyframes a partir de [segundos, "propriedades"] e devolve o nome da classe. */
function anima(paradas, extra = "") {
  const nome = `a${(seq++).toString(36)}`;
  let ultimo = -1;
  const corpo = paradas
    .map(([t, regra]) => {
      let p = Math.max(0, Math.min(100, (t / ciclo) * 100));
      if (p <= ultimo) p = Math.min(100, ultimo + 0.01);
      ultimo = p;
      return `${p.toFixed(2)}%{${regra}}`;
    })
    .join("");
  css.push(`@keyframes ${nome}{${corpo}}.${nome}{animation:${nome} ${ciclo}s linear infinite${extra}}`);
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

// ---------- roteiro ----------

function montarRoteiro(semanas) {
  const centro = (c) => MARGEM + c * PASSO + CELULA / 2;
  const alvos = [];
  semanas.forEach((s, c) =>
    s.contributionDays.forEach((d) => {
      if (d.contributionCount > 0) alvos.push({ c, d: d.weekday, n: d.contributionCount, x: centro(c), y: TOPO_GRADE + d.weekday * PASSO + CELULA / 2 });
    }),
  );
  const chefe = alvos.reduce((m, a) => (!m || a.n >= m.n ? a : m), null);
  const comuns = alvos.filter((a) => a !== chefe).sort((a, b) => a.c - b.c || b.d - a.d);

  const intervalo = Math.min(0.22, 12 / Math.max(comuns.length, 1));
  const voo = 0.16; // tempo do laser até o alvo
  const velocidade = 320; // px/s do robô

  const caminho = [[0, -70]];
  const tiros = [];
  let t = 1.3;
  let x = comuns[0]?.x ?? chefe?.x ?? 100;
  caminho.push([t, x - CANO_X]);

  const irPara = (alvoX) => {
    if (alvoX === x) return;
    t += Math.max(0.12, Math.abs(alvoX - x) / velocidade);
    x = alvoX;
    caminho.push([t, x - CANO_X]);
  };
  for (const a of comuns) {
    irPara(a.x);
    tiros.push({ alvo: a, t, pontos: a.n });
    t += intervalo;
    caminho.push([t, x - CANO_X]);
  }
  if (chefe) {
    irPara(chefe.x);
    t += 0.3;
    caminho.push([t, x - CANO_X]);
    const partes = [Math.floor(chefe.n / 3), Math.floor(chefe.n / 3)];
    partes.push(chefe.n - partes[0] - partes[1]);
    partes.forEach((p, i) => {
      tiros.push({ alvo: chefe, t, pontos: p, chefe: i + 1 });
      t += 0.4;
    });
    caminho.push([t, x - CANO_X]);
  }
  const fimBatalha = t + voo;
  const fimVitoria = fimBatalha + 3.2;
  caminho.push([fimVitoria, x - CANO_X]);
  return { tiros, chefe, caminho, voo, fimBatalha, fimVitoria };
}

// ---------- desenho ----------

function gerarSvg(calendario, tema, hoje) {
  const T = TEMAS[tema];
  const semanas = calendario.weeks;
  const largura = MARGEM * 2 + semanas.length * PASSO - (PASSO - CELULA);
  const r = montarRoteiro(semanas);
  ciclo = +(r.fimVitoria + 1.4).toFixed(2);
  css.length = 0;
  seq = 0;
  const FIM = ciclo - 0.3; // instante em que tudo volta ao começo
  const camadas = { estrelas: [], celulas: [], invasores: [], lasers: [], explosoes: [], hud: [] };

  // estrelas no campo de batalha
  const rnd = aleatorio(semanas.length * 7919 + calendario.totalContributions);
  const brilhos = ["est1", "est2", "est3"];
  css.push(
    `@keyframes pisca{0%,100%{opacity:.15}50%{opacity:.9}}`,
    `.est1{animation:pisca 2.3s ease-in-out infinite}.est2{animation:pisca 3.1s ease-in-out .7s infinite}.est3{animation:pisca 1.7s ease-in-out 1.3s infinite}`,
  );
  for (let i = 0; i < 46; i++) {
    const sx = Math.round(rnd() * largura);
    const sy = Math.round(4 + rnd() * (ALTURA - 30));
    if (sy > TOPO_GRADE - 6 && sy < BASE_GRADE + 4) continue;
    const tam = rnd() < 0.2 ? 2 : 1;
    camadas.estrelas.push(`<rect class="${brilhos[i % 3]}" x="${sx}" y="${sy}" width="${tam}" height="${tam}" fill="${T.estrela}"/>`);
  }

  // grade: o chão do gráfico e, em cima de cada dia com commit, um invasor em 3D
  const chave = (c, d) => `${c}-${d}`;
  const flashDe = new Map(); // "coluna-dia" -> clarões dos tiros que acertam aquele invasor
  const montarGrade = () => {
    const morteDe = new Map();
    for (const tiro of r.tiros) if (!tiro.chefe || tiro.chefe === 3) morteDe.set(chave(tiro.alvo.c, tiro.alvo.d), tiro.t + r.voo);
    css.push(
      // a formação marcha de lado em passos, como nos fliperamas, e cada invasor flutua
      `@keyframes marcha{0%{transform:translateX(0)}25%{transform:translateX(3px)}50%{transform:translateX(0)}75%{transform:translateX(-3px)}}`,
      `.marcha{animation:marcha 2.4s steps(1,end) infinite}`,
      `@keyframes boia{from{transform:translateY(0)}to{transform:translateY(-3px)}}`,
      `.boia{animation:boia 1.1s ease-in-out infinite alternate}`,
      `.surge{transform-box:fill-box;transform-origin:center}`,
      `@keyframes alerta{0%,100%{stroke-opacity:1}50%{stroke-opacity:.25}}.alerta{animation:alerta .5s steps(2) infinite}`,
    );
    // cada coluna se materializa em sequência no começo do ciclo e some no fim
    const surgeDe = new Map();
    const surge = (c) => {
      if (!surgeDe.has(c)) {
        const t0 = 0.1 + c * 0.02;
        surgeDe.set(
          c,
          anima([
            [0, "opacity:0;transform:scale(0)"],
            [t0, "opacity:0;transform:scale(0)"],
            [t0 + 0.18, "opacity:1;transform:scale(1.35)"],
            [t0 + 0.32, "opacity:1;transform:scale(1)"],
            [FIM - 0.05, "opacity:1;transform:scale(1)"],
            [FIM + 0.2, "opacity:0;transform:scale(0)"],
            [ciclo, "opacity:0;transform:scale(0)"],
          ]),
        );
      }
      return surgeDe.get(c);
    };
    const invasores = [];
    semanas.forEach((s, c) =>
      s.contributionDays.forEach((d) => {
        const x = MARGEM + c * PASSO;
        const y = TOPO_GRADE + d.weekday * PASSO;
        const nivel = NIVEL[d.contributionLevel] ?? 0;
        const titulo = `<title>${d.date}: ${d.contributionCount}</title>`;
        camadas.celulas.push(`<rect x="${x}" y="${y}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.vazio}">${titulo}</rect>`);
        if (d.contributionCount > 0 && nivel) invasores.push({ c, dia: d.weekday, x, y, nivel, titulo });
      }),
    );
    // pinta de trás para a frente: a profundidade vai para cima e para a direita
    invasores.sort((a, b) => a.dia - b.dia || b.c - a.c);
    for (const v of invasores) {
      const { x, y, c, nivel } = v;
      const L = CELULA;
      const P = [0, 2.5, 3, 3.5, 4.5][nivel];
      const base = T.niveis[nivel];
      camadas.celulas.push(`<rect x="${x + 1}" y="${y + 2}" width="${L}" height="${L - 1}" rx="2" fill="${T.sombra}" opacity="${T.sombraOp}"/>`);
      const morte = morteDe.get(chave(c, v.dia));
      const olhosCls =
        morte != null
          ? anima([[0, "opacity:1"], [morte, "opacity:1"], [morte + 0.05, "opacity:0"], [FIM, "opacity:0"], [FIM + 0.05, "opacity:1"], [ciclo, "opacity:1"]])
          : "";
      let chefe = "";
      if (r.chefe && r.chefe.c === c && r.chefe.d === v.dia) {
        chefe = `<g class="${olhosCls}"><rect class="alerta" x="${x - 2.5}" y="${y - P - 2.5}" width="${L + P + 5}" height="${L + P + 5}" rx="3" fill="none" stroke="${VERMELHO}" stroke-width="1.5"/></g>`;
      }
      camadas.invasores.push(
        `<g transform="translate(0 -2)"><g class="surge ${surge(c)}"><g class="boia" style="animation-delay:-${((c * 0.13 + v.dia * 0.21) % 1.1).toFixed(2)}s">` +
          `<polygon points="${x},${y} ${x + P},${y - P} ${x + L + P},${y - P} ${x + L},${y}" fill="${tom(base, 0.38)}"/>` +
          `<polygon points="${x + L},${y} ${x + L + P},${y - P} ${x + L + P},${y + L - P} ${x + L},${y + L}" fill="${tom(base, -0.38)}"/>` +
          `<rect x="${x}" y="${y}" width="${L}" height="${L}" rx=".6" fill="${base}">${v.titulo}</rect>` +
          `<g class="${olhosCls}" fill="${T.olho}"><rect x="${x + 2}" y="${y + 3}" width="2" height="2"/><rect x="${x + 6}" y="${y + 3}" width="2" height="2"/>` +
          `<rect x="${x + 3}" y="${y + 7}" width="4" height="1"/></g>` +
          (flashDe.get(chave(c, v.dia)) ?? []).join("") +
          chefe +
          `</g></g></g>`,
      );
    }
  };

  // tiros, clarões e explosões
  const rndX = aleatorio(4242);
  r.tiros.forEach((tiro) => {
    const { alvo, t } = tiro;
    const impacto = t + r.voo;
    const distancia = ROBO_Y - alvo.y;
    const laser = anima([
      [0, "opacity:0;transform:translateY(0)"],
      [t, "opacity:0;transform:translateY(0)"],
      [t + 0.01, "opacity:1;transform:translateY(0)"],
      [impacto, `opacity:1;transform:translateY(-${distancia}px)`],
      [impacto + 0.01, `opacity:0;transform:translateY(-${distancia}px)`],
      [ciclo, "opacity:0;transform:translateY(0)"],
    ]);
    camadas.lasers.push(
      `<g transform="translate(${alvo.x} ${ROBO_Y})"><g class="${laser}" style="opacity:0">` +
        `<rect x="-3.5" y="-2" width="7" height="16" rx="3.5" fill="${VERMELHO}" opacity=".35"/>` +
        `<rect x="-1.5" y="0" width="3" height="12" rx="1.5" fill="${VERMELHO}"/><rect x="-.5" y="1" width="1" height="6" fill="#ffd0d6"/></g></g>`,
    );
    // clarão no cano
    const cano = anima([[0, "opacity:0"], [t, "opacity:0"], [t + 0.01, "opacity:1"], [t + 0.09, "opacity:0"], [ciclo, "opacity:0"]]);
    camadas.lasers.push(
      `<g class="${cano}" style="opacity:0"><circle cx="${alvo.x}" cy="${ROBO_Y - 1}" r="4" fill="#ffd0d6"/><circle cx="${alvo.x}" cy="${ROBO_Y - 1}" r="2" fill="#fff"/></g>`,
    );
    // clarão no bloco
    const flash = anima([[0, "opacity:0"], [impacto, "opacity:0"], [impacto + 0.01, "opacity:.95"], [impacto + 0.25, "opacity:0"], [ciclo, "opacity:0"]]);
    const k = chave(alvo.c, alvo.d);
    if (!flashDe.has(k)) flashDe.set(k, []);
    flashDe.get(k).push(
      `<rect class="${flash}" style="opacity:0" x="${alvo.x - CELULA / 2}" y="${alvo.y - CELULA / 2}" width="${CELULA}" height="${CELULA}" rx="1" fill="${T.flash}"/>`,
    );
    // explosão: partículas que voam para fora e somem
    const grande = tiro.chefe === 3;
    const escala = grande ? 3 : tiro.chefe ? 1.4 : 2.1;
    const dur = grande ? 0.9 : 0.55;
    const exp = anima([
      [0, "opacity:0;transform:scale(.2)"],
      [impacto, "opacity:0;transform:scale(.2)"],
      [impacto + 0.01, "opacity:1;transform:scale(.35)"],
      [impacto + dur, `opacity:0;transform:scale(${escala})`],
      [ciclo, "opacity:0;transform:scale(.2)"],
    ]);
    const n = grande ? 16 : 9;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rndX() * 0.6;
      const raio = 6 + rndX() * 5;
      const tam = 2 + Math.round(rndX() * 2);
      parts.push(
        `<rect x="${(Math.cos(ang) * raio - tam / 2).toFixed(1)}" y="${(Math.sin(ang) * raio - tam / 2).toFixed(1)}" width="${tam}" height="${tam}" fill="${EXPLOSAO[i % EXPLOSAO.length]}"/>`,
      );
    }
    parts.push(`<circle r="4" fill="${EXPLOSAO[1]}" opacity=".9"/><circle r="2.2" fill="#fff"/>`);
    if (grande) parts.push(`<circle r="9" fill="none" stroke="${EXPLOSAO[3]}" stroke-width="1.5"/>`);
    camadas.explosoes.push(`<g transform="translate(${alvo.x} ${alvo.y - 2})"><g class="${exp}" style="opacity:0">${parts.join("")}</g></g>`);
  });
  montarGrade();

  // HUD: placar que sobe a cada acerto, nome do estágio e vida do chefe
  const fonte = `font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-weight="700"`;
  const marcos = [[0, 0]];
  let soma = 0;
  for (const tiro of r.tiros) {
    soma += tiro.pontos;
    marcos.push([tiro.t + r.voo, soma]);
  }
  const placares = marcos.map(([t0, valor], i) => {
    const t1 = marcos[i + 1]?.[0] ?? FIM;
    const ultimo = i === marcos.length - 1;
    const paradas =
      i === 0
        ? [[0, "opacity:1"], [t1, "opacity:1"], [t1 + 0.01, "opacity:0"], [FIM, "opacity:0"], [FIM + 0.01, "opacity:1"], [ciclo, "opacity:1"]]
        : [[0, "opacity:0"], [t0, "opacity:0"], [t0 + 0.01, "opacity:1"], [ultimo ? FIM : t1, "opacity:1"], [(ultimo ? FIM : t1) + 0.01, "opacity:0"], [ciclo, "opacity:0"]];
    const cls = anima(paradas);
    return `<text class="${cls}" style="opacity:${ultimo ? 1 : 0}" x="${MARGEM + 52}" y="18" fill="${T.hud}">${String(valor).padStart(6, "0")}</text>`;
  });
  camadas.hud.push(
    `<g ${fonte} font-size="12" letter-spacing="1">`,
    `<text x="${MARGEM}" y="18" fill="${T.hudFraco}">SCORE</text>`,
    ...placares,
    `<text x="${largura / 2}" y="18" text-anchor="middle" fill="${T.hudFraco}">ÚLTIMOS 12 MESES</text>`,
  );
  if (r.chefe) {
    const bx = largura - MARGEM - 3 * 12;
    camadas.hud.push(`<text x="${bx - 8}" y="18" text-anchor="end" fill="${VERMELHO}">BOSS</text>`);
    r.tiros.filter((t) => t.chefe).forEach((tiro, i) => {
      const im = tiro.t + r.voo;
      const cls = anima([[0, "opacity:1"], [im, "opacity:1"], [im + 0.01, "opacity:.15"], [FIM, "opacity:.15"], [FIM + 0.01, "opacity:1"], [ciclo, "opacity:1"]]);
      camadas.hud.push(`<rect class="${cls}" x="${bx + i * 12}" y="9" width="10" height="9" rx="1" fill="${VERMELHO}"/>`);
    });
  }
  camadas.hud.push(`</g>`);

  // mensagens no meio do campo
  const meioY = (BASE_GRADE + ROBO_Y) / 2 + 6;
  const pronto = anima([[0, "opacity:1"], [1.2, "opacity:1"], [1.25, "opacity:0"], [ciclo, "opacity:0"]]);
  const vitoria = anima([[0, "opacity:0"], [r.fimBatalha + 0.5, "opacity:0"], [r.fimBatalha + 0.51, "opacity:1"], [r.fimVitoria, "opacity:1"], [r.fimVitoria + 0.01, "opacity:0"], [ciclo, "opacity:0"]]);
  css.push(`@keyframes piscaTexto{0%,60%{fill-opacity:1}61%,100%{fill-opacity:.2}}.piscaTexto{animation:piscaTexto .7s infinite}`);
  const total = calendario.totalContributions.toLocaleString("pt-BR");
  const mensagens = `<g ${fonte} text-anchor="middle">
<g class="${pronto}"><text class="piscaTexto" x="${largura / 2}" y="${meioY}" font-size="15" letter-spacing="3" fill="${T.hud}">READY?</text></g>
<g class="${vitoria}" style="opacity:0"><text class="piscaTexto" x="${largura / 2}" y="${meioY - 4}" font-size="16" letter-spacing="3" fill="${EXPLOSAO[2]}">STAGE CLEAR</text>
<text x="${largura / 2}" y="${meioY + 13}" font-size="11" letter-spacing="1" fill="${T.hudFraco}">+${total} contribuições</text></g></g>`;

  // robô
  const robo = { corpo: [], olhos: [], chama: [], nucleo: [] };
  const larguraRobo = ROBO[0].length;
  ROBO.forEach((linha, y) => {
    if (linha.length !== larguraRobo) throw new Error(`linha do robô com largura errada: ${linha}`);
    [...linha].forEach((ch, x) => {
      if (ch === ".") return;
      const ret = `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${COR_ROBO[ch]}"/>`;
      (ch === "E" || ch === "e" ? robo.olhos : ch === "F" ? robo.chama : ch === "A" ? robo.nucleo : robo.corpo).push(ret);
    });
  });
  const caminho = [...r.caminho, [r.fimVitoria + 0.9, largura + 20], [ciclo, largura + 20]];
  const voo = anima(caminho.map(([t, x]) => [t, `transform:translateX(${x.toFixed(1)}px)`]));
  // recuo a cada tiro
  const recuo = anima([
    [0, "transform:translateY(0)"],
    ...r.tiros.flatMap((tiro) => [[tiro.t, "transform:translateY(0)"], [tiro.t + 0.02, "transform:translateY(3px)"], [tiro.t + 0.12, "transform:translateY(0)"]]),
    [ciclo, "transform:translateY(0)"],
  ]);
  css.push(
    `@keyframes flutua{from{transform:translateY(0)}to{transform:translateY(-3px)}}.flutua{animation:flutua .8s ease-in-out infinite alternate}`,
    `@keyframes chama{from{transform:scaleY(1);opacity:1}to{transform:scaleY(.4);opacity:.65}}.chama{animation:chama .1s steps(2) infinite alternate;transform-box:fill-box;transform-origin:top}`,
    `@keyframes olhos{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.15)}}.olhos{animation:olhos 3.3s infinite;transform-box:fill-box;transform-origin:center}`,
    `@keyframes nucleo{from{opacity:.55}to{opacity:1}}.nucleo{animation:nucleo .5s ease-in-out infinite alternate}`,
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}}`,
  );
  const xParado = (r.caminho[1]?.[1] ?? 0).toFixed(1);
  const roboSvg = `<g class="${voo}" style="transform:translateX(${xParado}px)"><g transform="translate(0 ${ROBO_Y})"><g class="flutua"><g class="${recuo}" shape-rendering="crispEdges">
<g>${robo.corpo.join("")}</g><g class="nucleo">${robo.nucleo.join("")}</g><g class="olhos">${robo.olhos.join("")}</g><g class="chama">${robo.chama.join("")}</g>
</g></g></g></g>`;

  const data = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${ALTURA}" viewBox="0 0 ${largura} ${ALTURA}" role="img" aria-label="Batalha arcade no gráfico de contribuições de ${usuario ?? "GitHub"}: ${total} contribuições no último ano">
<style>${css.join("")}</style>
<g shape-rendering="crispEdges">${camadas.estrelas.join("")}</g>
<g shape-rendering="crispEdges">${camadas.celulas.join("")}</g>
<g class="marcha"><g>${camadas.invasores.join("")}</g>
<g>${camadas.explosoes.join("")}</g></g>
<g>${camadas.lasers.join("")}</g>
${roboSvg}
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
  const arquivo = join(saida, `arcade-${tema}.svg`);
  await writeFile(arquivo, gerarSvg(calendario, tema, hoje));
  console.log(`gerado ${arquivo}`);
}
