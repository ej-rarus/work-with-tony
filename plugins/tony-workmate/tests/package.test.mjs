import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const expected=['request-to-action','document-revise','meeting-followup','calendar-entry','deliver','expense-claim','followup-tracker'];
test('both hosts expose the seven real skill entrypoints at a matching version',()=>{
  const codex=JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json')));
  const claude=JSON.parse(fs.readFileSync(path.join(root,'.claude-plugin/plugin.json')));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
  assert.equal(codex.name,'tony-workmate');assert.equal(claude.name,codex.name);
  assert.equal(codex.version,claude.version);assert.equal(pkg.version,codex.version);
  assert.deepEqual(fs.readdirSync(path.resolve(root,codex.skills)).sort(),[...expected].sort());
  for(const name of expected){
    const text=fs.readFileSync(path.join(root,'skills',name,'SKILL.md'),'utf8');
    assert.match(text,new RegExp(`^---\\nname: ${name}\\n`));
    assert.match(text,/\ndescription: "[^\n]+"\n---/);
  }
});
test('bundled Markdown references resolve within the installed package',()=>{
  function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
  for(const file of walk(root).filter(f=>f.endsWith('.md'))){
    for(const match of fs.readFileSync(file,'utf8').matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
      if(/^(https?:|#)/.test(match[1]))continue;
      const target=path.resolve(path.dirname(file),match[1].split('#')[0]);
      assert.ok(target.startsWith(root+path.sep),`${file}: reference escapes plugin`);
      assert.ok(fs.existsSync(target),`${file}: missing ${match[1]}`);
    }
  }
});
