const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/core.js');
const basic = [{code:'W',name:'白',hex:'#FFFFFF'},{code:'K',name:'黑',hex:'#000000'},{code:'R',name:'红',hex:'#FF0000'}];
const rgba = rows => Uint8ClampedArray.from(rows.flat());

test('exact palette colors and transparent pixels survive conversion',()=>{
  const data=rgba([[255,255,255,255],[0,0,0,255],[255,0,0,255],[255,0,0,0]]);
  assert.deepEqual(C.quantize(data,4,1,basic,{maxColors:3}),[0,1,2,-1]);
});
test('white removal is edge-connected and preserves enclosed white details',()=>{
  const data=rgba(Array.from({length:49},(_,i)=>{const x=i%7,y=Math.floor(i/7),black=(x===1||x===5||y===1||y===5)&&x>=1&&x<=5&&y>=1&&y<=5;return black?[0,0,0,255]:[255,255,255,255];}));
  const output=C.quantize(data,7,7,basic,{removeWhite:true,tolerance:10,maxColors:3});
  assert.equal(output[0],-1);assert.equal(output[24],0);assert.equal(output[8],1);assert.equal(output.filter(v=>v===-1).length,24);
});
test('white tolerance does not remove shaded objects below threshold',()=>{
  assert.deepEqual(Array.from(C.backgroundMask(rgba([[230,230,230,255],[255,255,255,255]]),2,1,20)),[0,1]);
});
test('strict color cap holds for gradients with and without dithering',()=>{
  const data=rgba(Array.from({length:4096},(_,i)=>[(i*17)%256,(i*31)%256,(i*47)%256,i%23===0?0:255]));
  for(const maxColors of [1,2,8,16])for(const dither of [false,true]){const p=C.quantize(data,64,64,C.palette,{maxColors,dither});assert.ok(new Set(p.filter(x=>x>=0)).size<=maxColors);assert.equal(p.length,4096);assert.equal(p[0],-1);assert.ok(p.every(x=>x>=-1&&x<C.palette.length));}
});
test('conversion is deterministic',()=>{
  const data=rgba(Array.from({length:100},(_,i)=>[i*2,i*3%255,255-i,255]));assert.deepEqual(C.quantize(data,10,10,C.palette,{maxColors:4}),C.quantize(data,10,10,C.palette,{maxColors:4}));
});
test('brightness and saturation alter conversion in the expected direction',()=>{
  const data=rgba([[125,125,125,255]]),bw=basic.slice(0,2);assert.deepEqual(C.quantize(data,1,1,bw,{brightness:60}),[0]);assert.deepEqual(C.quantize(data,1,1,bw,{brightness:-60}),[1]);
  const p=C.quantize(rgba([[255,0,0,255]]),1,1,basic,{saturation:0});assert.notEqual(p[0],2);
});
test('empty transparent image produces an empty pattern',()=>assert.deepEqual(C.quantize(new Uint8ClampedArray(64),4,4,basic),Array(16).fill(-1)));
test('single-color custom palette is supported',()=>assert.deepEqual(C.quantize(rgba([[120,180,80,255]]),1,1,[basic[0]],{maxColors:12}),[0]));
test('Lab known neutral points',()=>{assert.ok(Math.abs(C.lab(255,255,255)[0]-100)<.001);assert.deepEqual(C.lab(0,0,0),[0,0,0]);});
test('flood fill respects connected regions and does not wrap rows',()=>{
  const p=[1,0,0,1,0,1,1,1,1];C.fill(p,3,3,1,0,2);assert.deepEqual(p,[1,2,2,1,2,1,1,1,1]);assert.equal(C.fill(p,3,3,1,0,2),false);
});
test('flood fill handles entire maximum-sized blank grid without recursion overflow',()=>{const p=Array(25600).fill(-1);C.fill(p,160,160,0,0,3);assert.ok(p.every(v=>v===3));});
test('continuous strokes cover endpoints and all horizontal gaps',()=>{const p=[];C.line(0,2,10,2,(x,y)=>p.push([x,y]));assert.equal(p.length,11);assert.deepEqual(p[0],[0,2]);assert.deepEqual(p.at(-1),[10,2]);});
test('diagonal strokes are continuous in all octants',()=>{for(const end of [[8,3],[3,8],[-8,3],[-3,-8],[0,0]]){const p=[];C.line(0,0,...end,(x,y)=>p.push([x,y]));assert.deepEqual(p.at(-1),end);for(let i=1;i<p.length;i++)assert.equal(Math.max(Math.abs(p[i][0]-p[i-1][0]),Math.abs(p[i][1]-p[i-1][1])),1);}});
test('rotation swaps rectangular dimensions and preserves exact coordinates',()=>{
  const d={w:3,h:2,pixels:[0,1,2,3,4,5]};assert.deepEqual(C.transform(d,'rotate'),{w:2,h:3,pixels:[3,0,4,1,5,2]});let p=d;for(let i=0;i<4;i++)p=C.transform(p,'rotate');assert.deepEqual(p,d);
});
test('both mirrors are involutions',()=>{const d={w:3,h:2,pixels:[-1,1,2,3,4,5]};for(const type of ['horizontal','vertical'])assert.deepEqual(C.transform(C.transform(d,type),type),d);});
test('trim keeps internal transparency and handles empty canvas',()=>{
  assert.deepEqual(C.trim({w:4,h:3,pixels:[-1,-1,-1,-1,-1,2,-1,3,-1,-1,-1,-1]}),{w:3,h:1,pixels:[2,-1,3]});const empty={w:2,h:2,pixels:[-1,-1,-1,-1]};assert.deepEqual(C.trim(empty),empty);
});
test('canvas resize anchors top-left and pads with empty beads',()=>assert.deepEqual(C.resize({w:2,h:2,pixels:[0,1,2,3]},3,2),{w:3,h:2,pixels:[0,1,-1,2,3,-1]}));
test('nearest-neighbor resize preserves palette indices',()=>assert.deepEqual(C.resize({w:2,h:1,pixels:[0,2]},4,2,true),{w:4,h:2,pixels:[0,0,2,2,0,0,2,2]}));
test('material counts exclude empty cells',()=>assert.deepEqual(C.stats({pixels:[-1,0,2,2,2,1,1]}),[[2,3],[1,2],[0,1]]));
test('project validator rejects malformed and hostile files',()=>{
  const p={format:'douyu-beads',version:1,w:2,h:1,palette:basic,pixels:[0,-1]};assert.equal(C.validateProject(p),p);
  for(const patch of [{w:161},{w:2.5},{pixels:[9,0]},{pixels:[0]},{source:'https://example.com/tracker'},{version:99},{palette:[{code:'x',name:'red',hex:'red'}]}])assert.throws(()=>C.validateProject({...p,...patch}));
});
test('palette validation enforces unique finite color codes',()=>{assert.throws(()=>C.validatePalette([basic[0],basic[0]]));assert.throws(()=>C.validatePalette([]));assert.equal(C.validatePalette(basic),basic);});
