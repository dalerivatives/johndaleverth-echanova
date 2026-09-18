const fs = require('node:fs');
const assert = require('node:assert/strict');
const css = fs.readFileSync('static/style.css','utf8');
const v82 = css.slice(css.indexOf('V82 — PROFILE LAYER LOCK'));
assert(v82.length > 1000, 'V82 profile protection block must exist');
assert(/\.app\s*>\s*#codeField[\s\S]*#graphField[\s\S]*z-index:0!important/.test(v82), 'code and graph fields must be locked to backdrop');
assert(/\.app\s*>\s*\.workspace[\s\S]*z-index:4!important/.test(v82), 'workspace must be above backdrop fields');
assert(/#profileView \.human-backdrop::before[\s\S]*radial-gradient/.test(v82), 'shared human halo must exist');
assert(/#profileView \.human-backdrop\.revealed::before/.test(v82), 'revealed portrait must retain halo');
const portraitBlocks=[...v82.matchAll(/#profileView \.human-backdrop(?:\.revealed|\.crossfade)? \.real-portrait[^\{]*\{([^}]*)\}/g)].map(m=>m[1]);
for(const block of portraitBlocks){
  assert(!/(^|;)\s*(width|height|left|right|top|bottom|transform|object-position)\s*:/m.test(block), 'V82 must not alter portrait geometry');
}
assert(!/#profileView \.human-backdrop:not\(\.revealed\) #asciiArt\s*\{[^}]*filter\s*:/s.test(v82), 'V82 must preserve each theme\'s coded-human filter');
console.log('PASS: V82 backdrop lock, shared halo, theme filters, and portrait geometry protection');
