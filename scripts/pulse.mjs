#!/usr/bin/env node
// ───────────────────────────────────────────────────────────────
//  pulse.mjs — gera dist/commit-pulse.svg a partir do calendário
//  de contribuições do GitHub (últimos 12 meses), com animações.
//
//  Uso:
//    GITHUB_TOKEN=xxx node scripts/pulse.mjs <usuario>
//    node scripts/pulse.mjs --demo          (dados fictícios p/ preview)
// ───────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const DEMO = args.includes("--demo");
const USER = args.find((a) => !a.startsWith("--")) || process.env.GITHUB_USER || "Anselmo-Dias";
const OUT = process.env.PULSE_OUT || "dist/commit-pulse.svg";

// ── 1. Dados ────────────────────────────────────────────────────
async function fetchCalendar(login) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN não definido");
  const query = `query($login:String!){ user(login:$login){
    contributionsCollection{ contributionCalendar{ totalContributions
      weeks{ contributionDays{ date contributionCount } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const cal = json.data.user.contributionsCollection.contributionCalendar;
  return cal.weeks.map((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })));
}

function demoCalendar() {
  // gera 53 semanas com ritmo realista (mais intenso nos últimos meses)
  const weeks = [];
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 364 - start.getDay());
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const d = new Date(start);
  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      if (d > end) break;
      const ramp = 0.35 + (w / 53) * 0.9;
      const weekend = i === 0 || i === 6 ? 0.45 : 1;
      const burst = Math.sin(w / 4) > 0.6 ? 1.6 : 1;
      const v = rnd() < 0.18 ? 0 : Math.round(rnd() * 14 * ramp * weekend * burst);
      week.push({ date: d.toISOString().slice(0, 10), count: v });
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// ── 2. Métricas ─────────────────────────────────────────────────
function stats(weeks) {
  const days = weeks.flat();
  const total = days.reduce((s, d) => s + d.count, 0);
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  // sequência atual: conta de trás pra frente (hoje sem commit ainda não quebra)
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i === days.length - 1) continue;
    else break;
  }
  const best = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]);
  const weekly = weeks.map((w) => w.reduce((s, d) => s + d.count, 0));
  const activeDays = days.filter((d) => d.count > 0).length;
  return { total, longest, current, best, weekly, activeDays, days: days.length };
}

// ── 3. SVG ──────────────────────────────────────────────────────
const C = {
  bg0: "#05060f", bg1: "#0b0d1f", line: "#1c2140", dim: "#5b6488", text: "#e6e9ff",
  cyan: "#22d3ee", violet: "#a855f7", pink: "#f472b6",
  lv: ["#12152b", "#2e1065", "#5b21b6", "#9333ea", "#22d3ee"],
};
const FONT = "'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const fmt = (n) => n.toLocaleString("pt-BR");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function level(count, max) {
  if (count === 0) return 0;
  const r = count / max;
  return r > 0.75 ? 4 : r > 0.45 ? 3 : r > 0.2 ? 2 : 1;
}

function render(weeks, s) {
  const W = 900, H = 470;
  const cell = 12, gap = 3, step = cell + gap;
  const gx = (W - weeks.length * step + gap) / 2, gy = 168;
  const max = Math.max(1, ...weeks.flat().map((d) => d.count));
  const gridW = weeks.length * step - gap;

  // células
  let cells = "";
  weeks.forEach((week, wi) => {
    week.forEach((d) => {
      const di = new Date(d.date + "T12:00:00Z").getUTCDay();
      const lv = level(d.count, max);
      const delay = (wi * 0.028 + di * 0.018 + 0.6).toFixed(3);
      cells += `<rect class="c${lv ? " on" : ""}" x="${gx + wi * step}" y="${gy + di * step}" width="${cell}" height="${cell}" rx="2.5" fill="${C.lv[lv]}" style="animation-delay:${delay}s"><title>${d.date}: ${d.count}</title></rect>`;
    });
  });

  // meses
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  let mlabels = "", lastM = -1;
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].date + "T12:00:00Z").getUTCMonth();
    if (m !== lastM && wi < weeks.length - 2) {
      if (lastM !== -1 || wi === 0) mlabels += `<text x="${gx + wi * step}" y="${gy - 9}" class="lbl">${months[m]}</text>`;
      lastM = m;
    }
  });

  // curva semanal
  const cx0 = gx, cw = gridW, cy0 = 300, ch = 110;
  const wmax = Math.max(1, ...s.weekly);
  const pts = s.weekly.map((v, i) => [cx0 + (i / (s.weekly.length - 1)) * cw, cy0 + ch - (v / wmax) * ch]);
  let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2;
    path += ` C${mx.toFixed(1)},${y0.toFixed(1)} ${mx.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  const area = `${path} L${(cx0 + cw).toFixed(1)},${cy0 + ch} L${cx0},${cy0 + ch} Z`;
  const peakI = s.weekly.indexOf(wmax);
  const [px, py] = pts[peakI];
  let hlines = "";
  for (let k = 0; k <= 3; k++) {
    const y = cy0 + (ch / 3) * k;
    hlines += `<line x1="${cx0}" x2="${cx0 + cw}" y1="${y}" y2="${y}" stroke="${C.line}" stroke-dasharray="2 5"/>`;
  }

  const statBox = (x, label, value, sub, color, i) => `
    <g class="stat" style="animation-delay:${(0.15 + i * 0.12).toFixed(2)}s">
      <rect x="${x}" y="70" width="196" height="66" rx="10" fill="${C.bg1}" stroke="${C.line}"/>
      <rect x="${x}" y="70" width="3" height="66" rx="1.5" fill="${color}"/>
      <text x="${x + 16}" y="92" class="lbl">${label}</text>
      <text x="${x + 16}" y="121" class="big" fill="${color}">${value}</text>
      <text x="${x + 182}" y="121" class="lbl" text-anchor="end">${sub}</text>
    </g>`;

  const bestDate = new Date(s.best.date + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "").replace(" de ", " ");
  const synced = new Date().toLocaleString("pt-BR", { timeZone: "America/Bahia", dateStyle: "short", timeStyle: "short" });
  const rate = Math.round((s.activeDays / s.days) * 100);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Commit pulse de ${esc(USER)}: ${s.total} contribuições no último ano">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${C.bg0}"/><stop offset="1" stop-color="#0d0820"/></linearGradient>
  <linearGradient id="stroke" x1="0" x2="1"><stop offset="0" stop-color="${C.violet}"/><stop offset=".6" stop-color="${C.pink}"/><stop offset="1" stop-color="${C.cyan}"/></linearGradient>
  <linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.violet}" stop-opacity=".35"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></linearGradient>
  <linearGradient id="scan" x1="0" x2="1"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".85" stop-color="${C.cyan}" stop-opacity=".22"/><stop offset="1" stop-color="${C.cyan}" stop-opacity=".9"/></linearGradient>
  <radialGradient id="glow" cx=".85" cy="0" r=".7"><stop offset="0" stop-color="${C.violet}" stop-opacity=".22"/><stop offset="1" stop-color="${C.violet}" stop-opacity="0"/></radialGradient>
  <filter id="neon" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="gridclip"><rect x="${gx - 4}" y="${gy - 4}" width="${gridW + 8}" height="${7 * step + 5}"/></clipPath>
</defs>
<style>
  text{font-family:${FONT}}
  .lbl{font-size:10.5px;fill:${C.dim};letter-spacing:.06em}
  .big{font-size:24px;font-weight:700}
  .ttl{font-size:15px;font-weight:700;fill:${C.text};letter-spacing:.18em}
  .c{transform-box:fill-box;transform-origin:center;animation:pop .45s cubic-bezier(.3,1.6,.5,1) backwards}
  .c.on{animation:pop .45s cubic-bezier(.3,1.6,.5,1) backwards,breathe 6s ease-in-out 3.2s infinite}
  @keyframes pop{from{opacity:0;transform:scale(0)}}
  @keyframes breathe{50%{opacity:.72}}
  .stat{animation:rise .6s ease-out backwards}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}}
  .scan{animation:scan 4.5s linear 2.6s infinite backwards}
  @keyframes scan{from{transform:translateX(0)}to{transform:translateX(${gridW + 70}px)}}
  .curve{stroke-dasharray:3000;animation:draw 2.4s ease-in-out 2.1s backwards}
  @keyframes draw{from{stroke-dashoffset:3000}}
  .fade{animation:fade 1.2s ease 3.4s backwards}
  @keyframes fade{from{opacity:0}}
  .live{animation:blink 1.4s ease-in-out infinite}
  @keyframes blink{50%{opacity:.2}}
</style>

<rect width="${W}" height="${H}" rx="16" fill="url(#bg)"/>
<rect width="${W}" height="${H}" rx="16" fill="url(#glow)"/>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="15.5" fill="none" stroke="${C.line}"/>

<!-- header -->
<circle cx="34" cy="38" r="5" fill="${C.cyan}" class="live" filter="url(#neon)"/>
<text x="50" y="43" class="ttl">COMMIT_PULSE</text>
<text x="196" y="43" class="lbl">// ${esc(USER.toLowerCase())} · últimos 12 meses</text>
<text x="${W - 30}" y="43" class="lbl" text-anchor="end">sync ${esc(synced)} · auto</text>

<!-- stats -->
${statBox(30, "CONTRIBUIÇÕES", fmt(s.total), "/ano", C.cyan, 0)}
${statBox(240, "SEQUÊNCIA ATUAL", s.current, "dias", C.pink, 1)}
${statBox(450, "MAIOR SEQUÊNCIA", s.longest, "dias", C.violet, 2)}
${statBox(660, "MELHOR DIA", s.best.count, bestDate, "#facc15", 3)}

<!-- grid -->
${mlabels}
<g>${cells}</g>
<g clip-path="url(#gridclip)"><rect class="scan" x="${gx - 70}" y="${gy - 4}" width="70" height="${7 * step + 5}" fill="url(#scan)"/></g>

<!-- curva semanal -->
<text x="${cx0}" y="${cy0 - 12}" class="lbl">COMMITS / SEMANA</text>
<text x="${cx0 + cw}" y="${cy0 - 12}" class="lbl" text-anchor="end">${rate}% dias ativos · pico ${wmax}/sem</text>
${hlines}
<path d="${area}" fill="url(#area)" class="fade"/>
<path id="curve" d="${path}" fill="none" stroke="url(#stroke)" stroke-width="2.4" stroke-linecap="round" class="curve" filter="url(#neon)"/>
<g class="fade">
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${C.cyan}" filter="url(#neon)"/>
  <circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="none" stroke="${C.cyan}"><animate attributeName="r" values="4;14" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values="1;0" dur="1.8s" repeatCount="indefinite"/></circle>
  <circle r="3.2" fill="#fff" filter="url(#neon)"><animateMotion dur="7s" repeatCount="indefinite" begin="4.5s"><mpath href="#curve"/></animateMotion></circle>
</g>

<!-- legenda -->
<g class="fade">
  <text x="${cx0}" y="${H - 22}" class="lbl">menos</text>
  ${C.lv.map((c, i) => `<rect x="${cx0 + 44 + i * 15}" y="${H - 31}" width="11" height="11" rx="2.5" fill="${c}"/>`).join("")}
  <text x="${cx0 + 44 + 5 * 15 + 4}" y="${H - 22}" class="lbl">mais</text>
  <text x="${cx0 + cw}" y="${H - 22}" class="lbl" text-anchor="end">agent://pulse.mjs ▸ gerado via GitHub Actions</text>
</g>
</svg>`;
}

// ── 4. Run ──────────────────────────────────────────────────────
const weeks = DEMO ? demoCalendar() : await fetchCalendar(USER);
const svg = render(weeks, stats(weeks));
mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(OUT, svg);
console.log(`✓ ${OUT} (${(svg.length / 1024).toFixed(1)} KB)`);
