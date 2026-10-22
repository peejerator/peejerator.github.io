import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

process.on('uncaughtException', error => { console.error(error.message); process.exit(1); });

const source = await readFile(new URL('../src/modules/circuitLayout.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { createBoardLayout, overlaps, STATION_PITCH, COMPONENT_CLEARANCE } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const stops = Array.from({ length: 9 }, (_, i) => ({ x: i % 2 ? -1.6 : 2.2, y: i * STATION_PITCH, side: i % 2 ? -1 : 1, name: `Station ${i}`, label: `U${i}` }));
const parts = createBoardLayout(stops);
assert.equal(new Set(parts.map(p => p.reference)).size, parts.length, 'Unique component references');
assert.deepEqual(createBoardLayout(stops), parts, 'Layout must be deterministic');
for (let i = 0; i < parts.length; i++) {
  const part = parts[i];
  assert(part.w > 0 && part.d > 0);
  assert(Math.abs(part.x) + part.w / 2 < 18, 'Footprint stays on board');
  for (let j = i + 1; j < parts.length; j++) assert(!overlaps(part, parts[j]), `${part.reference} overlaps ${parts[j].reference}`);
}
// Ensure the clearance check includes component leads, not only body centres.
const example = parts[0];
assert(overlaps(example, { ...example, x: example.x + example.w + COMPONENT_CLEARANCE / 2 }));
assert(!overlaps(example, { ...example, x: example.x + example.w + COMPONENT_CLEARANCE * 2 }));
console.log(`PASS: ${parts.length} component footprints across 9 stations; no overlaps, ${COMPONENT_CLEARANCE} minimum clearance, stable placement, unique references.`);
