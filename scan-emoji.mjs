import fs from 'fs';
import path from 'path';

const cps = [0x2708, 0x1f6eb, 0x1f6ec, 0x1f6e9, 0xfe0f];
const entityRe = /&#(x2708|9992|x1f6eb|128667|x1f6ec|128668|x1f6e9|128665);?|&#9992;/i;
const hits = [];

function walk(d) {
  for (const f of fs.readdirSync(d)) {
    if (['node_modules', '.git'].includes(f)) continue;
    const p = path.join(d, f);
    const s = fs.statSync(p);
    if (s.isDirectory()) {
      walk(p);
    } else if (/\.(tsx|ts|jsx|js|json|html|css|svg|mjs)$/.test(f)) {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
      lines.forEach((ln, i) => {
        let hit = null;
        for (const c of cps) {
          if (ln.includes(String.fromCodePoint(c))) {
            hit = 'char';
            break;
          }
        }
        if (!hit && entityRe.test(ln)) hit = 'entity';
        if (hit) hits.push(`${hit} ${p.split(path.sep).join('/')}:${i + 1}: ${ln.trim().slice(0, 160)}`);
      });
    }
  }
}

walk('.');
console.log(hits.length ? hits.join('\n') : 'NO HITS');