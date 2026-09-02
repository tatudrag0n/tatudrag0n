(()=>{
function authMessage(text,isError=false){
  const el=document.querySelector('#ghUser');
  if(el)el.textContent=text;
  if(isError){
    const status=document.querySelector('#status');
    if(status)status.textContent=text;
  }
}
function openExternal(url){
  try{
    if(window.ForgeCodexAndroid?.openExternal){window.ForgeCodexAndroid.openExternal(url);return true}
  }catch{}
  try{
    const w=window.open(url,'_blank','noopener');
    if(w)return true;
  }catch{}
  try{location.href=url;return true}catch{}
  return false
}
async function fixedGithubLogin(){
  const input=document.querySelector('#clientId');
  const clientId=(input?.value||settings().clientId||'').trim();
  if(!clientId){
    authMessage('GitHub: OAuth Client IDを入力してからSign inしてください',true);
    if(input){input.focus();input.scrollIntoView({block:'center',behavior:'smooth'})}
    return;
  }
  putSettings({clientId});
  authMessage('GitHub: 認証コードを取得中…');
  const r=await fetch('/api/github/device/code',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId})
  });
  const d=await r.json();
  if(!r.ok||d.error)throw Error(d.error_description||d.error||`GitHub device code ${r.status}`);
  const box=document.querySelector('#deviceBox'),code=document.querySelector('#deviceCode'),link=document.querySelector('#deviceLink');
  if(code)code.textContent=d.user_code||'';
  const verify=d.verification_uri||'https://github.com/login/device';
  if(link)link.href=verify;
  if(box)box.classList.remove('hidden');
  authMessage(`GitHub: コード ${d.user_code} を認証してください`);
  openExternal(verify);
  let interval=Math.max(5,Number(d.interval)||5);
  const end=Date.now()+(Number(d.expires_in)||900)*1000;
  while(Date.now()<end){
    await sleep(interval*1000);
    const tr=await fetch('/api/github/device/token',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:clientId,device_code:d.device_code})
    });
    const td=await tr.json();
    if(td.access_token){
      putSettings({ghToken:td.access_token});
      if(box)box.classList.add('hidden');
      await updateGitHubUI();
      await loadRepos();
      authMessage('GitHub: 接続済み');
      return;
    }
    if(td.error==='authorization_pending')continue;
    if(td.error==='slow_down'){interval+=5;continue}
    if(td.error==='expired_token')throw Error('GitHub認証コードの期限が切れました');
    if(td.error==='access_denied')throw Error('GitHub認証がキャンセルされました');
    if(!tr.ok||td.error)throw Error(td.error_description||td.error||`GitHub token ${tr.status}`);
  }
  throw Error('GitHub認証コード期限切れ');
}
window.githubLogin=fixedGithubLogin;
const bind=()=>{
  const b=document.querySelector('#ghLogin');
  if(b)b.onclick=()=>fixedGithubLogin().catch(e=>{
    authMessage('GitHub: '+(e?.message||e),true);
    try{showErr(e)}catch{}
  });
  const link=document.querySelector('#deviceLink');
  if(link)link.onclick=e=>{e.preventDefault();openExternal(link.href)};
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
