import { parseYaml } from '../src/config/yaml.js';
import YAML from 'yaml';
import assert from 'node:assert/strict';

const docs = [
`name: Eric
skills:
  - Rust
  - Python`,
`profile:
  name: Eric
  headline: "Systems engineer"
  about: |
    First paragraph.

    Second paragraph with a [link](https://example.com).
projects:
  - name: EricSearch
    technologies: [Rust, SQLite]
    links: { github: https://github.com/x, live: https://y.dev }
    start: 2021-04
    end: present`,
`a:
  b:
    c:
      - 1
      - 2
  d: true
e: null
f: "quoted: value"
g: 'it''s fine'
h: 3.14
i: -7
`,
`social:
  github:
    url: https://github.com/eric
    handle: "@eric"
  linkedin: https://linkedin.com/in/eric
sections:
  - title: Speaking
    layout: timeline
    items:
      - title: PyCon
        date: 2023
        links:
          slides: https://example.com/slides
`,
`# leading comment
defaults: &defaults
  level: expert
skills:
  - name: Rust
    <<: *defaults
  - name: Python
    <<: *defaults
    level: advanced
`,
`empty:
list:
  -
  - x
nested:
  - - a
    - b
  - - c
`,
`block: >-
  folded line one
  still same paragraph

  new paragraph
`,
`urls:
  - https://example.com
  - http://foo.bar/baz?a=1#frag
trailing: value # comment
colon: 12:30
version: 1.0.0
date: 2024-01-02
`,
];

let failures = 0;
for (const [i, doc] of docs.entries()) {
  let mine;
  let theirs;
  let mineErr;
  let theirsErr;
  try {
    mine = parseYaml(doc);
  } catch (error) {
    mineErr = error;
  }
  try {
    theirs = YAML.parse(doc);
  } catch (error) {
    theirsErr = error;
  }
  try {
    assert.deepEqual(mine, theirs);
    console.log(`doc ${i}: OK`);
  } catch {
    failures += 1;
    console.log(`doc ${i}: MISMATCH`);
    console.log('  mine  ', JSON.stringify(mine), mineErr?.message ?? '');
    console.log('  theirs', JSON.stringify(theirs), theirsErr?.message ?? '');
  }
}
console.log(failures ? `${failures} failures` : 'all good');
