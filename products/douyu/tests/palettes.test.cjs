const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../dist/core.js');
const catalog=require('../dist/palettes.js');

test('all twelve brand palettes validate, including palettes above 256 colors',()=>{
  assert.equal(catalog.palettes.length,12);
  assert.equal(new Set(catalog.palettes.map(p=>p.brand)).size,8);
  for(const p of catalog.palettes){C.validatePalette(p.colors);assert.match(p.revision,/^[a-f0-9]{40}$/);assert.ok(!p.colors.some(c=>c.code.startsWith('UNKNOWN')));}
});
test('brand identifiers retain upstream meaning rather than relabeling studio swatches',()=>{
  const hama=catalog.palettes.find(p=>p.id==='beadcolors-hama');
  assert.equal(hama.colors.find(c=>c.code==='01').name,'White');
  assert.equal(hama.colors.find(c=>c.code==='18').name,'Black');
  const perler=catalog.palettes.find(p=>p.id==='beadcolors-perler');
  assert.equal(perler.colors.find(c=>c.code==='80-19001').name,'White');
  assert.equal(catalog.palettes[0].colors.find(c=>c.code==='A1').hex,'#FAF5CD');
});
test('brand switch remaps bead colors without changing dimensions or empty cells',()=>{
  const from={w:3,h:1,palette:[{code:'WHITE',name:'白',hex:'#FFFFFF'},{code:'BLACK',name:'黑',hex:'#000000'}],pixels:[0,-1,1]};
  const to=catalog.palettes.find(p=>p.id==='artkal-c-197-official').colors;
  const result=C.remapPalette(from,to);
  assert.equal(result.w,3);assert.equal(result.h,1);assert.equal(result.pixels[1],-1);
  assert.equal(result.palette[result.pixels[0]].code,'C01');
  assert.equal(result.palette[result.pixels[2]].code,'C02');
  assert.deepEqual(from.pixels,[0,-1,1]);assert.notEqual(result.palette,to);
});
test('special transparent colors are not automatically used as white beads',()=>{
  const colors=[{code:'CLEAR',name:'透明',hex:'#FFFFFF',matchable:false,finish:'透明材质'},{code:'WHITE',name:'白',hex:'#FAFAFA'}];
  assert.deepEqual(C.quantize(Uint8ClampedArray.from([255,255,255,255]),1,1,colors),[1]);
  assert.equal(C.remapPalette({w:1,h:1,pixels:[0],palette:[C.palette[1]]},colors).pixels[0],1);
  assert.equal(C.copyPalette(colors)[0].matchable,false);
});
test('291-color projects validate after JSON round trip',()=>{
  const palette=catalog.palettes.find(p=>p.id==='mard-291-github').colors;
  const p={format:'douyu-beads',version:1,w:1,h:1,pixels:[290],palette:C.copyPalette(palette)};
  C.validateProject(JSON.parse(JSON.stringify(p)));
});
