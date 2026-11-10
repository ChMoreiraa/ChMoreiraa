// Gera o SVG animado do perfil: um robô em pixel voa sobre o gráfico de contribuições
// e dispara um raio em cada coluna com commit, "carregando" os dias daquela semana.
//
// Uso:
//   GITHUB_TOKEN=... node scripts/robo.mjs --usuario ChMoreiraa --saida dist
//   node scripts/robo.mjs --entrada contrib.json --saida dist   (sem rede, para testar)
//
// Saída: robo-dark.svg e robo-light.svg na pasta --saida.

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
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "perfil-robo" },
    body: JSON.stringify({ query: QUERY, variables: { login: usuario } }),
  });
  const json = await resp.json();
  if (!resp.ok || json.errors) throw new Error(`GraphQL falhou: ${resp.status} ${JSON.stringify(json.errors ?? json)}`);
  return json.data.user.contributionsCollection.contributionCalendar;
}

// ---------- desenho ----------

const NIVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

const TEMAS = {
  dark: {
    vazio: "#1f1b2e",
    niveis: ["#1f1b2e", "#3b2667", "#5b37a8", "#8b5cf6", "#c4b5fd"],
    raio: "#f5f3ff",
    halo: "#a78bfa",
    texto: "#9d98b5",
  },
  light: {
    vazio: "#ece8f5",
    niveis: ["#ece8f5", "#d6c8fb", "#b197fc", "#8b5cf6", "#5b21b6"],
    raio: "#ffffff",
    halo: "#7c3aed",
    texto: "#6b6880",
  },
};

// Robô original, em pixel (14 x 19). Cada letra é uma cor; "." é vazio.
const ROBO = [
  "....KKKKKK....",
  "..KKSHHSSSKK..",
  ".KSHHSSSSSSsK.",
  ".KSHSSSSSSSsK.",
  "KSSKKKSSKKKSsK",
  "KSKEEeKKeEEKsK",
  "KSSKEKSSKEKSsK",
  ".KSSSSSSSSSsK.",
  ".KsSKKKKKKSsK.",
  "..KsSKSKSKsK..",
  "...KssssssK...",
  "....KKKKKK....",
  "......KK......",
  "..KKKKKKKKKK..",
  ".KSSSSKKSSSSK.",
  ".KSsSKPPKSsSK.",
  "..KKsKPPKsKK..",
  "....KKKKKK....",
  ".....FFFF.....",
];
const COR_ROBO = {
  K: "#17131f", S: "#c9c6d6", H: "#f4f2fa", s: "#8d89a3",
  E: "#ff2e4d", e: "#ff9aa8", P: "#c4b5fd", F: "#fbbf24",
};

const CELULA = 10;
const PASSO = 13; // célula + espaço
const PX = 3; // tamanho do pixel do robô
const MARGEM = 16;
const TOPO_GRADE = 78;

// linha do tempo, em segundos
const ENTRADA = 1.2;
const POR_COLUNA = 0.25;
const SAIDA = 1.2;
const SEGURA_ATE = 18.5;
const APAGA_ATE = 19.5;
const CICLO = 20;

const pct = (t) => ((t / CICLO) * 100).toFixed(3) + "%";

function desenharRobo() {
  const largura = ROBO[0].length;
  for (const linha of ROBO) if (linha.length !== largura) throw new Error(`linha do robô com largura errada: ${linha}`);
  const partes = { corpo: [], olhos: [], chama: [] };
  ROBO.forEach((linha, y) =>
    [...linha].forEach((c, x) => {
      if (c === ".") return;
      const r = `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${COR_ROBO[c]}"/>`;
      (c === "E" || c === "e" ? partes.olhos : c === "F" ? partes.chama : partes.corpo).push(r);
    }),
  );
  return { ...partes, largura: largura * PX, altura: ROBO.length * PX };
}

function gerarSvg(calendario, tema, hoje) {
  const T = TEMAS[tema];
  const semanas = calendario.weeks;
  const largura = MARGEM * 2 + semanas.length * PASSO - (PASSO - CELULA);
  const baseGrade = TOPO_GRADE + 7 * PASSO - (PASSO - CELULA);
  const altura = baseGrade + 30;
  const centro = (c) => MARGEM + c * PASSO + CELULA / 2;
  const tempoColuna = (c) => ENTRADA + c * POR_COLUNA;
  const fimVarredura = tempoColuna(semanas.length - 1);

  const robo = desenharRobo();
  const roboY = 4;
  const bocaRaio = roboY + robo.altura - 2 * PX; // sai do núcleo do peito

  const css = [];
  const celulas = [];
  const raios = [];

  semanas.forEach((semana, c) => {
    const ativa = semana.contributionDays.some((d) => d.contributionCount > 0);
    const p = (tempoColuna(c) / CICLO) * 100;
    if (ativa) {
      const f = (n) => Math.min(n, 99.9).toFixed(3) + "%";
      css.push(
        `@keyframes c${c}{0%,${f(p)}{opacity:.18;transform:scale(.55)}${f(p + 1.2)}{opacity:1;transform:scale(1.35)}` +
          `${f(p + 3)},${pct(SEGURA_ATE)}{opacity:1;transform:scale(1)}${pct(APAGA_ATE)},100%{opacity:.18;transform:scale(.55)}}`,
        `@keyframes r${c}{0%,${f(Math.max(p - 0.4, 0))}{opacity:0}${f(p)}{opacity:1}${f(p + 0.9)}{opacity:1}${f(p + 3)},100%{opacity:0}}`,
        `.c${c}{animation:c${c} ${CICLO}s linear infinite}.r${c}{animation:r${c} ${CICLO}s linear infinite}`,
      );
      const x = centro(c);
      raios.push(
        `<g class="r${c}"><rect x="${x - 4}" y="${bocaRaio}" width="8" height="${baseGrade - bocaRaio}" rx="4" fill="${T.halo}" opacity=".5"/>` +
          `<rect x="${x - 1.5}" y="${bocaRaio}" width="3" height="${baseGrade - bocaRaio}" rx="1.5" fill="${T.raio}"/></g>`,
      );
    }
    for (const d of semana.contributionDays) {
      const nivel = NIVEL[d.contributionLevel] ?? 0;
      const x = MARGEM + c * PASSO;
      const y = TOPO_GRADE + d.weekday * PASSO;
      const titulo = `<title>${d.date}: ${d.contributionCount}</title>`;
      if (nivel === 0) {
        celulas.push(`<rect x="${x}" y="${y}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.vazio}">${titulo}</rect>`);
      } else {
        celulas.push(
          `<rect class="cel c${c}" x="${x}" y="${y}" width="${CELULA}" height="${CELULA}" rx="2" fill="${T.niveis[nivel]}">${titulo}</rect>`,
        );
      }
    }
  });

  const xIni = -robo.largura - 10;
  const xFim = largura + 10;
  const xCol = (c) => centro(c) - robo.largura / 2;
  css.push(
    `@keyframes voo{0%{transform:translateX(${xIni}px)}${pct(ENTRADA)}{transform:translateX(${xCol(0)}px)}` +
      `${pct(fimVarredura)}{transform:translateX(${xCol(semanas.length - 1)}px)}` +
      `${pct(fimVarredura + SAIDA)},100%{transform:translateX(${xFim}px)}}`,
    `.voo{animation:voo ${CICLO}s linear infinite}`,
    `@keyframes flutua{from{transform:translateY(0)}to{transform:translateY(-3px)}}`,
    `.flutua{animation:flutua .9s ease-in-out infinite alternate}`,
    `@keyframes pisca{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}`,
    `.olhos{animation:pisca 3.7s infinite;transform-box:fill-box;transform-origin:center}`,
    `@keyframes brilho{from{opacity:.55}to{opacity:1}}`,
    `.brilho{animation:brilho .6s ease-in-out infinite alternate}`,
    `@keyframes chama{from{transform:scaleY(1);opacity:1}to{transform:scaleY(.4);opacity:.6}}`,
    `.chama{animation:chama .12s steps(2) infinite alternate;transform-box:fill-box;transform-origin:top}`,
    `.cel{transform-box:fill-box;transform-origin:center}`,
    `@media (prefers-reduced-motion:reduce){*{animation:none!important}.voo{transform:translateX(${xCol(0)}px)}}`,
  );

  const total = calendario.totalContributions.toLocaleString("pt-BR");
  const data = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Robô carregando o gráfico de contribuições de ${usuario ?? "GitHub"}: ${total} contribuições no último ano">
<style>${css.join("")}</style>
<g shape-rendering="crispEdges">${celulas.join("")}</g>
<g>${raios.join("")}</g>
<g class="voo"><g transform="translate(0 ${roboY})"><g class="flutua" shape-rendering="crispEdges">
<g>${robo.corpo.join("")}</g>
<g class="olhos"><g class="brilho">${robo.olhos.join("")}</g></g>
<g class="chama">${robo.chama.join("")}</g>
</g></g></g>
<g font-family="ui-monospace,SFMono-Regular,Consolas,monospace" font-size="11" fill="${T.texto}">
<text x="${MARGEM}" y="${altura - 8}">${total} contribuições no último ano</text>
<text x="${largura - MARGEM}" y="${altura - 8}" text-anchor="end">atualizado em ${data}</text>
</g>
</svg>
`;
}

const calendario = await carregarCalendario();
await mkdir(saida, { recursive: true });
const hoje = new Date();
for (const tema of Object.keys(TEMAS)) {
  const arquivo = join(saida, `robo-${tema}.svg`);
  await writeFile(arquivo, gerarSvg(calendario, tema, hoje));
  console.log(`gerado ${arquivo}`);
}
