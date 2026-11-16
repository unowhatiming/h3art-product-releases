/* 豆屿 — deterministic image and pattern operations, also testable in Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BeadCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const swatches = [
    ['米白','#FFF6E5'],['雪白','#FFFFFF'],['浅灰','#D7D9D8'],['石灰','#A1A5A3'],['炭灰','#62676A'],['墨黑','#292D32'],
    ['奶黄','#FFF0AD'],['柠檬','#FFE15A'],['金黄','#F4BC38'],['杏黄','#F5D08A'],['焦糖','#BF854A'],['巧克力','#754E3C'],
    ['桃粉','#FFD2CA'],['浅粉','#F4AAB8'],['莓粉','#E47B98'],['玫红','#C34876'],['珊瑚','#F48471'],['番茄','#E65C4B'],
    ['正红','#C9393F'],['酒红','#8E3548'],['蜜桃','#FFB993'],['橘子','#F29344'],['南瓜','#D76F38'],['砖红','#AD533E'],
    ['嫩绿','#D6E6B2'],['抹茶','#ACC985'],['草绿','#7CA46B'],['叶绿','#488468'],['森林','#2E5D50'],['墨绿','#23453F'],
    ['薄荷','#C3E4D7'],['青瓷','#96CDC4'],['湖绿','#55ADA5'],['孔雀','#2C858B'],['深青','#286370'],['海盐','#D5EBF1'],
    ['天蓝','#A6D6E9'],['晴蓝','#70B4D2'],['牛仔','#438BE0'],['海蓝','#3261CE'],['藏蓝','#344A70'],['午夜','#28374E'],
    ['雾紫','#DFD9EE'],['丁香','#BDAED7'],['香芋','#9E8DBF'],['紫罗兰','#7E649D'],['葡萄','#644D7C'],['紫灰','#8B7B96'],
    ['肤白','#F6DECA'],['肤粉','#EBC3AD'],['浅棕','#D1AD8E'],['木棕','#AF8E72'],['栗棕','#8C6C56'],['深棕','#58453C'],
    ['黄绿','#C6D465'],['橄榄','#9CA454'],['芥末','#B7A052'],['雾蓝','#A3B5C3'],['灰蓝','#748D9E'],['藕粉','#C5A0A6'],
    ['奶茶','#DFD1BA'],['沙色','#C5B89D'],['暖灰','#A69D90'],['褐灰','#7B756E']
  ];
  const palette = swatches.map(([name, hex], i) => ({ code: 'D' + String(i + 1).padStart(2,'0'), name, hex }));
  function rgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
  function lab(r,g,b) {
    const a=[r,g,b].map(v => {v/=255; return v>0.04045 ? ((v+0.055)/1.055)**2.4 : v/12.92;});
    const f=v=>v>0.008856 ? Math.cbrt(v) : 7.787*v+16/116;
    const x=f((a[0]*.4124564+a[1]*.3575761+a[2]*.1804375)/.95047);
    const y=f(a[0]*.2126729+a[1]*.7151522+a[2]*.072175);
    const z=f((a[0]*.0193339+a[1]*.119192+a[2]*.9503041)/1.08883);
    return [116*y-16,500*(x-y),200*(y-z)];
  }
  const distance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
  function nearest(value, labs, allowed) {
    let best=allowed[0], min=Infinity;
    for (const i of allowed) { const d=distance(value,labs[i]); if(d<min){min=d;best=i;} }
    return best;
  }
  function backgroundMask(data,w,h,tolerance) {
    const mask=new Uint8Array(w*h), queue=[];
    const isBackground=i=>data[i*4+3]<128 || Math.min(data[i*4],data[i*4+1],data[i*4+2])>=255-tolerance;
    function push(i){if(!mask[i]&&isBackground(i)){mask[i]=1;queue.push(i);}}
    for(let x=0;x<w;x++){push(x);push((h-1)*w+x);}
    for(let y=0;y<h;y++){push(y*w);push(y*w+w-1);}
    for(let n=0;n<queue.length;n++){const i=queue[n],x=i%w,y=Math.floor(i/w);if(x)push(i-1);if(x<w-1)push(i+1);if(y)push(i-w);if(y<h-1)push(i+w);}
    return mask;
  }
  function quantize(data,w,h,colors,options={}) {
    const {maxColors=20,brightness=0,contrast=0,saturation=100,removeWhite=false,tolerance=30,dither=false}=options;
    const labs=colors.map(c=>lab(...rgb(c.hex))), allowed=colors.map((_,i)=>i).filter(i=>colors[i].matchable!==false);
    if(!allowed.length)throw Error('色板没有可用于自动匹配的常规色');
    const mask=removeWhite?backgroundMask(data,w,h,tolerance):new Uint8Array(w*h);
    const values=new Float32Array(w*h*3), mapped=new Int16Array(w*h).fill(-1), counts=new Map();
    const factor=(259*(contrast+255))/(255*(259-contrast));
    for(let i=0;i<w*h;i++){
      if(data[i*4+3]<128||mask[i])continue;
      let c=[0,1,2].map(j=>clamp(factor*(data[i*4+j]-128)+128+brightness*2.55,0,255));
      const gray=.2126*c[0]+.7152*c[1]+.0722*c[2];
      c=c.map(v=>clamp(gray+(v-gray)*saturation/100,0,255)); values.set(c,i*3);
      const k=nearest(lab(...c),labs,allowed); mapped[i]=k; counts.set(k,(counts.get(k)||0)+1);
    }
    // Weighted farthest-point seeding, then discrete k-means in perceptual Lab.
    let selected=[...counts.keys()].sort((a,b)=>counts.get(b)-counts.get(a)||a-b);
    const limit=clamp(Math.round(maxColors),1,allowed.length);
    if(selected.length>limit){
      const candidates=selected.slice(); selected=[candidates[0]];
      while(selected.length<limit){let best=-1,score=-1;for(const k of candidates){if(selected.includes(k))continue;const s=Math.min(...selected.map(j=>distance(labs[k],labs[j])))*Math.sqrt(counts.get(k));if(s>score){score=s;best=k;}} selected.push(best);}
      for(let pass=0;pass<5;pass++){
        const sums=selected.map(()=>[0,0,0,0]);
        for(const k of candidates){const j=selected.indexOf(nearest(labs[k],labs,selected)), n=counts.get(k);for(let c=0;c<3;c++)sums[j][c]+=labs[k][c]*n;sums[j][3]+=n;}
        const next=[];
        for(let j=0;j<sums.length;j++){const s=sums[j];const choices=allowed.filter(k=>!next.includes(k));next.push(s[3]?nearest(s.slice(0,3).map(v=>v/s[3]),labs,choices):selected[j]);}
        selected=next;
      }
    }
    if(!selected.length)return Array.from(mapped);
    const colorRGB=colors.map(c=>rgb(c.hex));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(mapped[i]<0)continue;
      const c=Array.from(values.slice(i*3,i*3+3)).map(v=>clamp(v,0,255));
      const k=nearest(lab(...c),labs,selected);mapped[i]=k;
      if(dither){const err=c.map((v,j)=>v-colorRGB[k][j]);for(const [dx,dy,f] of [[1,0,7/16],[-1,1,3/16],[0,1,5/16],[1,1,1/16]]){const nx=x+dx,ny=y+dy,ni=ny*w+nx;if(nx<0||nx>=w||ny>=h||mapped[ni]<0)continue;for(let j=0;j<3;j++)values[ni*3+j]+=err[j]*f;}}
    }
    return Array.from(mapped);
  }
  function fill(pixels,w,h,x,y,color){
    const origin=pixels[y*w+x];if(origin===color)return false;
    const queue=[y*w+x];pixels[queue[0]]=color;
    for(let n=0;n<queue.length;n++){const i=queue[n],cx=i%w,cy=Math.floor(i/w);for(const j of [cx>0?i-1:-1,cx<w-1?i+1:-1,cy>0?i-w:-1,cy<h-1?i+w:-1])if(j>=0&&pixels[j]===origin){pixels[j]=color;queue.push(j);}}
    return true;
  }
  function line(x0,y0,x1,y1,visit){let dx=Math.abs(x1-x0),sx=x0<x1?1:-1,dy=-Math.abs(y1-y0),sy=y0<y1?1:-1,err=dx+dy;while(true){visit(x0,y0);if(x0===x1&&y0===y1)break;const e=2*err;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}}
  function transform(doc,kind){
    const {w,h,pixels}=doc,rotate=kind==='rotate',nw=rotate?h:w,nh=rotate?w:h,out=Array(w*h).fill(-1);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){let nx=x,ny=y;if(kind==='horizontal')nx=w-1-x;if(kind==='vertical')ny=h-1-y;if(rotate){nx=h-1-y;ny=x;}out[ny*nw+nx]=pixels[y*w+x];}
    return {w:nw,h:nh,pixels:out};
  }
  function trim(doc){
    let left=doc.w,top=doc.h,right=-1,bottom=-1;
    doc.pixels.forEach((v,i)=>{if(v<0)return;const x=i%doc.w,y=Math.floor(i/doc.w);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);});
    if(right<0)return {w:doc.w,h:doc.h,pixels:doc.pixels.slice()};
    const w=right-left+1,h=bottom-top+1,pixels=[];
    for(let y=top;y<=bottom;y++)pixels.push(...doc.pixels.slice(y*doc.w+left,y*doc.w+right+1));
    return {w,h,pixels};
  }
  function resize(doc,w,h,scale=false){const pixels=Array(w*h).fill(-1);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=scale?Math.min(doc.w-1,Math.floor(x*doc.w/w)):x,sy=scale?Math.min(doc.h-1,Math.floor(y*doc.h/h)):y;if(sx<doc.w&&sy<doc.h)pixels[y*w+x]=doc.pixels[sy*doc.w+sx];}return {w,h,pixels};}
  function stats(doc){const counts=new Map();for(const k of doc.pixels)if(k>=0)counts.set(k,(counts.get(k)||0)+1);return [...counts].sort((a,b)=>b[1]-a[1]||a[0]-b[0]);}
  function validateProject(p){
    if(!p||p.format!=='douyu-beads'||p.version!==1)throw Error('不是豆屿项目文件（需要 .beads.json）');
    if(!Number.isInteger(p.w)||!Number.isInteger(p.h)||p.w<1||p.h<1||p.w>160||p.h>160)throw Error('图纸尺寸必须在 1–160 颗之间');
    validatePalette(p.palette);
    if(!Array.isArray(p.pixels)||p.pixels.length!==p.w*p.h||p.pixels.some(v=>!Number.isInteger(v)||v< -1||v>=p.palette.length))throw Error('图纸像素数据不完整或色号不存在');
    if(p.source && (typeof p.source!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(p.source)||p.source.length>15000000))throw Error('项目原图数据无效');
    return p;
  }
  function validatePalette(p){
    if(!Array.isArray(p)||p.length<1||p.length>1024)throw Error('色板需包含 1–1024 个颜色');
    const codes=new Set();
    for(const c of p){if(!c||typeof c.code!=='string'||!c.code.trim()||c.code.length>16||codes.has(c.code)||typeof c.name!=='string'||c.name.length>60||!/^#[0-9a-f]{6}$/i.test(c.hex)||('matchable' in c && typeof c.matchable!=='boolean')||('finish' in c && (typeof c.finish!=='string'||c.finish.length>40)))throw Error('色板需包含唯一 code、name 和 #RRGGBB 格式的 hex');codes.add(c.code);}
    return p;
  }
  function copyPalette(colors){return colors.map(c=>({code:c.code,name:c.name,hex:c.hex,...(c.matchable===false?{matchable:false}:{}),...(c.finish?{finish:c.finish}:{})}));}
  function remapPalette(doc,colors){
    validatePalette(colors);
    const labs=colors.map(c=>lab(...rgb(c.hex))),allowed=colors.map((_,i)=>i).filter(i=>colors[i].matchable!==false);
    if(!allowed.length)throw Error('新色板没有可用于匹配的常规色');
    const map=doc.palette.map(c=>nearest(lab(...rgb(c.hex)),labs,allowed));
    return {w:doc.w,h:doc.h,pixels:doc.pixels.map(k=>k<0?-1:map[k]),palette:copyPalette(colors)};
  }
  return {clamp,palette,rgb,lab,distance,nearest,backgroundMask,quantize,fill,line,transform,trim,resize,stats,validateProject,validatePalette,copyPalette,remapPalette};
});
