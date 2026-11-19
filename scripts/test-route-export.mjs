import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const code=ts.transpileModule(await readFile('src/lib/routeExport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {routeLegs}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const stops=Array.from({length:23},(_,i)=>`Stop ${i+1}, Johannesburg`);
const legs=routeLegs(stops);
assert.deepEqual(legs.flatMap(l=>l.stops),stops);
assert.equal(legs.length,6);
for(const [i,leg] of legs.entries()) {const p=new URL(leg.url).searchParams;assert.equal(p.get('destination'),leg.stops.at(-1));assert.ok((p.get('waypoints')||'').split('|').filter(Boolean).length<=3);if(i)assert.equal(p.get('origin'),legs[i-1].stops.at(-1));}
assert.deepEqual(routeLegs([]),[]);
console.log('PASS: every stop exported once, mobile waypoint bounds and connected legs');