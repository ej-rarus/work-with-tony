import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const expected=['request-to-action','draft-message','document-revise','meeting-followup','calendar-entry','deliver','expense-claim','followup-tracker'];
test('both hosts expose the eight real skill entrypoints at a matching version',()=>{
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

test('draft-message writes channel-specific copy and never sends',()=>{
  const text=fs.readFileSync(path.join(root,'skills','draft-message','SKILL.md'),'utf8');
  for(const needle of ['work-contract.md','Teams','이메일','Slack','제목','deliver'])assert.ok(text.includes(needle),`draft-message missing ${needle}`);
  assert.match(text,/보내지 않는다/);
  assert.doesNotMatch(text,/[가-힣]{2,3}님께/,'examples must not name real people');
});
test('meeting-followup carries a built-in meeting-notes format and file naming',()=>{
  const text=fs.readFileSync(path.join(root,'skills','meeting-followup','SKILL.md'),'utf8');
  for(const needle of ['| 항목 | 결정 사항 |','| # | 담당 | 내용 | 기한 |','_정리본.md','**참석','문어체'])assert.ok(text.includes(needle),`meeting-followup missing ${needle}`);
});
test('README lists every skill',()=>{
  const readme=fs.readFileSync(path.join(root,'README.md'),'utf8');
  for(const name of expected)assert.ok(readme.includes('`'+name+'`'),`README missing ${name}`);
  assert.ok(readme.includes('8개 스킬'));
});
