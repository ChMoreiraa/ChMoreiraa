// Gera a placa do portfólio do topo do README: o robô pixel segura uma placa com a marca </CHM>_
// do site e "Meu portfólio →". Arquivos estáticos (não dependem de dados), então ficam no próprio repo.
//
// Uso: node scripts/placa.mjs   →   assets/placa-dark.svg e assets/placa-light.svg

import { mkdir, writeFile } from "node:fs/promises";

const URL_TEXTO = "chmoreira.netlify.app";

// mesmo robô da animação antiga, com o visor ciano; a mão direita (linha 22) segura o cabo da placa
const ROBO = [
  "..........KK..........",
  "..........KA..........",
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
  "..KHK.KDDDDDDDDK.KHK..",
  "...K..KKKKKKKKKK..K...",
  ".......KMMK.KMMK......",
  ".......KDMK.KDMK......",
  ".......KPPK.KPPK......",
  ".......KMMK.KMMK......",
  "......KBBBK.KBBBK.....",
  "......KKKKK.KKKKK.....",
];
const COR = {
  K: "#0f0d16", W: "#f6f8fc", L: "#d3d8e2", M: "#9aa2b3", D: "#5d6577", B: "#3b4150", H: "#c9ced8",
  V: "#1b2a4a", v: "#7dd3fc", E: "#67e8f9", A: "#38bdf8", a: "#bae6fd", P: "#8b5cf6", p: "#c4b5fd",
};
const PX = 3;

const TEMAS = {
  dark: { fundo: "#15131C", borda: "#A78BFA", texto: "#EDEDF0", fraco: "#8f8aa8", cabo: "#5d6577", brilho: 0.45 },
  light: { fundo: "#F7F5FF", borda: "#7C3AED", texto: "#1E1530", fraco: "#6b6880", cabo: "#9aa2b3", brilho: 0.25 },
};

/** Pixels por grupo de animação (olhos, núcleo, antena), juntando vizinhos da mesma cor. */
function pixels(desenho, grupos) {
  const saida = { base: [] };
  desenho.forEach((linha, y) => {
    if (linha.length !== desenho[0].length) throw new Error(`linha com largura errada: ${linha}`);
    for (let x = 0; x < linha.length; ) {
      const ch = linha[x];
      if (ch === ".") { x++; continue; }
      let n = 1;
      while (linha[x + n] === ch) n++;
      const g = grupos[ch] ?? "base";
      (saida[g] ??= []).push(`<rect x="${x * PX}" y="${y * PX}" width="${n * PX}" height="${PX}" fill="${COR[ch]}"/>`);
      x += n;
    }
  });
  for (const k of Object.keys(saida)) saida[k] = saida[k].join("");
  return saida;
}

function gerar(tema) {
  const T = TEMAS[tema];
  const W = 440, H = 184;
  const placa = { x: 40, y: 8, w: 360, h: 74 };
  // robô embaixo da placa, com a mão no meio dela: segura o cabo para cima
  const rx = placa.x + placa.w / 2 - 18.5 * PX, ry = H - ROBO.length * PX - 4;
  const mao = [rx + 18.5 * PX, ry + 22.5 * PX]; // onde a mão segura o cabo
  const robo = pixels(ROBO, { E: "olhos", A: "nucleo", a: "nucleo", v: "reflexo" });
  const mono = `font-family="ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace"`;
  const cx = placa.x + placa.w / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Robô segurando uma placa: meu portfólio, ${URL_TEXTO}">
<defs>
<filter id="brilho" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="aura" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
<linearGradient id="reluz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${tema === "dark" ? 0.16 : 0.5}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="dentro"><rect x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12"/></clipPath>
</defs>
<style>
@keyframes balanca{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}
.balanca{animation:balanca 3.4s ease-in-out infinite;transform-box:view-box;transform-origin:${mao[0]}px ${mao[1]}px}
@keyframes respira{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
.respira{animation:respira 1.7s ease-in-out infinite}
@keyframes olhos{0%,90%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
.olhos{animation:olhos 3.6s infinite;transform-box:fill-box;transform-origin:center}
@keyframes pulsa{from{opacity:.5}to{opacity:1}}
.nucleo{animation:pulsa .7s ease-in-out infinite alternate}
@keyframes reflexo{0%,70%{opacity:.5}85%{opacity:1}100%{opacity:.5}}
.reflexo{animation:reflexo 2.6s infinite}
@keyframes aura{from{opacity:${T.brilho * 0.6}}to{opacity:${T.brilho}}}
.aura{animation:aura 1.6s ease-in-out infinite alternate}
@keyframes cursor{0%,49%{opacity:1}50%,100%{opacity:0}}
.cursor{animation:cursor 1s steps(1) infinite}
@keyframes seta{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
.seta{animation:seta 1.1s ease-in-out infinite}
@keyframes reluz{0%,55%{transform:translateX(-140px)}100%{transform:translateX(${placa.w + 140}px)}}
.reluz{animation:reluz 4.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>
<g class="balanca">
<rect x="${mao[0] - 2}" y="${placa.y + placa.h - 4}" width="4" height="${mao[1] - placa.y - placa.h + 6}" rx="1" fill="${T.cabo}"/>
<rect class="aura" x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12" fill="${T.borda}" filter="url(#aura)"/>
<rect x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12" fill="${T.fundo}" stroke="${T.borda}" stroke-width="2"/>
<g clip-path="url(#dentro)"><rect class="reluz" x="${placa.x}" y="${placa.y}" width="110" height="${placa.h}" fill="url(#reluz)"/></g>
<text x="${cx}" y="${placa.y + 35}" text-anchor="middle" ${mono} font-size="24" font-weight="700" fill="${T.texto}"><tspan fill="${T.borda}">&lt;/</tspan>CHM<tspan fill="${T.borda}">&gt;</tspan><tspan class="cursor" fill="${T.borda}">_</tspan></text>
<text x="${cx - 8}" y="${placa.y + 60}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="15" font-weight="600" fill="${T.texto}">Meu portfólio</text>
<g class="seta"><text x="${cx + 46}" y="${placa.y + 60}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="15" font-weight="700" fill="${T.borda}">→</text></g>
</g>
<g transform="translate(${rx} ${ry})" shape-rendering="crispEdges"><g class="respira">
${robo.base}<g class="reflexo">${robo.reflexo}</g><g class="nucleo" filter="url(#brilho)">${robo.nucleo}</g><g class="olhos" filter="url(#brilho)">${robo.olhos}</g>
</g></g>
</svg>
`;
}

await mkdir("assets", { recursive: true });
for (const tema of Object.keys(TEMAS)) {
  await writeFile(`assets/placa-${tema}.svg`, gerar(tema));
  console.log(`gerado assets/placa-${tema}.svg`);
}
