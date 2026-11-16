/* Touch transactions: adding a second finger cancels the first finger's edits. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BeadTouch=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  function geometry(points){const [a,b]=points;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function attach(stage,actions){
    const points=new Map();let gesture=null,blocked=false;
    const stop=e=>{e.preventDefault();e.stopImmediatePropagation();};
    const down=e=>{
      if(e.pointerType!=='touch')return;stop(e);
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(points.size===1&&!blocked)actions.start(e);
      else if(points.size===2&&!blocked){actions.cancel();const g=geometry([...points.values()]);gesture={...g,anchor:actions.anchor(g)};}
      stage.setPointerCapture(e.pointerId);
    };
    const move=e=>{
      if(e.pointerType!=='touch'||!points.has(e.pointerId))return;stop(e);
      points.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(blocked)return;
      if(gesture){const g=geometry([...points.values()]);actions.transform(gesture.anchor,g.distance/gesture.distance,g);}
      else actions.move(e);
    };
    const end=e=>{
      if(!points.has(e.pointerId))return;stop(e);
      if(!gesture&&!blocked){if(e.type==='pointerup')actions.end(e);else actions.cancel();}
      if(gesture){gesture=null;blocked=true;}
      points.delete(e.pointerId);
      if(!points.size)blocked=false;
    };
    stage.addEventListener('pointerdown',down,true);stage.addEventListener('pointermove',move,true);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,end,true);
    const cancel=()=>{if(points.size&&!blocked&&!gesture)actions.cancel();points.clear();gesture=null;blocked=false;};
    window.addEventListener('blur',cancel);
    return {cancel};
  }
  return {geometry,attach};
});
