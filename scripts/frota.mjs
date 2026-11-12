// Gera o SVG animado do perfil: uma frota alienígena chega em ondas, entra em formação e mergulha
// sobre a nave lá de baixo. O gráfico começa vazio: cada inimigo abatido solta um bloco verde que
// cai até o dia certo do calendário, e o gráfico de contribuições vai se montando a cada abate.
// Um inimigo por dia com commit. Comandantes (dias de mais commits) aguentam dois tiros.
//
// Uma nave só, a não ser que ela demore demais (ciclo acima de LIMITE_UMA_NAVE): aí entram duas.
//
// Uso:
//   GITHUB_TOKEN=... node scripts/frota.mjs --usuario ChMoreiraa --saida dist
//   node scripts/frota.mjs --entrada contrib.json --saida dist   (sem rede, para testar)
//   --naves 1|2 força o número de naves; --debug <arquivo> grava um resumo da simulação.
//
// Saída: frota-dark.svg e frota-light.svg na pasta --saida.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
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
    const texto = await readFile(args.entrada, "utf8");
    const json = JSON.parse(texto.slice(texto.indexOf("{")));
    return json.data.user.contributionsCollection.contributionCalendar;
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token || !usuario) throw new Error("Faltam GITHUB_TOKEN e/ou --usuario.");
  const resp = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "perfil-frota" },
    body: JSON.stringify({ query: QUERY, variables: { login: usuario } }),
  });
  const json = await resp.json();
  if (!resp.ok || json.errors) throw new Error(`GraphQL falhou: ${resp.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar;
}

// ---------- paleta ----------

const NIVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

// os verdes do gráfico do GitHub, nos dois temas; blocos planos, sem 3D
const TEMAS = {
  dark: {
    vazio: "#161b22",
    niveis: [null, "#0e4429", "#006d32", "#26a641", "#39d353"],
    estrela: "#cbd5ff",
    hud: "#ece9f7",
    hudFraco: "#8f8aa8",
    pouso: "#d9ffe0",
    aviso: "#ffd166",
    vitoria: "#ffb703",
  },
  light: {
    vazio: "#ebedf0",
    niveis: [null, "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    estrela: "#9a93b8",
    hud: "#241f33",
    hudFraco: "#6b6880",
    pouso: "#216e39",
    aviso: "#b45309",
    vitoria: "#d97706",
  },
};
const VERMELHO = "#ff2e4d";
const EXPLOSAO = ["#fff3b0", "#ffd166", "#ffb703", "#ff8c1a", "#ff5400", "#e63946"];

// ---------- sprites (pixel art original) ----------

// Nave de caça vista de cima, bico para cima: casco prateado, cabine ciano, asas largas com
// pontas vermelhas e dois bocais de propulsão.
const NAVE = [
  ".......K.......",
  "......KRK......",
  "......KWK......",
  ".....KWLMK.....",
  ".....KLcMK.....",
  "....KWCcCMK....",
  "....KLCCCMK....",
  "..K.KLLCLMK.K..",
  ".KRKKWLLLMKKRK.",
  ".KAKKWLMLMKKAK.",
  "KAaAKLLMMMKAaAK",
  "KAaAKWLMMDKAaAK",
  "KAAAAKLMMKAAAAK",
  "KAAKKKMDDKKKAAK",
  "KKK..KDKDK..KKK",
  "......K.K......",
];
const COR_NAVE = [
  // nave 1: asas roxas
  { K: "#0f0d16", W: "#f6f8fc", L: "#d3d8e2", M: "#9aa2b3", D: "#5d6577", R: VERMELHO, C: "#38bdf8", c: "#bae6fd", A: "#8b5cf6", a: "#c4b5fd" },
  // nave 2: asas ciano, para dar para distinguir
  { K: "#0f0d16", W: "#f6f8fc", L: "#d3d8e2", M: "#9aa2b3", D: "#5d6577", R: "#ffd166", C: "#a78bfa", c: "#ede9fe", A: "#0891b2", a: "#67e8f9" },
];
const PX_NAVE = 2;

// Três tipos de inimigo, todos olhando para baixo (para a nave), com dois quadros de bater de asa.
const TIPOS = {
  // zangão: dias de poucos commits
  zangao: {
    px: 2,
    vida: 1,
    pontos: 100,
    cores: { K: "#1a1208", O: "#fb923c", Y: "#fde047", w: "#e0f2fe", E: VERMELHO },
    quadros: [
      [
        "..K.....K..",
        "...K...K...",
        "..KKOOOKK..",
        "wwKOYOYOKww",
        "wwKOOOOOKww",
        ".wKEOOOEKw.",
        "..KKOOOKK..",
        "....KOK....",
        ".....K.....",
      ],
      [
        "..K.....K..",
        "...K...K...",
        "..KKOOOKK..",
        "..KOYOYOK..",
        ".wKOOOOOKw.",
        "wwKEOOOEKww",
        "ww.KOOOK.ww",
        "....KOK....",
        ".....K.....",
      ],
    ],
  },
  // medusa: dias médios
  medusa: {
    px: 2,
    vida: 1,
    pontos: 200,
    cores: { K: "#06151f", C: "#22d3ee", c: "#cffafe", B: "#0e7490", E: "#fde047" },
    quadros: [
      [
        "...KKKKK...",
        "..KcCCCcK..",
        ".KcCCCCCcK.",
        ".KCEBCBECK.",
        ".KCCCCCCCK.",
        "..KBKBKBK..",
        "..K.K.K.K..",
        ".K..K.K..K.",
        "...........",
      ],
      [
        "...KKKKK...",
        "..KcCCCcK..",
        ".KcCCCCCcK.",
        ".KCEBCBECK.",
        ".KCCCCCCCK.",
        "..KBKBKBK..",
        "...K.K.K...",
        "..K..K..K..",
        "...........",
      ],
    ],
  },
  // comandante coroado: dias de mais commits, aguenta dois tiros
  comandante: {
    px: 2,
    vida: 2,
    pontos: 400,
    cores: { K: "#120a1f", P: "#8b5cf6", p: "#ddd6fe", G: "#fbbf24", E: "#f0abfc", w: "#c4b5fd" },
    ferido: { P: "#db2777", p: "#fbcfe8", w: "#f9a8d4" },
    quadros: [
      [
        "..G...G...G..",
        "..GG.GGG.GG..",
        "...GGGGGGG...",
        "..KKKKKKKKK..",
        ".KpPPPPPPPpK.",
        "KpPEEPPPEEPpK",
        "KPPEEPPPEEPPK",
        "KPPPPPPPPPPPK",
        "wKPPKPPPKPPKw",
        "wwKK.KPK.KKww",
        "ww....K....ww",
      ],
      [
        "..G...G...G..",
        "..GG.GGG.GG..",
        "...GGGGGGG...",
        "..KKKKKKKKK..",
        ".KpPPPPPPPpK.",
        "KpPEEPPPEEPpK",
        "KPPEEPPPEEPPK",
        "KPPPPPPPPPPPK",
        "KKPPKPPPKPPKK",
        "wwKK.KPK.KKww",
        ".w....K....w.",
      ],
    ],
  },
};
const tipoDoNivel = (n) => (n >= 3 ? "comandante" : n === 2 ? "medusa" : "zangao");

// ---------- geometria ----------

const CELULA = 10;
const PASSO = 13;
const MARGEM = 16;
const LINHAS_GRADE = 7;
const FORMACAO_Y = 40; // linha de cima da formação
const FORMACAO_DY = 22;
const FORMACAO_DX = 31;
const POR_LINHA = 9; // inimigos por linha da formação
const TOPO_GRADE = 124; // o calendário fica no meio: a frota em cima, a nave embaixo
const BASE_GRADE = TOPO_GRADE + LINHAS_GRADE * PASSO - (PASSO - CELULA);
const NAVE_Y = BASE_GRADE + 36; // centro da nave
const ALTURA = NAVE_Y + 46;
const celX = (c) => MARGEM + c * PASSO;
const celY = (l) => TOPO_GRADE + l * PASSO;

// ---------- tempo e jogo ----------

const INICIO = 1.4; // antes disso: READY?
const DT = 1 / 40; // passo da simulação
const VEL_TIRO = 430; // px/s
const VEL_NAVE = 165; // px/s
const RECARGA = 0.26; // s entre tiros da mesma nave
const MAX_TIROS = 2; // tiros no ar por nave
const VEL_TIRO_INIMIGO = 190;
const AMPLITUDE = 56; // a formação balança de um lado para o outro
const PERIODO = 7.5;
const DUR_ENTRADA = 2.7;
const DUR_MERGULHO = 2.8;
const DUR_RETORNO = 1.1;
const POR_ONDA = 24;
const PAUSA_ONDA = 1.6;
const DUR_QUEDA = 0.85; // bloco caindo até a casa do dia
const LIMITE_UMA_NAVE = 42; // segundos de jogo; passou disso, entram duas naves
const MAX_TEMPO = 160;

let largura = 0;

// ---------- utilidades ----------

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
      if (p <= ultimo) p = Math.min(100, ultimo + 0.003);
      ultimo = p;
      return `${+p.toFixed(3)}%{${regra}}`;
    })
    .join("");
  css.push(`@keyframes ${nome}{${corpo}}.${nome}{animation:${nome} ${ciclo}s linear infinite}`);
  return nome;
}

function aleatorio(semente) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const r1 = (v) => +v.toFixed(1);

/** Ramer–Douglas–Peucker numa série [t, v1, v2...]: tira os pontos que a interpolação linear já cobre. */
function simplificar(amostras, tolerancia, pesos = []) {
  const n = amostras.length;
  if (n <= 2) return amostras;
  const manter = new Uint8Array(n);
  manter[0] = manter[n - 1] = 1;
  const pilha = [[0, n - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop();
    const A = amostras[a], B = amostras[b];
    let maior = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const f = (amostras[i][0] - A[0]) / (B[0] - A[0] || 1);
      let d = 0;
      for (let k = 1; k < A.length; k++) d = Math.max(d, Math.abs(A[k] + (B[k] - A[k]) * f - amostras[i][k]) * (pesos[k - 1] ?? 1));
      if (d > maior) { maior = d; idx = i; }
    }
    if (maior > tolerancia) { manter[idx] = 1; pilha.push([a, idx], [idx, b]); }
  }
  return amostras.filter((_, i) => manter[i]);
}

/** Curva Catmull-Rom pelos pontos, percorrida em velocidade constante: devolve u (0..1) => [x, y]. */
function curva(pontos) {
  const P = [
    [2 * pontos[0][0] - pontos[1][0], 2 * pontos[0][1] - pontos[1][1]],
    ...pontos,
    [2 * pontos.at(-1)[0] - pontos.at(-2)[0], 2 * pontos.at(-1)[1] - pontos.at(-2)[1]],
  ];
  const pts = [];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let k = 0; k < 28; k++) {
      const s = k / 28, s2 = s * s, s3 = s2 * s;
      const f = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * s + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * s2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * s3);
      pts.push([f(0), f(1)]);
    }
  }
  pts.push(pontos.at(-1));
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = acum.at(-1);
  return (u) => {
    const alvo = Math.max(0, Math.min(1, u)) * total;
    let lo = 0, hi = acum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acum[m] < alvo) lo = m; else hi = m; }
    const f = (alvo - acum[lo]) / (acum[hi] - acum[lo] || 1);
    return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
  };
}

const balanco = (t) => (t < INICIO ? 0 : AMPLITUDE * Math.sin((2 * Math.PI * (t - INICIO)) / PERIODO));

// ---------- simulação ----------

function simular(dias, naves) {
  const W = largura;
  const sorte = aleatorio(dias.length * 977 + naves * 31 + dias.reduce((s, d) => s + d.count, 0));
  const meio = W / 2;

  // ondas: os dias em ordem cronológica, divididos em ondas parecidas
  const nOndas = Math.max(1, Math.ceil(dias.length / POR_ONDA));
  const tamOnda = Math.ceil(dias.length / nOndas);
  const ondas = [];
  for (let i = 0; i < dias.length; i += tamOnda) ondas.push(dias.slice(i, i + tamOnda));

  const inimigos = [];
  const tiros = [];
  const tirosInimigos = [];
  const marcas = []; // textos: ondas
  const frota = Array.from({ length: naves }, (_, i) => ({
    x: naves === 1 ? meio : (W * (i + 1)) / (naves + 1),
    rastro: [],
    recarga: 0,
    noAr: 0,
    disparos: [],
  }));

  /** Posição absoluta do inimigo no instante t (segue a fase em que ele está). */
  const posicao = (e, t) => {
    let f = e.fases[e.fases.length - 1];
    for (const fase of e.fases) if (t < fase.t1) { f = fase; break; }
    if (f.tipo === "parado") return f.ponto;
    if (f.tipo === "vaga") return [meio + e.vaga[0] + balanco(t), e.vaga[1]];
    return f.fn((t - f.t0) / (f.t1 - f.t0));
  };
  const vagaEm = (e, t) => [meio + e.vaga[0] + balanco(t), e.vaga[1]];

  let t = INICIO;
  let inicioOnda = INICIO;
  for (let w = 0; w < ondas.length; w++) {
    // vagas na formação: dias de mais commits na linha de cima
    const lista = ondas[w].map((d) => ({ dia: d, tipo: tipoDoNivel(d.nivel) }));
    const ordem = [...lista].sort((a, b) => b.dia.nivel - a.dia.nivel || a.dia.date.localeCompare(b.dia.date));
    const nLinhas = Math.ceil(ordem.length / POR_LINHA);
    const base = Math.floor(ordem.length / nLinhas), sobra = ordem.length % nLinhas;
    let k = 0;
    for (let l = 0; l < nLinhas; l++) {
      const n = base + (l < sobra ? 1 : 0);
      for (let i = 0; i < n; i++, k++) ordem[k].vaga = [(i - (n - 1) / 2) * FORMACAO_DX, FORMACAO_Y + l * FORMACAO_DY];
    }
    // entrada em grupos de até 6, alternando lados e caminhos
    const grupos = [];
    const porColuna = [...ordem].sort((a, b) => a.vaga[0] - b.vaga[0] || a.vaga[1] - b.vaga[1]);
    const metade = Math.ceil(porColuna.length / 2);
    const esq = porColuna.slice(0, metade), dir = porColuna.slice(metade).reverse();
    for (let i = 0; i < Math.max(esq.length, dir.length); i += 6) {
      if (esq.slice(i, i + 6).length) grupos.push({ membros: esq.slice(i, i + 6), lado: -1 });
      if (dir.slice(i, i + 6).length) grupos.push({ membros: dir.slice(i, i + 6), lado: 1 });
    }
    grupos.forEach((g, gi) => {
      const doAlto = gi % 4 >= 2;
      g.membros.forEach((m, mi) => {
        const t0 = inicioOnda + gi * 0.95 + mi * 0.17;
        const t1 = t0 + DUR_ENTRADA;
        const s = g.lado;
        const fim = [meio + m.vaga[0] + balanco(t1), m.vaga[1]];
        const pontos = doAlto
          ? [[meio + s * 30, -26], [meio + s * 70, 70], [meio + s * 160, 150], [meio + s * 240, 118], [meio + s * 205, 68], fim]
          : [[s < 0 ? -26 : W + 26, 178], [meio + s * 250, 160], [meio + s * 150, 112], [meio + s * 175, 58], [meio + s * 240, 82], fim];
        const e = {
          id: inimigos.length,
          onda: w,
          dia: m.dia,
          tipo: m.tipo,
          vida: TIPOS[m.tipo].vida,
          vaga: [m.vaga[0], m.vaga[1]],
          entra: t0,
          morte: null,
          ferido: null,
          fases: [
            { tipo: "parado", t0: 0, t1: t0, ponto: pontos[0] },
            { tipo: "curva", t0, t1, fn: curva(pontos), entrada: true },
            { tipo: "vaga", t0: t1, t1: Infinity },
          ],
        };
        inimigos.push(e);
      });
    });
    const daOnda = inimigos.filter((e) => e.onda === w);
    const fimEntrada = Math.max(...daOnda.map((e) => e.fases[1].t1));
    marcas.push({ onda: w, t: inicioOnda });

    let proximoMergulho = inicioOnda + 3.2;
    const alvoDe = new Map(); // inimigo -> nave que já atirou nele (tiro no ar)
    while (daOnda.some((e) => e.morte == null) && t < MAX_TEMPO) {
      const vivos = daOnda.filter((e) => e.morte == null);
      // mergulhos: um de cada vez no começo; com poucos sobrando, todos mergulham
      const naVaga = vivos.filter((e) => { const f = e.fases.at(-1); return f.tipo === "vaga" && t >= f.t0; });
      const mergulhando = vivos.length - naVaga.length - vivos.filter((e) => t < e.fases[1].t1).length;
      const limite = vivos.length <= 4 ? 4 : vivos.length <= 10 ? 3 : 2;
      if (t >= proximoMergulho && naVaga.length && mergulhando < limite) {
        const e = naVaga[Math.floor(sorte() * naVaga.length)];
        const f = e.fases.at(-1);
        f.t1 = t;
        const [sx, sy] = vagaEm(e, t);
        const s = sx < meio ? -1 : 1;
        const naveAlvo = frota.reduce((m, n) => (Math.abs(n.x - sx) < Math.abs(m.x - sx) ? n : m));
        const tx = Math.max(MARGEM + 20, Math.min(W - MARGEM - 20, naveAlvo.x + (sorte() < 0.5 ? -1 : 1) * (26 + sorte() * 30)));
        const pontos = [[sx, sy], [sx + s * 16, sy - 16], [sx + s * 30, sy + 2], [(sx + tx) / 2, TOPO_GRADE + 30], [tx, NAVE_Y - 4], [tx - s * 46, ALTURA + 30]];
        const tm = t + DUR_MERGULHO, tr = tm + DUR_RETORNO;
        const volta = vagaEm(e, tr);
        e.fases.push(
          { tipo: "curva", t0: t, t1: tm, fn: curva(pontos), mergulho: true },
          { tipo: "curva", t0: tm, t1: tr, fn: curva([[volta[0] - s * 40, -26], [volta[0] - s * 12, volta[1] - 30], volta]), retorno: true },
          { tipo: "vaga", t0: tr, t1: Infinity },
        );
        // atira uma vez no meio do mergulho (só fica se não passar por cima de uma nave)
        if (sorte() < 0.8) {
          const u = 0.3 + sorte() * 0.1;
          const [bx, by] = curva(pontos)(u);
          tirosInimigos.push({ t: t + u * DUR_MERGULHO, x: bx, y: by, dono: e });
        }
        proximoMergulho = t + (vivos.length <= 6 ? 0.5 : 0.85 + sorte() * 0.7);
      }

      // naves: escolhem um alvo, alinham e atiram
      for (const [ni, nave] of frota.entries()) {
        const bocaY = NAVE_Y - 16;
        let melhor = null;
        for (const e of vivos) {
          if (alvoDe.has(e) && alvoDe.get(e) !== ni) continue;
          if (alvoDe.get(e) === ni && e.vida === 1) continue; // já tem tiro indo para ele
          const agora = posicao(e, t);
          if (agora[1] < 14 || agora[1] > bocaY - 16 || agora[0] < 4 || agora[0] > W - 4) continue;
          let tau = (bocaY - agora[1]) / VEL_TIRO;
          let p = posicao(e, t + tau);
          tau = Math.max(0, (bocaY - p[1]) / VEL_TIRO);
          p = posicao(e, t + tau);
          if (p[1] > bocaY - 10 || p[1] < 10) continue;
          const fase = e.fases.find((f) => t < f.t1);
          let custo = Math.abs(p[0] - nave.x) / VEL_NAVE;
          if (fase?.mergulho) custo -= 0.6;
          if (naves > 1) {
            // cada nave cuida mais do próprio lado
            const outra = frota[1 - ni];
            if (Math.abs(p[0] - outra.x) < Math.abs(p[0] - nave.x)) custo += 0.5;
          }
          if (!melhor || custo < melhor.custo) melhor = { e, p, custo };
        }
        let destino = melhor ? melhor.p[0] : naves === 1 ? meio : (W * (ni + 1)) / (naves + 1);
        const passo = VEL_NAVE * DT;
        nave.x += Math.max(-passo, Math.min(passo, destino - nave.x));
        nave.x = Math.max(MARGEM + 14, Math.min(W - MARGEM - 14, nave.x));
        if (naves > 1) {
          if (ni === 0) nave.x = Math.min(nave.x, frota[1].x - 30);
          else nave.x = Math.max(nave.x, frota[0].x + 30);
        }
        nave.recarga -= DT;
        if (melhor && nave.recarga <= 0 && nave.noAr < MAX_TIROS && Math.abs(melhor.p[0] - nave.x) < 2.5) {
          nave.recarga = RECARGA;
          nave.noAr++;
          alvoDe.set(melhor.e, ni);
          tiros.push({ nave: ni, alvo: melhor.e, t0: t, x: nave.x, y0: bocaY, y: bocaY, fim: null, acerto: null });
        }
      }

      // tiros sobem; acerto é conferido em três subpassos
      for (const tiro of tiros) {
        if (tiro.fim != null) continue;
        for (let sub = 1; sub <= 3 && tiro.fim == null; sub++) {
          const ts = t + (sub * DT) / 3;
          const y = tiro.y0 - VEL_TIRO * (ts - tiro.t0);
          if (y < -6) { tiro.fim = ts; tiro.y = -6; break; }
          for (const e of daOnda) {
            if (e.morte != null || ts < e.entra) continue;
            const [ex, ey] = posicao(e, ts);
            const raio = e.tipo === "comandante" ? 11 : 9;
            if (Math.abs(ex - tiro.x) < raio && Math.abs(ey - y) < raio) {
              tiro.fim = ts; tiro.y = ey; tiro.acerto = e;
              e.vida--;
              if (e.vida <= 0) {
                const fm = e.fases.find((f) => ts < f.t1);
                e.morte = ts; e.ondeMorreu = [ex, ey]; e.mergulhando = !!fm?.mergulho;
                e.faseMorte = fm?.entrada ? "entrada" : fm?.mergulho ? "mergulho" : fm?.retorno ? "retorno" : "vaga";
              }
              else e.ferido = ts;
              break;
            }
          }
        }
        if (tiro.fim != null) {
          frota[tiro.nave].noAr--;
          if (alvoDe.get(tiro.alvo) === tiro.nave) alvoDe.delete(tiro.alvo);
        } else tiro.y = tiro.y0 - VEL_TIRO * (t + DT - tiro.t0);
      }

      for (const nave of frota) nave.rastro.push([t, nave.x]);
      t += DT;
    }
    // a última onda acaba aqui; as outras esperam um pouco antes da próxima
    const ultimaMorte = Math.max(...daOnda.map((e) => e.morte ?? t));
    inicioOnda = ultimaMorte + PAUSA_ONDA;
    while (t < inicioOnda && w < ondas.length - 1) {
      for (const [ni, nave] of frota.entries()) {
        const centro = naves === 1 ? meio : (W * (ni + 1)) / (naves + 1);
        nave.x += Math.max(-VEL_NAVE * DT, Math.min(VEL_NAVE * DT, centro - nave.x));
        nave.rastro.push([t, nave.x]);
      }
      t += DT;
    }
  }
  const fim = Math.max(...inimigos.map((e) => e.morte ?? t));
  // tiros inimigos: só os que não passam por cima de uma nave e saem antes do fim
  const naveEm = (nave, tt) => {
    const r = nave.rastro;
    if (tt <= r[0][0]) return r[0][1];
    const i = Math.min(r.length - 1, Math.max(0, Math.round((tt - r[0][0]) / DT)));
    return r[i][1];
  };
  const tirosInimigosOk = tirosInimigos.filter((ti) => {
    if (ti.dono.morte != null && ti.dono.morte < ti.t) return false;
    if (ti.t + (ALTURA - ti.y) / VEL_TIRO_INIMIGO > fim) return false;
    const tc = ti.t + (NAVE_Y - ti.y) / VEL_TIRO_INIMIGO;
    return frota.every((n) => [-0.12, 0, 0.12].every((d) => Math.abs(naveEm(n, tc + d) - ti.x) > 16));
  });
  return { inimigos, tiros, tirosInimigos: tirosInimigosOk, frota, marcas, fim, posicao, timeout: t >= MAX_TEMPO };
}

// ---------- desenho ----------

/** Transforma um desenho de letras em retângulos. */
function pixels(desenho, cores, px) {
  const r = [];
  desenho.forEach((linha, y) => {
    if (linha.length !== desenho[0].length) throw new Error(`linha com largura errada: "${linha}"`);
    for (let x = 0; x < linha.length; ) {
      const ch = linha[x];
      if (ch === ".") { x++; continue; }
      if (!cores[ch]) throw new Error(`cor sem definição: ${ch}`);
      let n = 1;
      while (linha[x + n] === ch) n++;
      r.push(`<rect x="${r1(x * px)}" y="${r1(y * px)}" width="${r1(n * px)}" height="${px}" fill="${cores[ch]}"/>`);
      x += n;
    }
  });
  return r.join("");
}

function gerarSvg(calendario, tema, hoje, naves) {
  const T = TEMAS[tema];
  const semanas = calendario.weeks;
  const dias = [];
  semanas.forEach((s, c) =>
    s.contributionDays.forEach((d) => {
      if (d.contributionCount > 0) dias.push({ date: d.date, count: d.contributionCount, nivel: Math.max(1, NIVEL[d.contributionLevel] ?? 1), c, l: d.weekday });
    }),
  );
  dias.sort((a, b) => a.date.localeCompare(b.date));
  const sim = simular(dias, naves);
  const W = largura;
  const fimJogo = sim.fim + DUR_QUEDA;
  const fimVitoria = fimJogo + 3.6;
  ciclo = +(fimVitoria + 0.9).toFixed(2);
  const FIM = ciclo - 0.4;
  css.length = 0;
  seq = 0;
  const camadas = { estrelas: [], chao: [], blocos: [], tirosInimigos: [], inimigos: [], tiros: [], naves: [], explosoes: [], hud: [] };

  // estrelas que descem devagar, em duas camadas (a de trás mais lenta)
  const rnd = aleatorio(semanas.length * 7919 + calendario.totalContributions);
  css.push(
    `@keyframes pisca{0%,100%{opacity:.15}50%{opacity:.9}}`,
    `.est1{animation:pisca 2.3s ease-in-out infinite}.est2{animation:pisca 3.1s ease-in-out .7s infinite}.est3{animation:pisca 1.7s ease-in-out 1.3s infinite}`,
    `@keyframes desce{from{transform:translateY(0)}to{transform:translateY(${ALTURA}px)}}.desce1{animation:desce 22s linear infinite}.desce2{animation:desce 13s linear infinite}`,
  );
  for (const camada of [1, 2]) {
    const pontos = [];
    for (let i = 0; i < (camada === 1 ? 36 : 22); i++) {
      const sx = Math.round(rnd() * W), sy = Math.round(rnd() * ALTURA);
      const tam = camada === 2 && rnd() < 0.4 ? 2 : 1;
      const est = (y) => `<rect class="est${(i % 3) + 1}" x="${sx}" y="${y}" width="${tam}" height="${tam}" fill="${T.estrela}"/>`;
      pontos.push(est(sy), est(sy - ALTURA));
    }
    camadas.estrelas.push(`<g class="desce${camada}">${pontos.join("")}</g>`);
  }

  // o calendário começa vazio: só as casas
  semanas.forEach((s, c) =>
    s.contributionDays.forEach((d) => {
      camadas.chao.push(`<rect x="${celX(c)}" y="${celY(d.weekday)}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.vazio}"><title>${d.date}: ${d.contributionCount}</title></rect>`);
    }),
  );

  // inimigos: cada um num grupo que balança junto com a formação
  css.push(
    `@keyframes asaA{0%,49%{opacity:1}50%,100%{opacity:0}}.asaA{animation:asaA .46s infinite}`,
    `@keyframes asaB{0%,49%{opacity:0}50%,100%{opacity:1}}.asaB{animation:asaB .46s infinite}`,
  );
  const paradasBalanco = [];
  for (let tt = 0; tt <= ciclo + 1e-6; tt += 0.125) paradasBalanco.push([tt, `transform:translateX(${r1(balanco(tt))}px)`]);
  const clsBalanco = anima(paradasBalanco);

  // cada desenho vai uma vez só nos <defs>; os inimigos usam <use>
  const sprites = {};
  const defs = [];
  for (const [nome, tipo] of Object.entries(TIPOS)) {
    const w = tipo.quadros[0][0].length * tipo.px, h = tipo.quadros[0].length * tipo.px;
    const desenha = (id, cores) => {
      tipo.quadros.forEach((q, i) => defs.push(`<g id="${id}${i}">${pixels(q, cores, tipo.px)}</g>`));
      return `<use href="#${id}0" class="asaA"/><use href="#${id}1" class="asaB"/>`;
    };
    sprites[nome] = {
      w, h,
      normal: desenha(nome, tipo.cores),
      ferido: tipo.ferido ? desenha(`${nome}F`, { ...tipo.cores, ...tipo.ferido }) : null,
    };
  }

  for (const e of sim.inimigos) {
    // amostra a trajetória fase a fase; o grupo de fora já soma o balanço, então aqui vai a posição relativa
    const ate = e.morte ?? FIM;
    const trechos = [];
    let atual = [];
    let anguloAnterior = 0;
    for (let fi = 1; fi < e.fases.length; fi++) {
      const f = e.fases[fi];
      if (f.t0 >= ate) break;
      const t1 = Math.min(f.t1, ate);
      const dt = f.tipo === "vaga" ? Math.max(0.5, (t1 - f.t0) / 2) : 0.02;
      const amostras = [];
      for (let tt = f.t0; tt < t1; tt += dt) amostras.push(tt);
      amostras.push(t1);
      for (const tt of amostras) {
        const [x, y] = sim.posicao(e, Math.min(tt, f.t1 - 1e-6));
        let a = 0;
        if (f.tipo === "curva") {
          const u = (tt - f.t0) / (f.t1 - f.t0);
          const p1 = f.fn(Math.max(0, u - 0.004)), p2 = f.fn(Math.min(1, u + 0.004));
          a = (Math.atan2(p2[1] - p1[1], p2[0] - p1[0]) * 180) / Math.PI - 90;
          a = ((a + 540) % 360) - 180;
          // vira suave: sai da vaga olhando para baixo e chega nela olhando para baixo
          const ini = Math.min(1, (tt - f.t0) / 0.25), fimF = Math.min(1, (f.t1 - tt) / 0.3);
          if (f.mergulho) a *= ini;
          if (f.entrada || f.retorno) a *= fimF;
        }
        // desembrulha o ângulo para não dar a volta inteira no meio do caminho
        while (a - anguloAnterior > 180) a -= 360;
        while (a - anguloAnterior < -180) a += 360;
        anguloAnterior = a;
        const ponto = [tt, x - balanco(tt), y, a];
        const ant = atual.at(-1);
        if (ant && Math.hypot(ponto[1] - ant[1], ponto[2] - ant[2]) > 30) { trechos.push(atual); atual = []; }
        if (ant && ponto[0] - ant[0] < 1e-4 && !(Math.hypot(ponto[1] - ant[1], ponto[2] - ant[2]) > 30)) continue;
        atual.push(ponto);
      }
    }
    trechos.push(atual);
    const pts = trechos.filter((tr) => tr.length).flatMap((tr) => simplificar(tr, 0.45, [1, 1, 0.06]));
    const tf = (p) => `transform:translate(${r1(p[1])}px,${r1(p[2])}px) rotate(${Math.round(p[3])}deg)`;
    const primeiro = pts[0];
    const mov = anima([[0, tf(primeiro)], ...pts.map((p) => [p[0], tf(p)]), [ciclo, tf(pts.at(-1))]]);
    const morre = e.morte ?? FIM;
    const vida = anima([[0, "opacity:0"], [e.entra, "opacity:0"], [e.entra + 0.01, "opacity:1"], [morre, "opacity:1"], [morre + 0.01, "opacity:0"], [ciclo, "opacity:0"]]);
    const sp = sprites[e.tipo];
    let corpo = sp.normal;
    if (sp.ferido) {
      if (e.ferido != null) {
        const antes = anima([[0, "opacity:1"], [e.ferido, "opacity:1"], [e.ferido + 0.01, "opacity:0"], [ciclo - 0.01, "opacity:0"], [ciclo, "opacity:1"]]);
        const depois = anima([[0, "opacity:0"], [e.ferido, "opacity:0"], [e.ferido + 0.01, "opacity:1"], [ciclo - 0.01, "opacity:1"], [ciclo, "opacity:0"]]);
        const pisca = anima([[0, "opacity:0"], [e.ferido, "opacity:0"], [e.ferido + 0.01, "opacity:1"], [e.ferido + 0.18, "opacity:0"], [ciclo, "opacity:0"]]);
        corpo = `<g class="${antes}">${sp.normal}</g><g class="${depois}" style="opacity:0">${sp.ferido}</g>` +
          `<g class="${pisca}" style="opacity:0"><rect x="-2" y="-2" width="${sp.w + 4}" height="${sp.h + 4}" rx="6" fill="#fff" opacity=".55"/></g>`;
      }
    }
    camadas.inimigos.push(
      `<g class="${mov}"><g class="${vida}" style="opacity:0"><g transform="translate(${r1(-sp.w / 2)} ${r1(-sp.h / 2)})">${corpo}</g></g></g>`,
    );
  }

  // blocos: cada abate solta o bloco do dia, que pula, cai até a casa certa e acende ao pousar
  css.push(`.bloco{transform-box:fill-box;transform-origin:center}`);
  const marcos = []; // [tempo, pontos, commits]
  let pontos = 0, commits = 0;
  const mortos = sim.inimigos.filter((e) => e.morte != null).sort((a, b) => a.morte - b.morte);
  for (const e of mortos) {
    const d = e.dia;
    const x = celX(d.c), y = celY(d.l);
    const [mx, my] = e.ondeMorreu;
    const dx0 = mx - CELULA / 2 - x, dy0 = my - CELULA / 2 - y;
    const t0 = e.morte;
    const paradas = [[0, `opacity:0;transform:translate(${r1(dx0)}px,${r1(dy0)}px) scale(.4)`], [t0, `opacity:0;transform:translate(${r1(dx0)}px,${r1(dy0)}px) scale(.4)`]];
    for (let k = 0; k <= 8; k++) {
      const s = k / 8;
      // arco: sobe um pouco e cai acelerando até a casa
      const px = dx0 * (1 - s);
      const py = dy0 * (1 - s * s) - 16 * Math.sin(Math.PI * s) * (1 - s * 0.4);
      paradas.push([t0 + 0.02 + s * DUR_QUEDA, `opacity:1;transform:translate(${r1(px)}px,${r1(py)}px) scale(${r1(0.6 + 0.4 * s)})`]);
    }
    const pousa = t0 + 0.02 + DUR_QUEDA;
    paradas.push([FIM, "opacity:1;transform:translate(0px,0px) scale(1)"], [FIM + 0.3, "opacity:0;transform:translate(0px,0px) scale(1)"], [ciclo, "opacity:0;transform:translate(0px,0px) scale(1)"]);
    const queda = anima(paradas);
    const brilho = anima([[0, "opacity:0"], [pousa, "opacity:0"], [pousa + 0.01, "opacity:1"], [pousa + 0.35, "opacity:0"], [ciclo, "opacity:0"]]);
    camadas.blocos.push(
      `<rect class="bloco ${queda}" x="${x}" y="${y}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.niveis[d.nivel]}"><title>${d.date}: ${d.count}</title></rect>`,
      `<rect class="${brilho}" style="opacity:0" x="${x - 1.5}" y="${y - 1.5}" width="${CELULA + 3}" height="${CELULA + 3}" rx="3" fill="none" stroke="${T.pouso}" stroke-width="1.4"/>`,
    );
    pontos += TIPOS[e.tipo].pontos * (e.mergulhando ? 2 : 1);
    commits += d.count;
    marcos.push([t0, pontos, null], [pousa, null, commits]);
  }

  // tiros das naves e clarão na boca
  for (const tiro of sim.tiros) {
    const fim = tiro.fim ?? FIM;
    const dist = r1(Math.max(0, tiro.y0 - tiro.y));
    const cls = anima([
      [0, "opacity:0;transform:translateY(0px)"],
      [tiro.t0, "opacity:0;transform:translateY(0px)"],
      [tiro.t0 + 0.005, "opacity:1;transform:translateY(0px)"],
      [fim, `opacity:1;transform:translateY(-${dist}px)`],
      [fim + 0.005, `opacity:0;transform:translateY(-${dist}px)`],
      [ciclo, "opacity:0;transform:translateY(0px)"],
    ]);
    const cor = tiro.nave === 0 ? "#a5f3fc" : "#fde68a";
    camadas.tiros.push(
      `<g transform="translate(${r1(tiro.x)} ${r1(tiro.y0)})"><g class="${cls}" style="opacity:0" filter="url(#brilho)">` +
        `<rect x="-1" y="-9" width="2" height="9" rx="1" fill="${cor}"/><rect x="-.5" y="-8" width="1" height="4" fill="#fff"/></g></g>`,
    );
  }
  for (const ti of sim.tirosInimigos) {
    const t1 = ti.t + (ALTURA + 10 - ti.y) / VEL_TIRO_INIMIGO;
    const dist = r1(ALTURA + 10 - ti.y);
    const cls = anima([
      [0, "opacity:0;transform:translateY(0px)"],
      [ti.t, "opacity:0;transform:translateY(0px)"],
      [ti.t + 0.005, "opacity:1;transform:translateY(0px)"],
      [t1, `opacity:1;transform:translateY(${dist}px)`],
      [t1 + 0.005, `opacity:0;transform:translateY(${dist}px)`],
      [ciclo, "opacity:0;transform:translateY(0px)"],
    ]);
    camadas.tirosInimigos.push(
      `<g transform="translate(${r1(ti.x)} ${r1(ti.y)})"><g class="${cls}" style="opacity:0"><rect x="-1.2" y="0" width="2.4" height="6" rx="1.2" fill="${VERMELHO}"/><rect x="-.5" y="3" width="1" height="2" fill="#ffd0d6"/></g></g>`,
    );
  }

  // explosões
  const rndX = aleatorio(4242);
  const explodir = (x, y, t, grande, cores) => {
    const escala = grande ? 2.7 : 2.1, dur = grande ? 0.65 : 0.48;
    const cls = anima([[0, "opacity:0;transform:scale(.2)"], [t, "opacity:0;transform:scale(.2)"], [t + 0.01, "opacity:1;transform:scale(.35)"], [t + dur, `opacity:0;transform:scale(${escala})`], [ciclo, "opacity:0;transform:scale(.2)"]]);
    const n = grande ? 14 : 10;
    const parts = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rndX() * 0.6;
      const raio = 5 + rndX() * 5;
      const tam = 2 + Math.round(rndX() * 2);
      parts.push(`<rect x="${r1(Math.cos(ang) * raio - tam / 2)}" y="${r1(Math.sin(ang) * raio - tam / 2)}" width="${tam}" height="${tam}" fill="${cores[i % cores.length]}"/>`);
    }
    parts.push(`<circle r="3.6" fill="${EXPLOSAO[1]}" opacity=".9"/><circle r="2" fill="#fff"/>`);
    camadas.explosoes.push(`<g transform="translate(${r1(x)} ${r1(y)})"><g class="${cls}" style="opacity:0">${parts.join("")}</g></g>`);
  };
  for (const e of mortos) {
    const tipo = TIPOS[e.tipo];
    explodir(e.ondeMorreu[0], e.ondeMorreu[1], e.morte, e.tipo === "comandante", [...EXPLOSAO, tipo.cores[Object.keys(tipo.cores)[1]]]);
  }
  for (const tiro of sim.tiros) {
    if (tiro.acerto && tiro.acerto.ferido === tiro.fim) {
      const cls = anima([[0, "opacity:0"], [tiro.fim, "opacity:0"], [tiro.fim + 0.01, "opacity:1"], [tiro.fim + 0.2, "opacity:0"], [ciclo, "opacity:0"]]);
      camadas.explosoes.push(`<g class="${cls}" style="opacity:0"><circle cx="${r1(tiro.x)}" cy="${r1(tiro.y)}" r="4" fill="#fde68a" filter="url(#brilho)"/></g>`);
    }
  }

  // naves
  css.push(
    `@keyframes chama{from{opacity:1;transform:scaleY(1)}to{opacity:.55;transform:scaleY(.6)}}.chama{animation:chama .09s steps(2) infinite alternate;transform-box:fill-box;transform-origin:50% 0%}`,
    `@keyframes halo{from{opacity:.5}to{opacity:.9}}.halo{animation:halo 1.3s ease-in-out infinite alternate}`,
  );
  const wN = NAVE[0].length * PX_NAVE, hN = NAVE.length * PX_NAVE;
  sim.frota.forEach((nave, ni) => {
    const serie = simplificar(nave.rastro.map(([tt, x]) => [tt, x]), 0.4);
    const x0 = serie[0][1];
    const voo = anima([[0, `transform:translateX(${r1(x0)}px)`], ...serie.map(([tt, x]) => [tt, `transform:translateX(${r1(x)}px)`]), [FIM, `transform:translateX(${r1(serie.at(-1)[1])}px)`], [ciclo, `transform:translateX(${r1(x0)}px)`]]);
    // recuo e clarão a cada tiro
    const tirosDela = sim.tiros.filter((tt) => tt.nave === ni);
    const recuo = anima([[0, "transform:translateY(0px)"], ...tirosDela.flatMap((tt) => [[tt.t0, "transform:translateY(0px)"], [tt.t0 + 0.02, "transform:translateY(1.5px)"], [tt.t0 + 0.1, "transform:translateY(0px)"]]), [ciclo, "transform:translateY(0px)"]]);
    const clarao = anima([[0, "opacity:0"], ...tirosDela.flatMap((tt) => [[tt.t0, "opacity:0"], [tt.t0 + 0.005, "opacity:1"], [tt.t0 + 0.07, "opacity:0"]]), [ciclo, "opacity:0"]]);
    const cores = COR_NAVE[ni % COR_NAVE.length];
    const fogo = [6, 8].map((x) => `<rect class="chama" x="${r1(x * PX_NAVE)}" y="${r1(16 * PX_NAVE)}" width="${PX_NAVE}" height="${PX_NAVE * 2.5}" fill="#ffd166"/><rect class="chama" style="animation-delay:-.04s" x="${r1(x * PX_NAVE)}" y="${r1(16 * PX_NAVE)}" width="${PX_NAVE}" height="${PX_NAVE * 1.2}" fill="#fff7d6"/>`).join("");
    camadas.naves.push(
      `<g class="${voo}" style="transform:translateX(${r1(x0)}px)"><g transform="translate(0 ${NAVE_Y})">` +
        `<ellipse class="halo" cx="0" cy="2" rx="${r1(wN * 0.9)}" ry="${r1(hN * 0.75)}" fill="url(#halo${ni})"/>` +
        `<g class="${recuo}"><g transform="translate(${r1(-wN / 2)} ${r1(-hN / 2)})" shape-rendering="crispEdges">${fogo}${pixels(NAVE, cores, PX_NAVE)}</g>` +
        `<g class="${clarao}" style="opacity:0" filter="url(#brilho)"><circle cx="0" cy="${r1(-hN / 2 - 1)}" r="3.4" fill="${ni ? "#fde68a" : "#a5f3fc"}"/><circle cx="0" cy="${r1(-hN / 2 - 1)}" r="1.6" fill="#fff"/></g></g>` +
        `</g></g>`,
    );
  });

  // HUD: placar e commits que já caíram no gráfico
  const fonte = `font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-weight="700"`;
  const contador = (campo, x, ancora, cor, largo) => {
    const valores = [[0, 0]];
    for (const m of marcos) if (m[campo] != null) valores.push([m[0], m[campo]]);
    return valores.map(([t0, v], i) => {
      const t1 = valores[i + 1]?.[0] ?? FIM;
      const ultimo = i === valores.length - 1;
      const paradas =
        i === 0
          ? [[0, "opacity:1"], [t1, "opacity:1"], [t1 + 0.005, "opacity:0"], [FIM, "opacity:0"], [FIM + 0.005, "opacity:1"], [ciclo, "opacity:1"]]
          : [[0, "opacity:0"], [t0, "opacity:0"], [t0 + 0.005, "opacity:1"], [ultimo ? FIM : t1, "opacity:1"], [(ultimo ? FIM : t1) + 0.005, "opacity:0"], [ciclo, "opacity:0"]];
      return `<text class="${anima(paradas)}" style="opacity:${i === 0 ? 1 : 0}" x="${x}" y="18" text-anchor="${ancora}" fill="${cor}">${String(v).padStart(largo, "0")}</text>`;
    });
  };
  const total = dias.reduce((s, d) => s + d.count, 0);
  camadas.hud.push(
    `<g ${fonte} font-size="12" letter-spacing="1">`,
    `<text x="${MARGEM}" y="18" fill="${T.hudFraco}">SCORE</text>`,
    ...contador(1, MARGEM + 52, "start", T.hud, 6),
    `<text x="${W / 2}" y="18" text-anchor="middle" fill="${T.hudFraco}">ÚLTIMOS 12 MESES</text>`,
    `<text x="${W - MARGEM - 30}" y="18" text-anchor="end" fill="${T.hudFraco}">COMMITS</text>`,
    ...contador(2, W - MARGEM, "end", T.niveis[4], 3),
    `</g>`,
  );

  // mensagens
  const meioY = TOPO_GRADE - 22;
  css.push(`@keyframes piscaTexto{0%,60%{fill-opacity:1}61%,100%{fill-opacity:.2}}.piscaTexto{animation:piscaTexto .7s infinite}`);
  const msgs = [];
  const pronto = anima([[0, "opacity:1"], [INICIO, "opacity:1"], [INICIO + 0.05, "opacity:0"], [ciclo, "opacity:0"]]);
  msgs.push(`<g class="${pronto}"><text class="piscaTexto" x="${W / 2}" y="${meioY}" font-size="15" letter-spacing="3" fill="${T.hud}">READY?</text></g>`);
  for (const m of sim.marcas.slice(1)) {
    const cls = anima([[0, "opacity:0"], [m.t - PAUSA_ONDA + 0.3, "opacity:0"], [m.t - PAUSA_ONDA + 0.31, "opacity:1"], [m.t + 0.5, "opacity:1"], [m.t + 0.51, "opacity:0"], [ciclo, "opacity:0"]]);
    msgs.push(`<g class="${cls}" style="opacity:0"><text x="${W / 2}" y="${meioY}" font-size="14" letter-spacing="3" fill="${T.aviso}">WAVE ${m.onda + 1}</text></g>`);
  }
  const vitoria = anima([[0, "opacity:0"], [fimJogo + 0.2, "opacity:0"], [fimJogo + 0.21, "opacity:1"], [fimVitoria, "opacity:1"], [fimVitoria + 0.01, "opacity:0"], [ciclo, "opacity:0"]]);
  const totalTxt = calendario.totalContributions.toLocaleString("pt-BR");
  msgs.push(
    `<g class="${vitoria}" style="opacity:0"><text class="piscaTexto" x="${W / 2}" y="${meioY - 30}" font-size="16" letter-spacing="3" fill="${T.vitoria}">STAGE CLEAR</text>` +
      `<text x="${W / 2}" y="${meioY - 13}" font-size="11" letter-spacing="1" fill="${T.hudFraco}">+${totalTxt} contribuições</text></g>`,
  );

  css.push(`@media (prefers-reduced-motion:reduce){*{animation:none!important}.bloco{opacity:1!important}}`);

  const data = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${ALTURA}" viewBox="0 0 ${W} ${ALTURA}" role="img" aria-label="Frota alienígena atacando a nave de ${usuario ?? "GitHub"}: cada inimigo abatido vira um dia do gráfico de contribuições, ${totalTxt} contribuições no último ano">
<defs>
<radialGradient id="halo0"><stop offset="0" stop-color="#8b5cf6" stop-opacity="${tema === "dark" ? 0.35 : 0.2}"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></radialGradient>
<radialGradient id="halo1"><stop offset="0" stop-color="#22d3ee" stop-opacity="${tema === "dark" ? 0.32 : 0.2}"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
<filter id="brilho" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<clipPath id="tela"><rect width="${W}" height="${ALTURA}"/></clipPath>
${defs.join("")}
</defs>
<style>${css.join("")}</style>
<g clip-path="url(#tela)">
<g shape-rendering="crispEdges">${camadas.estrelas.join("")}</g>
<g>${camadas.chao.join("")}</g>
<g>${camadas.blocos.join("")}</g>
<g>${camadas.tirosInimigos.join("")}</g>
<g class="${clsBalanco}"><g shape-rendering="crispEdges">${camadas.inimigos.join("")}</g></g>
<g>${camadas.tiros.join("")}</g>
${camadas.naves.join("")}
<g>${camadas.explosoes.join("")}</g>
</g>
${camadas.hud.join("")}
<g ${fonte} text-anchor="middle">${msgs.join("")}</g>
<g font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="11" fill="${T.hudFraco}">
<text x="${MARGEM}" y="${ALTURA - 8}">${totalTxt} contribuições no último ano</text>
<text x="${W - MARGEM}" y="${ALTURA - 8}" text-anchor="end">atualizado em ${data}</text>
</g>
</svg>
`;
  return { svg, sim, dias };
}

const calendario = await carregarCalendario();
largura = MARGEM * 2 + calendario.weeks.length * PASSO - (PASSO - CELULA);
await mkdir(saida, { recursive: true });
const hoje = new Date();

// uma nave, se der conta a tempo; senão, duas
let naves = args.naves ? Number(args.naves) : 1;
const resumo = [];
if (!args.naves) {
  const teste = gerarSvg(calendario, "dark", hoje, 1);
  resumo.push(`1 nave: fim=${teste.sim.fim.toFixed(1)}s ciclo=${ciclo}s timeout=${teste.sim.timeout}`);
  if (teste.sim.fim > LIMITE_UMA_NAVE || teste.sim.timeout) naves = 2;
}
for (const tema of Object.keys(TEMAS)) {
  const { svg, sim, dias } = gerarSvg(calendario, tema, hoje, naves);
  const arquivo = join(saida, `frota-${tema}.svg`);
  await writeFile(arquivo, svg);
  const mortos = sim.inimigos.filter((e) => e.morte != null).length;
  const porFase = {};
  for (const e of sim.inimigos) porFase[e.faseMorte] = (porFase[e.faseMorte] ?? 0) + 1;
  const mergulhos = sim.inimigos.reduce((n, e) => n + e.fases.filter((f) => f.mergulho).length, 0);
  resumo.push(`${tema}: mortes por fase=${JSON.stringify(porFase)} mergulhos=${mergulhos}`);
  resumo.push(`${tema}: naves=${naves} inimigos=${sim.inimigos.length} abatidos=${mortos}/${dias.length} tiros=${sim.tiros.length} acertos=${sim.tiros.filter((t) => t.acerto).length} tiros_inimigos=${sim.tirosInimigos.length} fim=${sim.fim.toFixed(1)}s ciclo=${ciclo}s tamanho=${(svg.length / 1024).toFixed(0)}KB timeout=${sim.timeout}`);
  console.log(`gerado ${arquivo}`);
}
if (args.debug) writeFileSync(args.debug, resumo.join("\n") + "\n");
