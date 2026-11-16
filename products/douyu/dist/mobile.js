/* Mobile navigation and optional install/offline support; no user data leaves the device. */
(() => {
  const $=id=>document.getElementById(id),mq=matchMedia('(max-width:680px)');
  const sections={image:document.querySelector('.left-panel'),edit:document.querySelector('.editor'),colors:document.querySelector('.right-panel')};
  Object.entries(sections).forEach(([key,el])=>el.id=key==='image'?'imagePanel':key==='edit'?'editPanel':'colorsPanel');
  function panel(key,scroll=true){
    if(!sections[key])return;document.body.dataset.mobilePanel=key;
    document.querySelectorAll('[data-panel]').forEach(b=>{if(b.dataset.panel===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
    if(mq.matches&&scroll)window.scrollTo({top:0,behavior:'instant'});
    if(key==='edit')window.dispatchEvent(new Event('bead:panel'));
  }
  document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>panel(b.dataset.panel));
  $('mobileColorBtn').onclick=()=>panel('colors');
  window.addEventListener('bead:navigate',e=>panel(e.detail));
  mq.addEventListener('change',()=>{window.dispatchEvent(new CustomEvent('bead:panel',{detail:{fit:true}}));});
  if(window.DouyuAndroid){
    $('phoneGuideBtn').hidden=true;
    $('offlineStatus').textContent='安卓离线版 · 作品请另存备份';
    return;
  }
  let prompt=null,registration=null;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();prompt=e;});
  window.addEventListener('appinstalled',()=>{prompt=null;});
  const publicURL=()=>location.protocol==='https:'&&!/^(localhost|127\.|\[::1\])/.test(location.hostname);
  function guide(){
    const d=$('dialog');$('dialogTitle').textContent='把豆屿装进口袋';
    $('dialogBody').innerHTML=`<p>用浏览器打开网址就能创作，无需下载压缩包。分享的是工具入口，作品和照片仍保存在你自己的设备里。</p><div class="phone-guide"><strong>iPhone / iPad</strong><p>在 Safari 打开网页，点浏览器的分享按钮，再选「添加到主屏幕」。菜单名称可能随系统版本变化。</p><strong>安卓手机</strong><p>在 Chrome 等支持的浏览器中，打开菜单，选择「安装应用」或「添加到主屏幕」。</p><strong>从微信打开</strong><p>可以先直接使用；如果保存图片、文件或安装入口不可用，点右上角菜单，选择在系统浏览器中打开。</p></div><p id="siteShareNote"></p><input id="siteShareURL" aria-label="可分享的网站链接" readonly hidden><div class="dialog-actions"><button id="installPhoneBtn" class="outline-btn" hidden>添加到桌面</button><button id="shareSiteBtn" class="primary-btn">分享网站链接</button></div><p>首次联网打开并完成离线缓存后，可在支持的浏览器离线使用。缓存可能被系统清理，请另外保存重要项目；不同浏览器和桌面入口不保证共享作品。</p>`;
    const url=location.origin+location.pathname;
    $('siteShareNote').textContent=publicURL()?'把这个网址发给朋友，对方打开就能开始。':'当前是本地预览，还没有可发给他人的公网网址。发布到 HTTPS 托管后，这里会提供分享入口。';
    $('shareSiteBtn').disabled=!publicURL();
    if(publicURL()){$('siteShareURL').hidden=false;$('siteShareURL').value=url;}
    $('shareSiteBtn').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'豆屿 · 拼豆工作室',text:'把喜欢的图片变成拼豆图纸',url});}else if(navigator.clipboard){await navigator.clipboard.writeText(url);$('siteShareNote').textContent='网址已复制，可以粘贴给朋友。';}else{$('siteShareURL').select();$('siteShareNote').textContent='请复制上方网址后分享。';}}catch(e){if(e.name!=='AbortError'){$('siteShareURL').select();$('siteShareNote').textContent='请手动复制上方网址后分享。';}}};
    if(prompt){$('installPhoneBtn').hidden=false;$('installPhoneBtn').onclick=async()=>{try{await prompt.prompt();await prompt.userChoice;}finally{prompt=null;$('installPhoneBtn').hidden=true;}};}
    if(!d.open)d.showModal();
  }
  $('phoneGuideBtn').onclick=guide;
  const status=$('offlineStatus');
  if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)&&isSecureContext){
    navigator.serviceWorker.register('./sw.js').then(reg=>{
      registration=reg;
      const offer=()=>{if(reg.waiting&&navigator.serviceWorker.controller)$('updateAppBtn').hidden=false;};offer();
      reg.addEventListener('updatefound',()=>{const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed')offer();});});
      navigator.serviceWorker.ready.then(()=>{status.textContent='已可离线打开 · 作品请另存备份';});
    }).catch(()=>{status.textContent='在线可用 · 离线缓存不可用';});
    let updating=false;
    $('updateAppBtn').onclick=()=>{window.dispatchEvent(new Event('bead:save'));updating=true;registration?.waiting?.postMessage({type:'ACTIVATE'});};
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload();else $('updateAppBtn').hidden=true;});
  }else status.textContent='本地版 · 发布后支持桌面入口';
})();
