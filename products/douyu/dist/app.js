/* Browser-local bead studio. No uploads, analytics, external fonts or runtime dependencies. */
(() => {
  'use strict';
  const C = window.BeadCore, $ = id => document.getElementById(id);
  const canvas = $('beadCanvas'), ctx = canvas.getContext('2d'), stage = $('canvasStage');
  const defaultOptions = {maxColors:16,brightness:0,contrast:0,saturation:100,removeWhite:false,tolerance:30,dither:false,smooth:true,imageFit:'contain',cropX:50,cropY:50};
  const catalog=window.BeadPalettes;
  const library=[...catalog.palettes,{id:'studio-legacy',brand:'旧版 / 自定义',name:'豆屿旧版 · 64 色（非品牌）',note:'旧版自定义 D 色号，不对应品牌。请在上方选择实际使用的品牌色板。',colors:C.palette}];
  const defaultPalette=library.find(p=>p.id===catalog.defaultId);
  let doc = {w:32,h:32,pixels:Array(1024).fill(-1),palette:C.copyPalette(defaultPalette.colors),name:'窗边的小花',paletteName:defaultPalette.name,paletteId:defaultPalette.id};
  let source = null, sourceData = null, activeColor = 28, tool = 'brush', view = 'beads', zoom = 1, cell = 16, margin = 22;
  let undoStack = [], redoStack = [], pointer = null, selection = null, highlight = false, tab = 'used', keyboardCell = null, spaceHeld = false;
  let saveTimer, toastTimer, isDirty = false, generationBusy = false, imageLoadId = 0;
  const colorContrast = hex => {const [r,g,b]=C.rgb(hex);return r*.299+g*.587+b*.114>151?'#293831':'#ffffff';};
  const escapeHTML = value => String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cleanName = () => (doc.name||'我的拼豆作品').replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').slice(0,60);
  function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3600);}
  function dialog(title,html){$('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;if(!$('dialog').open)$('dialog').showModal();}
  let exportedImageURL=null;
  function closeDialog(){$('dialog').close();}
  $('dialog').addEventListener('close',()=>{if(exportedImageURL){URL.revokeObjectURL(exportedImageURL);exportedImageURL=null;}});
  $('closeDialogBtn').onclick=closeDialog;
  $('dialog').addEventListener('click',e=>{if(e.target===$('dialog')){const r=$('dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
  function confirmChange(title,message,action,label='继续'){
    dialog(title,`<p>${escapeHTML(message)}</p><div class="dialog-actions"><button class="outline-btn" id="confirmCancel">取消</button><button class="primary-btn" id="confirmOkay">${escapeHTML(label)}</button></div>`);
    $('confirmCancel').onclick=closeDialog;$('confirmOkay').onclick=()=>{closeDialog();action();};
  }
  function getOptions(){const result={};for(const [key,value] of Object.entries(defaultOptions)){const el=$(key);result[key]=typeof value==='boolean'?el.checked:typeof value==='number'?Number(el.value):el.value;}return result;}
  function setOptions(options={}){$('maxColors').max=Math.max(2,doc.palette.length);for(const [key,value] of Object.entries(defaultOptions)){const val=options[key]??value,el=$(key);if(typeof value==='boolean')el.checked=!!val;else if(typeof value==='number')el.value=C.clamp(Number(val)||0,Number(el.min),Number(el.max));else el.value=['contain','cover','stretch'].includes(val)?val:value;if($(key+'Value'))$(key+'Value').textContent=el.value;}$('cropOptions').hidden=$('imageFit').value!=='cover';$('whiteOptions').hidden=!$('removeWhite').checked;}
  function snapshot(){return {w:doc.w,h:doc.h,pixels:doc.pixels.slice(),palette:C.copyPalette(doc.palette),name:doc.name,paletteName:doc.paletteName,paletteId:doc.paletteId};}
  function captureHistory(){return {doc:snapshot(),source,sourceData,options:getOptions()};}
  function pushUndo(){undoStack.push(captureHistory());if(undoStack.length>60)undoStack.shift();redoStack=[];}
  function commit(){isDirty=true;selection=null;renderAll();scheduleSave();}
  function mutate(fn){pushUndo();fn();commit();}
  function history(direction){const from=direction==='undo'?undoStack:redoStack,to=direction==='undo'?redoStack:undoStack;if(!from.length)return;to.push(captureHistory());const previous=from.pop();doc=previous.doc;setOptions(previous.options);if(previous.source)installSource(previous.source,previous.sourceData);else clearSource();activeColor=C.clamp(activeColor,0,doc.palette.length-1);selection=null;syncDimensions();$('projectName').value=doc.name;renderAll();scheduleSave();}
  function syncDimensions(){$('gridWidth').value=doc.w;$('gridHeight').value=doc.h;}
  function project(){return {format:'douyu-beads',version:1,...snapshot(),options:getOptions(),source:sourceData,materials:{beadSize:Number($('beadSize').value),sparePercent:Number($('sparePercent').value),unitPrice:Number($('unitPrice').value)},savedAt:new Date().toISOString()};}
  function persist(){clearTimeout(saveTimer);try{localStorage.setItem('douyu-beads-v1',JSON.stringify(project()));$('saveStatus').textContent='已自动保存';}catch(e){try{const p=project();p.source=null;localStorage.setItem('douyu-beads-v1',JSON.stringify(p));$('saveStatus').textContent='图纸已保存 · 原图请存项目';}catch{$('saveStatus').textContent='自动保存不可用 · 请保存项目';}}}
  function scheduleSave(){$('saveStatus').textContent='保存中…';clearTimeout(saveTimer);saveTimer=setTimeout(persist,600);}
  function readSize(){const w=Number($('gridWidth').value),h=Number($('gridHeight').value);if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>160||h>160){toast('宽高请输入 1–160 之间的整数');return null;}return {w,h};}
  function pixelCoordinates(e){const r=canvas.getBoundingClientRect();return {x:Math.floor((e.clientX-r.left-margin)/cell),y:Math.floor((e.clientY-r.top-margin)/cell)};}
  function inside(p){return p.x>=0&&p.y>=0&&p.x<doc.w&&p.y<doc.h;}
  function drawPattern(target,pattern,settings={}){
    const {w,h,pixels,palette}=pattern,s=settings.cell||cell,m=settings.margin??margin,mode=settings.mode||view;
    const grid=settings.grid??$('showGrid').checked,codes=settings.codes??$('showCodes').checked,boards=settings.boards??$('showBoards').checked;
    const focus=settings.focus??highlight,coordinates=settings.coordinates??true,ox=settings.originX||0,oy=settings.originY||0;
    target.fillStyle='#fffefa';target.fillRect(0,0,w*s+2*m,h*s+2*m);
    if(mode==='beads'){target.fillStyle='#f5f5ed';target.fillRect(m,m,w*s,h*s);}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const k=pixels[y*w+x],px=m+x*s,py=m+y*s;
      if(k<0){if(mode==='beads'&&s>=6){target.fillStyle='#d9decf';target.beginPath();target.arc(px+s/2,py+s/2,Math.max(.6,s*.065),0,Math.PI*2);target.fill();}continue;}
      const hex=palette[k].hex;target.globalAlpha=(focus&&k!==activeColor) ? 0.15 : 1;
      if(mode==='beads'){
        const r=s*.445;target.fillStyle=hex;target.beginPath();target.arc(px+s/2,py+s/2,r,0,Math.PI*2);target.fill();
        if(s>=8){target.strokeStyle='#00000013';target.lineWidth=Math.max(.5,s*.04);target.stroke();target.fillStyle='#f5f5ed';target.beginPath();target.arc(px+s/2,py+s/2,s*.13,0,Math.PI*2);target.fill();}
      }else{target.fillStyle=hex;target.fillRect(px,py,s,s);}
      if(codes&&s>=16){if(mode==='beads'){target.fillStyle=hex;target.beginPath();target.arc(px+s/2,py+s/2,s*.23,0,Math.PI*2);target.fill();}target.fillStyle=colorContrast(hex);target.font=`${Math.max(6,Math.min(11,s*.31))}px Consolas, monospace`;target.textAlign='center';target.textBaseline='middle';const code=palette[k].code;if(code.length>5&&code.includes('-')){const split=code.lastIndexOf('-')+1;target.fillText(code.slice(0,split),px+s/2,py+s*.32,s-2);target.fillText(code.slice(split),px+s/2,py+s*.68,s-2);}else target.fillText(code,px+s/2,py+s/2,s-2);}
      target.globalAlpha=1;
    }
    if(grid){target.lineWidth=.5;target.strokeStyle=mode==='beads'?'#c4cbbb65':'#34463730';target.beginPath();for(let x=0;x<=w;x++){target.moveTo(m+x*s,m);target.lineTo(m+x*s,m+h*s);}for(let y=0;y<=h;y++){target.moveTo(m,m+y*s);target.lineTo(m+w*s,m+y*s);}target.stroke();}
    if(boards){target.strokeStyle='#bd735b';target.lineWidth=1.5;target.setLineDash([5,3]);target.beginPath();for(let x=29-ox%29;x<w;x+=29){target.moveTo(m+x*s,m);target.lineTo(m+x*s,m+h*s);}for(let y=29-oy%29;y<h;y+=29){target.moveTo(m,m+y*s);target.lineTo(m+w*s,m+y*s);}target.stroke();target.setLineDash([]);}
    if(coordinates){target.fillStyle='#89937d';target.font=`${Math.max(7,Math.min(10,s*.42))}px Consolas,monospace`;target.textAlign='center';target.textBaseline='middle';const every=s<10?10:s<18?5:1;for(let x=0;x<w;x++)if(x===0||(x+ox+1)%every===0){target.fillText(String(x+ox+1),m+(x+.5)*s,m/2);target.fillText(String(x+ox+1),m+(x+.5)*s,m+h*s+m/2);}for(let y=0;y<h;y++)if(y===0||(y+oy+1)%every===0){target.fillText(String(y+oy+1),m/2,m+(y+.5)*s);target.fillText(String(y+oy+1),m+w*s+m/2,m+(y+.5)*s);}}
  }
  function renderCanvas(){
    cell=16*zoom;margin=Math.max(18,Math.min(30,cell));const w=doc.w*cell+margin*2,h=doc.h*cell+margin*2;
    // Cap backing pixels on very large zooms while keeping pointer coordinates in CSS pixels.
    const dpr=Math.min(window.devicePixelRatio||1,2,8192/Math.max(w,h),Math.sqrt(8000000/(w*h)));
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
    drawPattern(ctx,doc);
    if(selection){ctx.fillStyle='#326d5725';ctx.fillRect(margin+selection.x*cell,margin+selection.y*cell,selection.w*cell,selection.h*cell);ctx.strokeStyle='#2b624e';ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.strokeRect(margin+selection.x*cell,margin+selection.y*cell,selection.w*cell,selection.h*cell);ctx.setLineDash([]);}
    if(keyboardCell){ctx.strokeStyle='#dc8a40';ctx.lineWidth=2;ctx.strokeRect(margin+keyboardCell.x*cell+1,margin+keyboardCell.y*cell+1,cell-2,cell-2);}
    $('zoomValue').textContent=Math.round(zoom*100)+'%';$('canvasInfo').textContent=`${doc.w} × ${doc.h} 颗`;
    $('emptyNote').hidden=doc.pixels.some(v=>v>=0);$('selectionBar').hidden=!selection;if(selection)$('selectionInfo').textContent=`已选 ${selection.w} × ${selection.h} 颗`;
  }
  function renderColors(){
    const list=$('colorList'),counts=C.stats(doc),countMap=new Map(counts);$('usedCount').textContent=counts.length;$('allCount').textContent=doc.palette.length;
    $('paletteName').textContent=doc.paletteName||'自定义色板';renderBrandPicker();
    $('maxColors').max=Math.max(2,doc.palette.length);$('maxColorsValue').textContent=$('maxColors').value;
    const c=doc.palette[activeColor]||doc.palette[0];$('currentSwatch').style.setProperty('--bead-color',c.hex);$('currentColorName').textContent=c.code+' · '+c.name;$('currentColorHex').textContent=c.hex.toUpperCase();
    $('mobileSwatch').style.setProperty('--bead-color',c.hex);$('mobileColorCode').textContent=c.code;
    list.classList.toggle('full-palette',tab==='all');
    const query=$('colorSearch').value.trim().toLowerCase();
    const indices=(tab==='used'?counts.map(x=>x[0]):doc.palette.map((_,i)=>i)).filter(i=>{const c=doc.palette[i];return !query||(c.code+' '+c.name+' '+c.hex).toLowerCase().includes(query);});
    list.innerHTML=indices.map(i=>{const c=doc.palette[i],special=c.matchable===false;return tab==='used'?`<button class="color-item ${i===activeColor?'selected':''}" data-color="${i}" aria-pressed="${i===activeColor}" title="选择 ${escapeHTML(c.code+' '+c.name+(special?' · 仅手动选用':''))}"><span class="swatch" style="--bead-color:${c.hex}"></span><span>${escapeHTML(c.code)}</span><span class="color-name">${escapeHTML(c.name)}</span><span class="count">${countMap.get(i)||0} 颗</span></button>`:`<button class="palette-dot ${i===activeColor?'selected':''} ${special?'special':''}" data-color="${i}" aria-pressed="${i===activeColor}" title="${escapeHTML(c.code+' '+c.name+' '+c.hex+(special?' · 仅手动选用':''))}"><span class="swatch" style="--bead-color:${c.hex}"></span><span class="code-label">${escapeHTML(c.code)}</span></button>`;}).join('')||`<p class="empty-list">${query?'没有匹配的色号，试试「完整色板」或清空搜索':'还没有用到颜色<br>去「完整色板」选一颗喜欢的吧'}</p>`;
    $('usedTab').classList.toggle('active',tab==='used');$('allTab').classList.toggle('active',tab==='all');$('usedTab').setAttribute('aria-selected',tab==='used');$('allTab').setAttribute('aria-selected',tab==='all');
  }
  function identifyPalette(colors){return library.find(p=>p.colors.length===colors.length&&p.colors.every((c,i)=>c.code===colors[i].code&&c.hex.toUpperCase()===colors[i].hex.toUpperCase()&&(c.matchable!==false)===(colors[i].matchable!==false)))?.id||'custom';}
  function renderBrandPicker(){
    const selected=library.find(p=>p.id===doc.paletteId),groups=[...new Set(library.map(p=>p.brand))];
    $('brandPalette').innerHTML=groups.map(group=>`<optgroup label="${escapeHTML(group)}">${library.filter(p=>p.brand===group).map(p=>`<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('')}</optgroup>`).join('')+(!selected?'<option value="custom">当前项目 / 自定义色板</option>':'');
    $('brandPalette').value=selected?selected.id:'custom';
    $('paletteNotice').textContent=selected?.note||'使用项目中保存的色号与色值。可选择品牌色板重新匹配，或继续编辑当前色板。';
    $('paletteNotice').classList.toggle('legacy-notice',doc.paletteId==='studio-legacy');
  }
  function switchPalette(id){
    const next=library.find(p=>p.id===id);if(!next||next.id===doc.paletteId)return;
    try{const remapped=C.remapPalette(doc,next.colors),oldHex=doc.palette[activeColor].hex;
      mutate(()=>{Object.assign(doc,remapped,{paletteId:next.id,paletteName:next.name});activeColor=C.nearest(C.lab(...C.rgb(oldHex)),doc.palette.map(c=>C.lab(...C.rgb(c.hex))),doc.palette.map((_,i)=>i).filter(i=>doc.palette[i].matchable!==false));$('colorSearch').value='';});
      toast('已切换到 '+next.name+'，图纸已重新匹配，可撤销');
    }catch(e){toast(e.message);renderBrandPicker();}
  }
  function paletteLibrary(){dialog('选择你的拼豆色板',`<p>先选手中豆子的品牌与系列。切换会保留图形，重新匹配用色；可以撤销。每套色板都已内置，离线可用。</p><div class="palette-library">${library.map(p=>`<button class="palette-card ${doc.paletteId===p.id?'selected':''}" data-palette-id="${p.id}"><strong>${escapeHTML(p.name)}</strong><span class="mini-swatches">${Array.from({length:8},(_,i)=>p.colors[Math.floor(i*(p.colors.length-1)/7)]).map(c=>`<i style="background:${c.hex}"></i>`).join('')}</span><small>${escapeHTML(p.note)}</small></button>`).join('')}</div>`);$('dialogBody').querySelectorAll('[data-palette-id]').forEach(button=>button.onclick=()=>{switchPalette(button.dataset.paletteId);closeDialog();});}
  function paletteSources(){const p=library.find(p=>p.id===doc.paletteId);dialog('色板来源与使用说明',`<p><strong>${escapeHTML(doc.paletteName)}</strong><br>${escapeHTML(p?.note||'用户导入或编辑的色板')}</p><p>色号按对应品牌数据展示，RGB / HEX 是屏幕参考值，不能保证实物批次完全一致。已标记的特殊材质仅供手动选用；它们的透光或珠光效果不能由单个屏幕色值还原。</p>${p?.source?`<p><a class="source-link" href="${escapeHTML(p.source)}" target="_blank" rel="noopener noreferrer">查看固定版本的数据来源 ↗</a></p>`:''}<p>Hama 使用品牌数字色号（如 01）；Perler 使用来源中的完整商品编号（如 80-19001）。盼盼与咪小窝各排除了 4 个无法确认的色号。旧版 D 色板只用于兼容旧项目。</p><details><summary>开源数据许可 · MIT</summary><pre class="license-notice">${escapeHTML(catalog.licenses)}</pre></details>`);}
  function materials(){const counts=C.stats(doc),total=counts.reduce((n,[,v])=>n+v,0),spare=C.clamp(Number($('sparePercent').value)||0,0,100),unit=C.clamp(Number($('unitPrice').value)||0,0,100),size=Number($('beadSize').value)||5;const prepared=counts.reduce((n,[,v])=>n+Math.ceil(v*(1+spare/100)),0);return {counts,total,spare,unit,size,prepared};}
  function renderStats(){const {counts,total,size,prepared,unit}=materials();$('totalBeads').textContent=total.toLocaleString();$('totalColors').textContent=counts.length;$('physicalSize').textContent=`${+(doc.w*size/10).toFixed(2)} × ${+(doc.h*size/10).toFixed(2)} cm`;$('boardCount').textContent=`${Math.ceil(doc.w/29)*Math.ceil(doc.h/29)} 块`;$('withSpare').textContent=prepared.toLocaleString()+' 颗';$('cost').textContent='¥'+(prepared*unit).toFixed(2);}
  function renderAll(){renderCanvas();renderColors();renderStats();$('undoBtn').disabled=!undoStack.length;$('redoBtn').disabled=!redoStack.length;}
  function fitCanvas(){const availableW=Math.max(140,stage.clientWidth-90),availableH=Math.max(180,stage.clientHeight-90);zoom=C.clamp(Math.min(availableW/(doc.w*16),availableH/(doc.h*16)),.15,4);renderCanvas();stage.scrollLeft=0;stage.scrollTop=0;}
  function setZoom(next,point){const old=zoom;const center=point||{x:stage.clientWidth/2,y:stage.clientHeight/2};const x=stage.scrollLeft+center.x,y=stage.scrollTop+center.y;zoom=C.clamp(next,.15,4);renderCanvas();stage.scrollLeft=x*zoom/old-center.x;stage.scrollTop=y*zoom/old-center.y;}
  function setTool(next){tool=next;keyboardCell=null;document.querySelectorAll('[data-tool]').forEach(el=>{el.classList.toggle('active',el.dataset.tool===tool);el.setAttribute('aria-pressed',el.dataset.tool===tool);});const hints={brush:'拖动画笔，给每一颗豆子一点颜色',eraser:'点击或拖动擦除，留下透明的空格',fill:'点击一个区域，替换相邻的同色豆子',picker:'点击图纸上的豆子，拾取它的颜色',select:'拖出一个选区，可填色、擦除或批量换色',pan:matchMedia('(pointer:coarse)').matches?'单指拖动看图，双指缩放；看图模式不落笔':'按住拖动查看图纸，也可随时按住空格'};$('toolHint').textContent=hints[tool]+(tool!=='pan'&&matchMedia('(pointer:coarse)').matches?' · 双指缩放 / 移动':'');canvas.style.cursor=tool==='pan'?'grab':'crosshair';renderCanvas();}
  function paint(p){const size=Number($('brushSize').value),r=Math.floor(size/2),color=tool==='eraser'?-1:activeColor;for(let y=p.y-r;y<=p.y+r;y++)for(let x=p.x-r;x<=p.x+r;x++)if(x>=0&&y>=0&&x<doc.w&&y<doc.h)doc.pixels[y*doc.w+x]=color;}
  function pointerDown(e){if(e.button!==0&&e.button!==1)return;e.preventDefault();canvas.focus({preventScroll:true});keyboardCell=null;const p=pixelCoordinates(e);if(reading||tool==='pan'||spaceHeld||e.button===1){pointer={pan:true,x:e.clientX,y:e.clientY,left:stage.scrollLeft,top:stage.scrollTop};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';return;}if(!inside(p))return;
    canvas.setPointerCapture(e.pointerId);
    if(tool==='picker'){const k=doc.pixels[p.y*doc.w+p.x];if(k>=0){activeColor=k;renderColors();if(highlight)renderCanvas();}else toast('这里是空白格');return;}
    if(tool==='select'){selection={x:p.x,y:p.y,w:1,h:1};pointer={start:p,select:true};renderCanvas();return;}
    selection=null;pushUndo();if(tool==='fill'){C.fill(doc.pixels,doc.w,doc.h,p.x,p.y,activeColor);commit();return;}
    pointer={last:p,painting:true};paint(p);renderCanvas();
  }
  function pointerMove(e){const p=pixelCoordinates(e);if(inside(p)){$('cursorInfo').textContent=`列 ${p.x+1} · 行 ${p.y+1}`;}else $('cursorInfo').textContent='从一颗开始';
    if(!pointer)return;if(pointer.pan){stage.scrollLeft=pointer.left-(e.clientX-pointer.x);stage.scrollTop=pointer.top-(e.clientY-pointer.y);return;}
    const q={x:C.clamp(p.x,0,doc.w-1),y:C.clamp(p.y,0,doc.h-1)};
    if(pointer.select){selection={x:Math.min(q.x,pointer.start.x),y:Math.min(q.y,pointer.start.y),w:Math.abs(q.x-pointer.start.x)+1,h:Math.abs(q.y-pointer.start.y)+1};renderCanvas();}
    if(pointer.painting){C.line(pointer.last.x,pointer.last.y,q.x,q.y,(x,y)=>paint({x,y}));pointer.last=q;renderCanvas();}
  }
  function pointerEnd(){if(!pointer)return;const painting=pointer.painting;pointer=null;canvas.style.cursor=tool==='pan'?'grab':'crosshair';if(painting)commit();}
  canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);canvas.addEventListener('lostpointercapture',pointerEnd);
  let touchBefore=null,reading=false;
  window.BeadTouch.attach(stage,{
    start(e){touchBefore={doc:snapshot(),undo:undoStack.slice(),redo:redoStack.slice(),selection:selection?{...selection}:null,activeColor,isDirty};pointerDown(e);},
    move:pointerMove,end(){pointerEnd();touchBefore=null;},
    cancel(){pointer=null;if(touchBefore){doc=touchBefore.doc;undoStack=touchBefore.undo;redoStack=touchBefore.redo;selection=touchBefore.selection;activeColor=touchBefore.activeColor;isDirty=touchBefore.isDirty;touchBefore=null;renderAll();scheduleSave();}},
    anchor(p){const r=canvas.getBoundingClientRect();return {zoom,x:(p.x-r.left-margin)/cell,y:(p.y-r.top-margin)/cell};},
    transform(a,scale,p){zoom=C.clamp(a.zoom*scale,.15,4);renderCanvas();const r=canvas.getBoundingClientRect();stage.scrollLeft+=r.left+margin+a.x*cell-p.x;stage.scrollTop+=r.top+margin+a.y*cell-p.y;}
  });
  $('mobileReadBtn').onclick=()=>{reading=!reading;$('mobileReadBtn').setAttribute('aria-pressed',reading);$('mobileReadBtn').textContent=reading?'继续编辑':'看图模式';document.querySelectorAll('[data-tool]').forEach(el=>el.disabled=reading);setTool(reading?'pan':'brush');if(reading){view='pattern';$('showCodes').checked=true;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',b.dataset.view===view);});renderCanvas();toast('看图模式：单指移动、双指缩放，不会改动豆子');}};
  window.addEventListener('blur',()=>{spaceHeld=false;pointerEnd();});
  stage.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();const r=stage.getBoundingClientRect();setZoom(zoom*(e.deltaY<0?1.12:1/1.12),{x:e.clientX-r.left,y:e.clientY-r.top});}},{passive:false});
  function selectionAction(color){if(!selection)return;const s={...selection};mutate(()=>{for(let y=s.y;y<s.y+s.h;y++)for(let x=s.x;x<s.x+s.w;x++)doc.pixels[y*doc.w+x]=color;});}
  $('fillSelectionBtn').onclick=()=>selectionAction(activeColor);$('eraseSelectionBtn').onclick=()=>selectionAction(-1);$('cancelSelectionBtn').onclick=()=>{selection=null;renderCanvas();};
  function imageFromURL(url){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('无法读取图片，请尝试 PNG、JPG 或 WebP'));image.src=url;});}
  function installSource(image,data){source=image;sourceData=data;$('sourcePreview').src=data;$('sourcePreview').style.imageRendering=image.width<=160&&image.height<=160?'pixelated':'auto';$('sourcePreview').hidden=false;$('uploadPrompt').hidden=true;$('imageLabel').hidden=false;updateGenerationHint();}
  function updateGenerationHint(){$('generationHint').textContent=source?'参数调整后点击生成 · 重新生成可撤销':'先上传图片，或使用示例开始创作';}
  async function loadImage(file){
    if(!file)return;if(file.size>20*1024*1024){toast('图片不能超过 20 MB');return;}if(!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)){toast('请选择 PNG、JPG、WebP、GIF 或 BMP 图片');return;}
    const ticket=++imageLoadId,url=URL.createObjectURL(file);
    try{const image=await imageFromURL(url);if(ticket!==imageLoadId)return;
      if(image.width*image.height>60000000)throw Error('图片像素过大，请先缩小到 6000 万像素以内');
      const scale=Math.min(1,1400/Math.max(image.width,image.height)),temp=document.createElement('canvas');temp.width=Math.max(1,Math.round(image.width*scale));temp.height=Math.max(1,Math.round(image.height*scale));temp.getContext('2d').drawImage(image,0,0,temp.width,temp.height);
      const data=temp.toDataURL('image/png'),normalized=await imageFromURL(data);if(ticket!==imageLoadId)return;
      installSource(normalized,data);doc.name=file.name.replace(/\.[^.]+$/,'').slice(0,40)||'我的拼豆作品';$('projectName').value=doc.name;
      if($('lockRatio').checked){const w=Number($('gridWidth').value)||48;$('gridHeight').value=C.clamp(Math.round(w*image.height/image.width),1,160);}
      scheduleSave();toast('图片已就位，调好参数后点击「生成拼豆图纸」');
    }catch(e){toast(e.message);}finally{URL.revokeObjectURL(url);}
  }
  function sampleImage(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d',{willReadFrequently:true}),o=getOptions();g.imageSmoothingEnabled=o.smooth;g.imageSmoothingQuality='high';const iw=source.width,ih=source.height;
    if(o.imageFit==='stretch')g.drawImage(source,0,0,w,h);
    else if(o.imageFit==='cover'){const scale=Math.max(w/iw,h/ih),sw=w/scale,sh=h/scale,sx=(iw-sw)*o.cropX/100,sy=(ih-sh)*o.cropY/100;g.drawImage(source,sx,sy,sw,sh,0,0,w,h);}
    else{const scale=Math.min(w/iw,h/ih),dw=iw*scale,dh=ih*scale;g.drawImage(source,(w-dw)/2,(h-dh)/2,dw,dh);}
    return g.getImageData(0,0,w,h).data;
  }
  async function generate(){if(generationBusy)return;if(!source){toast('先放进一张图片，或选择一个示例');return;}const size=readSize();if(!size)return;
    generationBusy=true;$('generateBtn').disabled=true;$('generateBtn').textContent='正在配色…';
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,25)));
    try{const pixels=C.quantize(sampleImage(size.w,size.h),size.w,size.h,doc.palette,getOptions());mutate(()=>Object.assign(doc,{...size,pixels}));window.dispatchEvent(new CustomEvent('bead:navigate',{detail:'edit'}));fitCanvas();toast(`图纸生成好了 · ${C.stats(doc).length} 色 · 可逐颗修改`);}catch(e){toast('生成失败：'+e.message);}finally{generationBusy=false;$('generateBtn').disabled=false;$('generateBtn').textContent='✧ 生成拼豆图纸';}
  }
  function makeExample(kind){
    const w=32,h=32,pixels=Array(w*h).fill(-1),P=C.palette;
    const p=(x,y,k)=>{if(x>=0&&x<w&&y>=0&&y<h)pixels[y*w+x]=k;};
    const rect=(x,y,ww,hh,k)=>{for(let j=y;j<y+hh;j++)for(let i=x;i<x+ww;i++)p(i,j,k);};
    const ellipse=(cx,cy,rx,ry,k)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)p(x,y,k);};
    let name='窗边的小花';
    if(kind==='flower'){
      rect(15,14,2,11,28);C.line(15,22,10,18,(x,y)=>{p(x,y,27);p(x+1,y,27);});ellipse(10,18,4,2,26);ellipse(20,21,4,2,27);rect(16,20,4,2,28);
      ellipse(12,8,3.5,3.5,12);ellipse(18,7,3.5,3.5,12);ellipse(21,12,3.5,3.5,13);ellipse(18,16,3.5,3.5,12);ellipse(12,15,3.5,3.5,13);ellipse(9,11,3.5,3.5,12);ellipse(15,11,4,4,8);ellipse(15,10,2.5,2.5,7);p(14,10,10);p(17,10,10);p(15,12,10);p(16,12,10);
      rect(10,24,13,2,22);rect(11,26,11,4,21);rect(12,30,9,1,22);rect(12,26,2,3,20);rect(21,26,1,3,22);
      p(5,7,8);p(4,6,8);p(25,16,25);p(26,15,25);p(27,16,25);p(26,17,25);
    }else if(kind==='cherry'){
      name='夏日樱桃';C.line(17,5,10,18,(x,y)=>{p(x,y,28);p(x+1,y,28);});C.line(17,5,23,19,(x,y)=>{p(x,y,28);p(x+1,y,28);});ellipse(21,6,5,2,26);ellipse(9,22,6,6,18);ellipse(23,23,6,6,18);ellipse(8,20,4,3,17);ellipse(22,21,4,3,17);rect(6,18,2,3,12);rect(20,19,2,3,12);p(8,27,19);p(9,27,19);p(23,28,19);p(24,28,19);
    }else{
      name='午后的小猫';rect(6,5,6,8,10);rect(20,5,6,8,10);rect(8,7,3,5,12);rect(21,7,3,5,12);ellipse(16,17,12,10,10);ellipse(16,18,10,8,6);rect(5,13,4,3,10);rect(23,13,4,3,10);rect(11,14,2,3,5);rect(20,14,2,3,5);p(11,14,1);p(20,14,1);rect(15,18,3,2,16);p(16,20,10);p(15,21,10);p(17,21,10);rect(7,19,3,2,12);rect(23,19,3,2,12);rect(10,26,5,3,10);rect(19,26,5,3,10);
    }
    const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');pixels.forEach((k,i)=>{if(k>=0){g.fillStyle=P[k].hex;g.fillRect(i%w,Math.floor(i/w),1,1);}});
    return {w,h,pixels,name,data:c.toDataURL('image/png')};
  }
  async function useExample(kind,initial=false){const ex=makeExample(kind),ticket=++imageLoadId;const im=await imageFromURL(ex.data);if(ticket!==imageLoadId)return;if(!initial)pushUndo();const converted=C.remapPalette({w:32,h:32,pixels:ex.pixels,palette:C.palette},doc.palette);doc={...doc,...converted,name:ex.name};source=im;sourceData=ex.data;installSource(im,ex.data);activeColor=C.stats(doc)[0]?.[0]||0;selection=null;$('colorSearch').value='';setOptions({...defaultOptions,smooth:false});syncDimensions();$('projectName').value=doc.name;renderAll();fitCanvas();isDirty=!initial;if(!initial)scheduleSave();}
  function clearSource(){++imageLoadId;source=null;sourceData=null;$('sourcePreview').hidden=true;$('sourcePreview').removeAttribute('src');$('uploadPrompt').hidden=false;$('imageLabel').hidden=true;updateGenerationHint();}
  function newBlank(){const size=readSize();if(!size)return;confirmChange('开始一张空白图纸',`创建 ${size.w} × ${size.h} 的空白画布。当前图纸可以通过撤销找回。`,()=>{pushUndo();doc={...doc,...size,pixels:Array(size.w*size.h).fill(-1),name:'我的拼豆作品'};$('projectName').value=doc.name;clearSource();tab='all';commit();fitCanvas();},'创建空白');}
  function openResize(){const s=readSize();if(!s)return;dialog('调整当前图纸尺寸',`<p>将 ${doc.w} × ${doc.h} 调整为 ${s.w} × ${s.h} 颗。这会直接处理现有豆子，可撤销。</p><label>调整方式<select id="resizeMode"><option value="canvas">扩展 / 裁剪画布（左上对齐，不缩放）</option><option value="scale">缩放图案（最近邻，保留色号）</option></select></label><div class="dialog-actions"><button class="primary-btn" id="doResize">应用尺寸</button></div>`);$('doResize').onclick=()=>{const scale=$('resizeMode').value==='scale';mutate(()=>Object.assign(doc,C.resize(doc,s.w,s.h,scale)));syncDimensions();fitCanvas();closeDialog();};}
  function paletteOptions(selected,empty=false){return (empty?'<option value="-1">空白 · 移除豆子</option>':'')+doc.palette.map((c,i)=>`<option value="${i}" ${i===selected?'selected':''}>${escapeHTML(c.code+' · '+c.name+' '+c.hex)}</option>`).join('');}
  function openReplace(){const scope=selection?{...selection}:null;dialog('把一种颜色，换成另一种',`<p>替换${scope?'框选区域内':'整张图纸中'}所有相同色号的豆子。只影响图纸，随时可以撤销。</p><label>原来的颜色<select id="replaceFrom">${paletteOptions(activeColor)}</select></label><label>换成<select id="replaceTo">${paletteOptions(activeColor,true)}</select></label><div class="dialog-actions"><button class="outline-btn" id="swapColors">双向互换</button><button class="primary-btn" id="doReplace">替换颜色</button></div>`);
    const replace=swap=>{const from=Number($('replaceFrom').value),to=Number($('replaceTo').value);if(from===to){toast('请选择一个不同的目标颜色');return;}if(swap&&to<0){toast('空白格不参与双向互换，请使用替换');return;}let count=0;mutate(()=>{doc.pixels=doc.pixels.map((v,i)=>{const x=i%doc.w,y=Math.floor(i/doc.w);if(scope&&(x<scope.x||x>=scope.x+scope.w||y<scope.y||y>=scope.y+scope.h))return v;if(v===from){count++;return to;}if(swap&&v===to){count++;return from;}return v;});});if(to>=0)activeColor=to;renderColors();closeDialog();toast(`已修改 ${count} 颗豆子`);};$('doReplace').onclick=()=>replace(false);$('swapColors').onclick=()=>replace(true);
  }
  function customColor(){if(doc.palette.length>=1024){toast('色板最多支持 1024 色');return;}dialog('加入自己的颜色',`<p>填入实际豆子的色号，或者为新颜色起一个名字。添加后将成为自定义色板。</p><label>色号<input id="newColorCode" maxlength="16" value="CUSTOM${doc.palette.length+1}"></label><label>颜色名称<input id="newColorName" maxlength="60" value="我的颜色"></label><label>色值<input id="newColorHex" type="color" value="#f3a6a2"></label><div class="dialog-actions"><button class="primary-btn" id="addColor">加入色板</button></div>`);$('addColor').onclick=()=>{const c={code:$('newColorCode').value.trim(),name:$('newColorName').value.trim(),hex:$('newColorHex').value};try{C.validatePalette([...doc.palette,c]);}catch(e){toast(e.message);return;}mutate(()=>{doc.palette.push(c);doc.paletteId='custom';doc.paletteName='自定义 · '+doc.palette.length+' 色';activeColor=doc.palette.length-1;tab='all';$('colorSearch').value='';});closeDialog();};}
  async function importPalette(file){if(!file)return;try{if(file.size>500000)throw Error('色板文件过大');const data=JSON.parse(await file.text()),p=C.validatePalette(Array.isArray(data)?data:data.colors);confirmChange('使用新的色板',`共 ${p.length} 色。当前图纸将按最接近的颜色重新匹配，仍可撤销。`,()=>{try{const remapped=C.remapPalette(doc,p);mutate(()=>{Object.assign(doc,remapped);doc.paletteId=identifyPalette(doc.palette);doc.paletteName=library.find(b=>b.id===doc.paletteId)?.name||String(data.name||'导入色板').slice(0,40);activeColor=0;$('colorSearch').value='';});toast('色板已导入');}catch(e){toast(e.message);}},'应用色板');}catch(e){toast('导入失败：'+e.message);}}
  async function restoreProject(p){C.validateProject(p);const ticket=++imageLoadId;let im=null;if(p.source){im=await imageFromURL(p.source);}if(ticket!==imageLoadId)return;
    pushUndo();const paletteId=identifyPalette(p.palette);doc={w:p.w,h:p.h,pixels:p.pixels.slice(),palette:C.copyPalette(p.palette),name:String(p.name||'我的拼豆作品').slice(0,40),paletteName:library.find(b=>b.id===paletteId)?.name||String(p.paletteName||'自定义色板').slice(0,40),paletteId};$('colorSearch').value='';
    if(im)installSource(im,p.source);else clearSource();activeColor=0;selection=null;setOptions(p.options);syncDimensions();$('projectName').value=doc.name;
    if(p.materials){if([2.6,3,5].includes(p.materials.beadSize))$('beadSize').value=p.materials.beadSize;$('sparePercent').value=C.clamp(Number(p.materials.sparePercent)||0,0,100);$('unitPrice').value=C.clamp(Number(p.materials.unitPrice)||0,0,100);}
    renderAll();fitCanvas();scheduleSave();
  }
  async function importProject(file){if(!file)return;try{if(file.size>20*1024*1024)throw Error('项目文件不能超过 20 MB');const p=C.validateProject(JSON.parse(await file.text()));confirmChange('打开保存的作品',`打开「${String(p.name||'我的拼豆作品').slice(0,40)}」，${p.w} × ${p.h} 颗。当前图纸可通过撤销找回。`,()=>restoreProject(p).then(()=>toast('项目已打开')).catch(e=>toast(e.message)),'打开项目');}catch(e){toast('项目读取失败：'+e.message);}}
  function download(blob,name){
    if(window.DouyuAndroid){
      const reader=new FileReader();
      reader.onload=()=>window.DouyuAndroid.save(name,String(reader.result).split(',',2)[1]);
      reader.onerror=()=>toast('无法读取导出文件，请重试');
      reader.readAsDataURL(blob);
      return;
    }
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  function downloadJSON(value,name){download(new Blob([JSON.stringify(value,null,2)],{type:'application/json;charset=utf-8'}),name);}
  function exportProject(){downloadJSON(project(),cleanName()+'.beads.json');persist();if(!window.DouyuAndroid)toast('项目已导出，包含图纸、色板、原图和参数');}
  function csvCell(value){const s=String(value);return '"'+(/^[=+@\-\t\r]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';}
  function exportCSV(){const {counts,spare,unit}=materials();const rows=[['品牌色板','色号','颜色名称','HEX','材质备注','图纸用量','含备损备豆量','单价（元）','备豆估算（元）']];for(const [k,n] of counts){const c=doc.palette[k],prepared=Math.ceil(n*(1+spare/100));rows.push([doc.paletteName,c.code,c.name,c.hex,c.finish||'',n,prepared,unit,(prepared*unit).toFixed(2)]);}download(new Blob(['\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),cleanName()+'-用豆清单.csv');toast('用豆清单已导出');}
  function canvasBlob(c,name){return new Promise(resolve=>c.toBlob(blob=>{
    if(!blob){toast('图片导出失败，请尝试较小的图纸');resolve();return;}
    if(window.DouyuAndroid){download(blob,name);resolve();return;}
    if(!matchMedia('(max-width:680px), (pointer:coarse)').matches){download(blob,name);toast('图片已导出');resolve();return;}
    if(exportedImageURL)URL.revokeObjectURL(exportedImageURL);exportedImageURL=URL.createObjectURL(blob);
    dialog('图纸已准备好',`<p>可长按下方图片保存，或使用「分享图片」。如果微信里无法保存，请用系统浏览器打开此网页后重试。</p><img id="exportImagePreview" class="export-image-preview" alt="可长按保存的拼豆图纸"><div class="dialog-actions"><button id="downloadImageBtn" class="outline-btn">下载图片</button><button id="shareImageBtn" class="primary-btn">分享图片</button></div><p>图片是查看用的；想继续编辑，请另外保存项目。</p>`);
    $('exportImagePreview').src=exportedImageURL;$('downloadImageBtn').onclick=()=>download(blob,name);
    const file=new File([blob],name,{type:'image/png'}),supported=navigator.canShare&&navigator.canShare({files:[file]});
    $('shareImageBtn').hidden=!supported;
    if(supported)$('shareImageBtn').onclick=async()=>{try{await navigator.share({files:[file],title:doc.name});}catch(e){if(e.name!=='AbortError')toast('分享不可用，可长按图片或点击下载');}};
    resolve();
  },'image/png'));}
  function exportPNG(pattern=true){
    const s=pattern?26:22,m=pattern?30:18,counts=C.stats(doc),cols=Math.max(1,Math.floor((doc.w*s+2*m)/170)),legendRows=Math.ceil(counts.length/cols),head=pattern?92:0,foot=pattern?65+legendRows*29:0;
    const c=document.createElement('canvas'),logicalW=Math.max(doc.w*s+2*m,pattern?520:1),logicalH=doc.h*s+2*m+head+foot;
    const exportScale=Math.min(1,Math.sqrt(12000000/(logicalW*logicalH)));c.width=Math.floor(logicalW*exportScale);c.height=Math.floor(logicalH*exportScale);const g=c.getContext('2d');g.scale(exportScale,exportScale);g.fillStyle='#fffefa';g.fillRect(0,0,logicalW,logicalH);
    const offset=(logicalW-doc.w*s-2*m)/2;
    if(pattern){g.fillStyle='#2b624e';g.font='bold 23px "Microsoft YaHei",sans-serif';g.fillText(doc.name,25,34,logicalW-50);g.font='12px "Microsoft YaHei",sans-serif';g.fillStyle='#788675';g.fillText(`${doc.w} × ${doc.h} 颗  ·  ${materials().total} 颗豆子  ·  ${counts.length} 色  ·  ${$('physicalSize').textContent}`,25,59);g.fillText('色板：'+doc.paletteName+' / 色号请对应实物核对',25,79,logicalW-50);}
    g.save();g.translate(offset,head);drawPattern(g,doc,{cell:s,margin:m,mode:pattern?'pattern':'beads',grid:pattern,codes:pattern,boards:pattern,focus:false,coordinates:pattern});g.restore();
    if(pattern){const ly=head+doc.h*s+2*m+24;g.fillStyle='#6f7d69';g.font='12px "Microsoft YaHei",sans-serif';g.fillText('用色清单 · 数量为图纸实际用量，不含备损',25,ly);counts.forEach(([k,n],i)=>{const c=doc.palette[k],x=25+(i%cols)*170,y=ly+23+Math.floor(i/cols)*29;g.fillStyle=c.hex;g.fillRect(x,y-11,15,15);g.strokeStyle='#0002';g.strokeRect(x,y-11,15,15);g.fillStyle='#354b3e';g.font='11px "Microsoft YaHei",sans-serif';g.fillText(`${c.code} ${c.name} · ${n}`,x+22,y+1,143);});}
    canvasBlob(c,cleanName()+(pattern?'-施工图纸':'-豆子预览')+'.png');
  }
  function printPattern(){
    const area=$('printArea'),{counts,total,spare}=materials();area.replaceChildren();
    const cover=document.createElement('section');cover.className='print-page';cover.innerHTML=`<h1>${escapeHTML(doc.name)}</h1><p>豆屿 · 拼豆施工图<br>${doc.w} × ${doc.h} 颗 · ${total} 颗 · ${counts.length} 色 · ${escapeHTML($('physicalSize').textContent)}<br>每页一块 29 × 29 拼板，按列、行坐标拼接。打印对话框可选择「另存为 PDF」。<br>图纸格子不代表实物尺寸；请按编号数格拼豆。</p><div class="print-legend">${counts.map(([k,n])=>{const c=doc.palette[k];return `<div><i style="background:${c.hex}"></i><span>${escapeHTML(c.code+' '+c.name)}<br>${n} 颗 / 备 ${Math.ceil(n*(1+spare/100))}</span></div>`;}).join('')}</div><footer>色板：${escapeHTML(doc.paletteName)}。请按此品牌与系列核对色号；屏幕色值为参考，成品颜色以实物为准。</footer>`;area.appendChild(cover);
    for(let by=0;by<Math.ceil(doc.h/29);by++)for(let bx=0;bx<Math.ceil(doc.w/29);bx++){
      const x0=bx*29,y0=by*29,w=Math.min(29,doc.w-x0),h=Math.min(29,doc.h-y0),pixels=[];for(let y=y0;y<y0+h;y++)pixels.push(...doc.pixels.slice(y*doc.w+x0,y*doc.w+x0+w));
      const c=document.createElement('canvas');c.width=29*30+60;c.height=29*30+60;const g=c.getContext('2d');g.fillStyle='#fffefa';g.fillRect(0,0,c.width,c.height);drawPattern(g,{w,h,pixels,palette:doc.palette},{cell:30,margin:30,mode:'pattern',grid:true,codes:true,boards:false,focus:false,originX:x0,originY:y0});
      const page=document.createElement('section');page.className='print-page';page.innerHTML=`<h1>${escapeHTML(doc.name)} · 拼板 ${by+1}-${bx+1}</h1><p>第 ${x0+1}–${x0+w} 列 / 第 ${y0+1}–${y0+h} 行　·　${pixels.filter(k=>k>=0).length} 颗</p>`;const im=new Image();im.src=c.toDataURL('image/png');page.appendChild(im);area.appendChild(page);
    }
    closeDialog();Promise.all([...area.querySelectorAll('img')].map(im=>im.decode().catch(()=>{}))).then(()=>{
      if(window.DouyuAndroid)window.DouyuAndroid.print();
      else window.print();
    });
  }
  function openExport(){dialog('把喜欢，带到手边',`<p>保存可编辑项目，下次还能接着拼。施工图自带坐标、色号与用豆清单。</p><div class="export-options"><button class="export-option" id="pngExport"><span>▦</span><span><strong>高清施工图 PNG</strong><small>色号 + 坐标 + 29 颗分板线 + 用色清单</small></span></button><button class="export-option" id="previewExport"><span>◉</span><span><strong>豆子效果预览 PNG</strong><small>圆豆效果，适合留念与分享</small></span></button><button class="export-option" id="printExport"><span>▤</span><span><strong>分板打印 / 存为 PDF</strong><small>每页 29 × 29 颗，大作品也能看清每一格</small></span></button><button class="export-option" id="jsonExport"><span>↧</span><span><strong>可编辑项目 .beads.json</strong><small>包含原图、图纸、色板与生成参数</small></span></button></div>`);$('pngExport').onclick=()=>exportPNG(true);$('previewExport').onclick=()=>exportPNG(false);$('printExport').onclick=printPattern;$('jsonExport').onclick=exportProject;}
  function help(){dialog('开始你的小小创作',`<dl class="help-list"><dt>01 · 生成</dt><dd>上传、拖入或粘贴图片；设定宽高和最多用色，调节亮度等参数后点击生成。透明区保留为空格；去白底只移除与边缘连通的白色。</dd><dt>02 · 编辑</dt><dd>B 画笔 / E 擦除 / F 填色 / I 取色 / S 框选 / H 移动。按住拖动可连续绘制；框选后可填色、清空或局部换色。</dd><dt>03 · 换色</dt><dd>右侧选色，再用画笔修改。批量换色可替换整张图纸或选区中的同色豆子，也可双向交换两色。</dd><dt>04 · 检查</dt><dd>切换图纸查看色号，放大到每格至少 16 像素显示编号。「定位当前色」淡化其他颜色，方便点数。分板线每 29 颗一条。</dd><dt>05 · 保存</dt><dd>Ctrl + S 保存项目，Ctrl + O 打开项目。浏览器自动保存最近作品；跨设备、清缓存前请导出项目备份。</dd><dt>常用操作</dt><dd>Ctrl + Z 撤销 / Ctrl + Shift + Z 重做；Ctrl + 滚轮缩放；空格拖动画布；Esc 取消选区。画布聚焦时方向键移动，回车落笔。</dd></dl><p class="help-note">图纸尺寸支持 1–160 颗。调整图片参数后需重新生成，会覆盖手动编辑，但可撤销。右侧可选择 8 个品牌的 12 套色板，并按色号搜索。切换品牌会重配当前图纸颜色，可撤销；旧版 D 色板保留用于兼容。成品尺寸为估算，不含熨烫变化。</p>`);}
  // Controls and import surfaces.
  $('uploadBtn').onclick=()=>$('imageInput').click();$('imageInput').onchange=e=>{loadImage(e.target.files[0]);e.target.value='';};
  for(const el of [$('uploadBtn'),stage]){el.addEventListener('dragover',e=>{e.preventDefault();$('uploadBtn').classList.add('dragover');});el.addEventListener('dragleave',()=>$('uploadBtn').classList.remove('dragover'));el.addEventListener('drop',e=>{e.preventDefault();$('uploadBtn').classList.remove('dragover');const f=e.dataTransfer.files[0];if(f?.name.endsWith('.json'))importProject(f);else loadImage(f);});}
  window.addEventListener('paste',e=>{if($('dialog').open||/INPUT|TEXTAREA/.test(e.target.tagName))return;const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();loadImage(item.getAsFile());}});
  document.querySelectorAll('[data-example]').forEach(el=>el.onclick=()=>confirmChange('载入灵感示例','示例会替换当前图纸与原图，当前图纸可撤销找回。',()=>useExample(el.dataset.example),'载入示例'));
  $('blankBtn').onclick=newBlank;$('generateBtn').onclick=()=>{if(isDirty&&source)confirmChange('重新生成图纸','将按左侧参数重新生成，覆盖当前手动编辑。生成后可撤销找回。',generate,'生成图纸');else generate();};
  $('gridWidth').addEventListener('input',()=>{const value=Number($('gridWidth').value);if($('lockRatio').checked&&value>0){const ratio=source?source.height/source.width:doc.h/doc.w;$('gridHeight').value=C.clamp(Math.round(value*ratio),1,160);}});
  $('gridHeight').addEventListener('input',()=>{const value=Number($('gridHeight').value);if($('lockRatio').checked&&value>0){const ratio=source?source.width/source.height:doc.w/doc.h;$('gridWidth').value=C.clamp(Math.round(value*ratio),1,160);}});
  document.querySelectorAll('[data-size]').forEach(el=>el.onclick=()=>{$('gridWidth').value=el.dataset.size;$('gridHeight').value=el.dataset.size;$('lockRatio').checked=false;toast('尺寸已设定，点击生成或「调整画布」应用');});
  for(const key of Object.keys(defaultOptions)){$(key).addEventListener('input',()=>{if($(key+'Value'))$(key+'Value').textContent=$(key).value;if(key==='imageFit')$('cropOptions').hidden=$(key).value!=='cover';if(key==='removeWhite')$('whiteOptions').hidden=!$(key).checked;scheduleSave();});}
  $('resetAdjustBtn').onclick=()=>{const o=getOptions();setOptions({...defaultOptions,maxColors:o.maxColors,imageFit:o.imageFit});scheduleSave();toast('调节已重置，点击生成后应用');};
  $('resizeBtn').onclick=openResize;document.querySelectorAll('[data-tool]').forEach(el=>el.onclick=()=>setTool(el.dataset.tool));
  $('undoBtn').onclick=()=>history('undo');$('redoBtn').onclick=()=>history('redo');
  document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>{view=el.dataset.view;document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b===el);b.setAttribute('aria-pressed',b===el);});if(view==='pattern')$('showCodes').checked=true;renderCanvas();});
  ['showGrid','showCodes','showBoards'].forEach(id=>$(id).onchange=renderCanvas);
  for(const [id,kind] of [['flipHBtn','horizontal'],['flipVBtn','vertical'],['rotateBtn','rotate']])$(id).onclick=()=>{mutate(()=>Object.assign(doc,C.transform(doc,kind)));syncDimensions();fitCanvas();};
  $('trimBtn').onclick=()=>{mutate(()=>Object.assign(doc,C.trim(doc)));syncDimensions();fitCanvas();toast('已裁掉外围空白');};
  $('zoomInBtn').onclick=()=>setZoom(zoom*1.25);$('zoomOutBtn').onclick=()=>setZoom(zoom/1.25);$('fitBtn').onclick=fitCanvas;
  $('colorList').onclick=e=>{const b=e.target.closest('[data-color]');if(!b)return;activeColor=Number(b.dataset.color);renderColors();if(highlight)renderCanvas();};
  $('usedTab').onclick=()=>{tab='used';renderColors();};$('allTab').onclick=()=>{tab='all';renderColors();};$('customColorBtn').onclick=customColor;$('replaceBtn').onclick=openReplace;
  $('highlightBtn').onclick=()=>{highlight=!highlight;$('highlightBtn').setAttribute('aria-pressed',highlight);$('highlightBtn').textContent=highlight?'显示全部颜色':'定位当前色';renderCanvas();};
  $('importPaletteBtn').onclick=()=>$('paletteInput').click();$('paletteInput').onchange=e=>{importPalette(e.target.files[0]);e.target.value='';};$('exportPaletteBtn').onclick=()=>downloadJSON({name:doc.paletteName,paletteId:doc.paletteId,colors:C.copyPalette(doc.palette),source:library.find(p=>p.id===doc.paletteId)?.source},'豆屿-色板.json');
  $('brandPalette').onchange=e=>switchPalette(e.target.value);$('paletteLibraryBtn').onclick=paletteLibrary;$('paletteSourceBtn').onclick=paletteSources;$('colorSearch').oninput=renderColors;
  ['beadSize','sparePercent','unitPrice'].forEach(id=>$(id).addEventListener('input',()=>{renderStats();scheduleSave();}));
  $('projectName').addEventListener('input',()=>{doc.name=$('projectName').value.trim()||'我的拼豆作品';scheduleSave();});
  $('openProjectBtn').onclick=()=>$('projectInput').click();$('projectInput').onchange=e=>{importProject(e.target.files[0]);e.target.value='';};
  $('saveProjectBtn').onclick=exportProject;$('exportBtn').onclick=openExport;$('csvBtn').onclick=exportCSV;$('helpBtn').onclick=help;
  document.addEventListener('keydown',e=>{
    if($('dialog').open)return;
    const typing=/INPUT|TEXTAREA|SELECT/.test(e.target.tagName);const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
    if(mod&&key==='s'){e.preventDefault();exportProject();return;}if(mod&&key==='o'){e.preventDefault();$('projectInput').click();return;}if(typing)return;
    if(mod&&key==='z'){e.preventDefault();history(e.shiftKey?'redo':'undo');return;}if(mod&&key==='y'){e.preventDefault();history('redo');return;}
    if(key==='escape'){selection=null;keyboardCell=null;renderCanvas();return;}if(key==='delete'||key==='backspace'){if(selection){e.preventDefault();selectionAction(-1);}return;}
    if(e.code==='Space'){e.preventDefault();spaceHeld=true;canvas.style.cursor='grab';return;}
    if(e.target===canvas&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Enter'].includes(e.key)){
      e.preventDefault();keyboardCell=keyboardCell||{x:0,y:0};if(e.key==='ArrowUp')keyboardCell.y=Math.max(0,keyboardCell.y-1);if(e.key==='ArrowDown')keyboardCell.y=Math.min(doc.h-1,keyboardCell.y+1);if(e.key==='ArrowLeft')keyboardCell.x=Math.max(0,keyboardCell.x-1);if(e.key==='ArrowRight')keyboardCell.x=Math.min(doc.w-1,keyboardCell.x+1);
      if(e.key==='Enter'&&!reading){const p=keyboardCell;if(tool==='picker'){const k=doc.pixels[p.y*doc.w+p.x];if(k>=0){activeColor=k;renderColors();}}else if(tool==='fill')mutate(()=>C.fill(doc.pixels,doc.w,doc.h,p.x,p.y,activeColor));else if(tool==='brush'||tool==='eraser')mutate(()=>paint(p));}
      $('cursorInfo').textContent=`列 ${keyboardCell.x+1} · 行 ${keyboardCell.y+1}`;renderCanvas();return;
    }
    if(!mod){const t={b:'brush',e:'eraser',f:'fill',i:'picker',s:'select',h:'pan'}[key];if(t)setTool(t);if(key==='?')help();}
  });
  document.addEventListener('keyup',e=>{if(e.code==='Space'){spaceHeld=false;canvas.style.cursor=tool==='pan'?'grab':'crosshair';}});
  window.addEventListener('pagehide',persist);document.addEventListener('visibilitychange',()=>{if(document.hidden)persist();});window.addEventListener('resize',()=>{if(!pointer)renderCanvas();});
  window.addEventListener('bead:save',persist);
  window.addEventListener('bead:panel',e=>{requestAnimationFrame(()=>{if(stage.clientWidth){if(e.detail?.fit)fitCanvas();else renderCanvas();}});});
  async function init(){let restored=false;try{const raw=localStorage.getItem('douyu-beads-v1');if(raw){await restoreProject(JSON.parse(raw));undoStack=[];redoStack=[];renderAll();restored=true;toast('欢迎回来，已恢复上次的作品');}}catch{toast('上次存档无法读取，已为你打开示例');}if(!restored)await useExample('flower',true);$('saveStatus').textContent=restored?'已恢复本地作品':'示例 · 可以直接编辑';}
  init();
})();
