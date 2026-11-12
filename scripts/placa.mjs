// Gera a placa do portfólio do topo do README: o robô do portfólio (o mascote do site, em pixel)
// segura uma placa com a marca </CHM>_ e "Meu portfólio →". De tempos em tempos ele pisca, olha
// para a placa, sorri e acena com a mão livre. Arquivos estáticos (não dependem de dados).
//
// Uso: node scripts/placa.mjs   →   assets/placa-dark.svg e assets/placa-light.svg

import { mkdir, writeFile } from "node:fs/promises";

// Mascote do site: cabeça branca arredondada, visor preto, orelhas com anel de luz lilás, antena
// com bolinha, corpo de ovo com anel no peito. Os olhos e os braços são desenhados à parte.
const CORPO = [
  "...........ll...........",
  "..........lLLl..........",
  "...........DD...........",
  "......KKKKKKKKKKKK......",
  "....KKWWCCCCCCCCCcKK....",
  "...KWWCCCCCCCCCCCCcsK...",
  "..KWCKKKKKKKKKKKKKKcsK..",
  "EEKCCKVvvVVVVVVVVVKcsKEE",
  "LEKCCKvVVVVVVVVVVVKcsKEL",
  "LEKCCKVVVVVVVVVVVVKcsKEL",
  "LEKCCKVVVVVVVVVVVVKcsKEL",
  "EEKCCKVVVVVVVVVVVVKcsKEE",
  "..KCCKKKKKKKKKKKKKKcsK..",
  "..KcCCCCCCCCCCCCCCCcsK..",
  "...KscccccccccccccsK....",
  "....KKKKKKKKKKKKKKKK....",
  "..........KDDK..........",
  ".......KKKKKKKKKK.......",
  ".....KKWCCCCCCCcsKK.....",
  "....KWCCCCCLLCCCCcsK....",
  "...KWCCCCCLggLCCCCcsK...",
  "...KWCCCCCLggLCCCCcsK...",
  "....KCCCCCCLLCCCCcsK....",
  "....KCCCCCCCCCCCCcsK....",
  "....KcCCCCCCCCCCCcsK....",
  ".....KccCCCCCCCccsK.....",
  "......KsccccccccsK......",
  ".......KKKKKKKKKK.......",
];
// braço que segura o cabo (lado direito); o cabo passa pelo meio da mão, na coluna 23
const BRACO_PLACA = {
  col: 19,
  lin: 11,
  desenho: [
    "...KKK.",
    "..KWCCK",
    "..KCCcK",
    "..KCccK",
    "...KKK.",
    "..KCcK.",
    "..KCcK.",
    ".KCcK..",
    "KDDK...",
  ],
};
// braço livre (lado esquerdo), parado para baixo; gira no ombro para acenar
const BRACO_ACENO = {
  col: 0,
  lin: 18,
  desenho: [
    "...KK",
    "..KDK",
    ".KCCK",
    ".KCcK",
    ".KCcK",
    "KCCCK",
    "KWCcK",
    "KCccK",
    ".KKK.",
  ],
};
// olhos no visor: normal (cápsula), olhando para a placa (um pixel acima) e feliz (^ ^)
const OLHOS = {
  normal: [[8, 8, "l"], [9, 8, "L"], [8, 9, "L"], [9, 9, "L"], [8, 10, "L"], [9, 10, "L"], [14, 8, "l"], [15, 8, "L"], [14, 9, "L"], [15, 9, "L"], [14, 10, "L"], [15, 10, "L"]],
  feliz: [[8, 8, "L"], [9, 8, "L"], [7, 9, "L"], [10, 9, "L"], [7, 10, "L"], [10, 10, "L"], [14, 8, "L"], [15, 8, "L"], [13, 9, "L"], [16, 9, "L"], [13, 10, "L"], [16, 10, "L"]],
};
OLHOS.cima = OLHOS.normal.map(([x, y, c]) => [x + 1, y - 1, c]);

const COR = {
  K: "#0d0b14", W: "#ffffff", C: "#ECE9F4", c: "#c9c4d8", s: "#9f98b5", V: "#07060C", v: "#2c2742",
  E: "#1B1926", D: "#2a2738", L: "#C9BBFF", l: "#F4F0FF", g: "#8f7ff0",
};
const PX = 3;

const TEMAS = {
  dark: { fundo: "#15131C", borda: "#A78BFA", texto: "#EDEDF0", cabo: "#5d6577", brilho: 0.45, anel: 0.55 },
  light: { fundo: "#F7F5FF", borda: "#7C3AED", texto: "#1E1530", cabo: "#9aa2b3", brilho: 0.25, anel: 0.4 },
};

/** Pixels de um desenho de letras, juntando vizinhos da mesma cor; `grupos` separa cores animadas. */
function pixels(desenho, col = 0, lin = 0, grupos = {}) {
  const saida = { base: [] };
  desenho.forEach((linha, y) => {
    if (linha.length !== desenho[0].length) throw new Error(`linha com largura errada: ${linha}`);
    for (let x = 0; x < linha.length; ) {
      const ch = linha[x];
      if (ch === ".") { x++; continue; }
      if (!COR[ch]) throw new Error(`cor sem definição: ${ch}`);
      let n = 1;
      while (linha[x + n] === ch) n++;
      const g = grupos[ch] ?? "base";
      (saida[g] ??= []).push(`<rect x="${(col + x) * PX}" y="${(lin + y) * PX}" width="${n * PX}" height="${PX}" fill="${COR[ch]}"/>`);
      x += n;
    }
  });
  for (const k of Object.keys(saida)) saida[k] = saida[k].join("");
  return saida;
}
const pontos = (lista) => lista.map(([x, y, c]) => `<rect x="${x * PX}" y="${y * PX}" width="${PX}" height="${PX}" fill="${COR[c]}"/>`).join("");

// roteiro de 8 s: pisca, olha para a placa, sorri e acena, pisca de novo
const CICLO = 8;
const pct = (t) => `${+((t / CICLO) * 100).toFixed(2)}%`;
const quadros = (paradas) => paradas.map(([t, r]) => `${pct(t)}{${r}}`).join("");

function gerar(tema) {
  const T = TEMAS[tema];
  const W = 440, H = 184;
  const placa = { x: 40, y: 8, w: 360, h: 74 };
  const cx = placa.x + placa.w / 2;
  // o cabo fica no meio da placa e passa pelo meio da mão direita (coluna 23 do desenho)
  const rx = cx - 23.5 * PX, ry = H - CORPO.length * PX - 10;
  const mao = [cx, ry + (BRACO_PLACA.lin + 1.5) * PX];
  const ombro = [(BRACO_ACENO.col + 3.5) * PX, (BRACO_ACENO.lin + 1.5) * PX];
  const corpo = pixels(CORPO, 0, 0, { L: "luz", l: "luz", g: "miolo", v: "reflexo" });
  const bracoPlaca = pixels(BRACO_PLACA.desenho, BRACO_PLACA.col, BRACO_PLACA.lin).base;
  const bracoAceno = pixels(BRACO_ACENO.desenho, BRACO_ACENO.col, BRACO_ACENO.lin).base;
  const mono = `font-family="ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace"`;
  const sans = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`;
  const centroOlhos = `${11.5 * PX}px ${9 * PX}px`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Robô do meu portfólio segurando uma placa: meu portfólio">
<defs>
<filter id="brilho" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.1" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="brilhoFino" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="aura" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="6"/></filter>
<radialGradient id="anel"><stop offset=".55" stop-color="#C9BBFF" stop-opacity="0"/><stop offset=".8" stop-color="#C9BBFF" stop-opacity="${T.anel}"/><stop offset="1" stop-color="#C9BBFF" stop-opacity="0"/></radialGradient>
<linearGradient id="reluz" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${tema === "dark" ? 0.16 : 0.5}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<clipPath id="dentro"><rect x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12"/></clipPath>
</defs>
<style>
@keyframes balanca{0%,100%{transform:rotate(-1.6deg)}50%{transform:rotate(1.6deg)}}
.balanca{animation:balanca 3.4s ease-in-out infinite;transform-box:view-box;transform-origin:${mao[0]}px ${mao[1]}px}
@keyframes respira{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
.respira{animation:respira 1.7s ease-in-out infinite}
@keyframes luz{from{opacity:.6}to{opacity:1}}
.luz{animation:luz .9s ease-in-out infinite alternate}
@keyframes miolo{from{opacity:.35}to{opacity:.9}}
.miolo{animation:miolo .9s ease-in-out infinite alternate}
@keyframes reflexo{0%,70%{opacity:.5}85%{opacity:1}100%{opacity:.5}}
.reflexo{animation:reflexo 2.6s infinite}
@keyframes anel{from{opacity:.55}to{opacity:1}}
.anel{animation:anel 1.3s ease-in-out infinite alternate}
@keyframes olhoNormal{${quadros([[0, "opacity:1;transform:scaleY(1)"], [1.7, "opacity:1;transform:scaleY(1)"], [1.8, "opacity:1;transform:scaleY(.15)"], [1.9, "opacity:1;transform:scaleY(1)"], [2.4, "opacity:1;transform:scaleY(1)"], [2.41, "opacity:0;transform:scaleY(1)"], [6, "opacity:0;transform:scaleY(1)"], [6.01, "opacity:1;transform:scaleY(1)"], [7.1, "opacity:1;transform:scaleY(1)"], [7.2, "opacity:1;transform:scaleY(.15)"], [7.3, "opacity:1;transform:scaleY(1)"], [8, "opacity:1;transform:scaleY(1)"]])}}
.olhoNormal{animation:olhoNormal ${CICLO}s infinite;transform-box:view-box;transform-origin:${centroOlhos}}
@keyframes cima{${quadros([[0, "opacity:0"], [2.4, "opacity:0"], [2.41, "opacity:1"], [3.8, "opacity:1"], [3.81, "opacity:0"], [8, "opacity:0"]])}}
.cima{animation:cima ${CICLO}s infinite}
@keyframes feliz{${quadros([[0, "opacity:0"], [3.8, "opacity:0"], [3.81, "opacity:1"], [6, "opacity:1"], [6.01, "opacity:0"], [8, "opacity:0"]])}}
.feliz{animation:feliz ${CICLO}s infinite}
@keyframes aceno{${quadros([[0, "transform:rotate(0deg)"], [3.8, "transform:rotate(0deg)"], [4.2, "transform:rotate(150deg)"], [4.5, "transform:rotate(122deg)"], [4.8, "transform:rotate(160deg)"], [5.1, "transform:rotate(122deg)"], [5.4, "transform:rotate(160deg)"], [5.65, "transform:rotate(145deg)"], [6.1, "transform:rotate(0deg)"], [8, "transform:rotate(0deg)"]])}}
.aceno{animation:aceno ${CICLO}s ease-in-out infinite;transform-box:view-box;transform-origin:${ombro[0]}px ${ombro[1]}px}
@keyframes aura{from{opacity:${T.brilho * 0.6}}to{opacity:${T.brilho}}}
.aura{animation:aura 1.6s ease-in-out infinite alternate}
@keyframes cursor{0%,49%{opacity:1}50%,100%{opacity:0}}
.cursor{animation:cursor 1s steps(1) infinite}
@keyframes seta{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
.seta{animation:seta 1.1s ease-in-out infinite}
@keyframes reluz{0%,55%{transform:translateX(-140px)}100%{transform:translateX(${placa.w + 140}px)}}
.reluz{animation:reluz 4.2s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.cima,.feliz{opacity:0}}
</style>
<g class="balanca">
<rect x="${mao[0] - 2}" y="${placa.y + placa.h - 4}" width="4" height="${mao[1] - placa.y - placa.h + 8}" rx="1" fill="${T.cabo}"/>
<rect class="aura" x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12" fill="${T.borda}" filter="url(#aura)"/>
<rect x="${placa.x}" y="${placa.y}" width="${placa.w}" height="${placa.h}" rx="12" fill="${T.fundo}" stroke="${T.borda}" stroke-width="2"/>
<g clip-path="url(#dentro)"><rect class="reluz" x="${placa.x}" y="${placa.y}" width="110" height="${placa.h}" fill="url(#reluz)"/></g>
<text x="${cx}" y="${placa.y + 35}" text-anchor="middle" ${mono} font-size="24" font-weight="700" fill="${T.texto}"><tspan fill="${T.borda}">&lt;/</tspan>CHM<tspan fill="${T.borda}">&gt;</tspan><tspan class="cursor" fill="${T.borda}">_</tspan></text>
<text x="${cx - 8}" y="${placa.y + 60}" text-anchor="middle" ${sans} font-size="15" font-weight="600" fill="${T.texto}">Meu portfólio</text>
<g class="seta"><text x="${cx + 46}" y="${placa.y + 60}" ${sans} font-size="15" font-weight="700" fill="${T.borda}">→</text></g>
</g>
<ellipse class="anel" cx="${rx + 11.5 * PX}" cy="${ry + CORPO.length * PX + 4}" rx="${10 * PX}" ry="${2.2 * PX}" fill="url(#anel)"/>
<g transform="translate(${rx} ${ry})" shape-rendering="crispEdges"><g class="respira">
<g class="aceno">${bracoAceno}</g>
${corpo.base}<g class="reflexo">${corpo.reflexo}</g><g class="miolo" filter="url(#brilho)">${corpo.miolo}</g><g class="luz" filter="url(#brilho)">${corpo.luz}</g>
${bracoPlaca}
<g filter="url(#brilhoFino)"><g class="olhoNormal">${pontos(OLHOS.normal)}</g><g class="cima" style="opacity:0">${pontos(OLHOS.cima)}</g><g class="feliz" style="opacity:0">${pontos(OLHOS.feliz)}</g></g>
</g></g>
</svg>
`;
}

await mkdir("assets", { recursive: true });
for (const tema of Object.keys(TEMAS)) {
  await writeFile(`assets/placa-${tema}.svg`, gerar(tema));
  console.log(`gerado assets/placa-${tema}.svg`);
}
