(() => {
  const init = () => {
    if (document.getElementById('fc-progress')) return;
    const style = document.createElement('style');
    style.textContent = `#fc-progress{display:none;position:sticky;top:0;z-index:20;margin:8px 0;padding:10px 12px;border:1px solid #2b2f38;border-radius:10px;background:#111318;box-shadow:0 4px 18px #0005}.fc-p-head{display:flex;align-items:center;gap:9px;font-size:13px}.fc-spinner{width:12px;height:12px;border:2px solid #555;border-top-color:#ddd;border-radius:50%;animation:fcspin .8s linear infinite}.fc-done{width:16px;height:16px;display:grid;place-items:center;border-radius:50%;background:#2d7d46;color:white;font-size:11px}.fc-p-step{margin-left:auto;color:#9aa1ad;font-variant-numeric:tabular-nums}.fc-p-bar{height:3px;margin-top:8px;border-radius:3px;background:#252932;overflow:hidden}.fc-p-fill{height:100%;width:20%;background:#8b93a1;transition:width .25s ease}@keyframes fcspin{to{transform:rotate(360deg)}}.fc-activity{margin-top:7px;max-height:100px;overflow:auto;color:#8e95a1;font-size:11px;line-height:1.55}.fc-activity div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
    document.head.appendChild(style);
    const main = document.querySelector('main');
    const box = document.createElement('div'); box.id='fc-progress';
    box.innerHTML='<div class="fc-p-head"><span class="fc-spinner"></span><b class="fc-p-text">Agent処理中…</b><span class="fc-p-step">Step 1</span></div><div class="fc-p-bar"><div class="fc-p-fill"></div></div><div class="fc-activity"></div>';
    main?.prepend(box);
    const status=document.getElementById('status');
    let running=false, step=0, last='', timer=null;
    const start=()=>{running=true;step=0;box.style.display='block';box.querySelector('.fc-p-text').textContent='Agent処理中…';box.querySelector('.fc-p-step').textContent='Step 0';box.querySelector('.fc-p-fill').style.width='8%';box.querySelector('.fc-activity').innerHTML='';};
    const finish=(ok)=>{if(!running)return;running=false;clearTimeout(timer);box.querySelector('.fc-spinner').outerHTML=ok?'<span class="fc-done">✓</span>':'<span class="fc-done">!</span>';box.querySelector('.fc-p-text').textContent=ok?'Agent完了':'処理終了';box.querySelector('.fc-p-fill').style.width='100%';setTimeout(()=>box.style.display='none',2200);};
    const update=()=>{if(!status)return;const text=(status.textContent||'').trim();if(!text||text===last)return;last=text;if(!running && !/^Starting|^Ready|^Error/.test(text)) start();if(running){step++;box.querySelector('.fc-p-text').textContent=text;box.querySelector('.fc-p-step').textContent=`Step ${step}`;box.querySelector('.fc-p-fill').style.width=`${Math.min(94,8+step*7)}%`;const log=box.querySelector('.fc-activity');const row=document.createElement('div');row.textContent=`${step}. ${text}`;log.prepend(row);if(/^Error:/i.test(text)){finish(false);return;}if(/完了|completed|finished|done|ready/i.test(text)){timer=setTimeout(()=>finish(true),300);}}};
    if(status){new MutationObserver(update).observe(status,{childList:true,subtree:true,characterData:true});status.addEventListener('change',update);}
    document.addEventListener('click',e=>{const b=e.target.closest('#send');if(b){start();}});
    window.addEventListener('beforeunload',()=>clearTimeout(timer));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
