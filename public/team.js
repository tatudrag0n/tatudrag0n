(()=>{
const oldRun=run;
async function teamRun(text){
  const runtime=()=>window.forgeRunner?.isOnline?.()===true;
  setStatus('Team · Planner');
  const plan=await runGitHubAgent(`TASK:\n${text}\n\nAct as Planner. Inspect the repository and produce a concrete implementation plan. Do not modify files. Identify risks, files, compatibility constraints, and how to verify. A paired PC Runner may be available to the later Coder/Reviewer for real build/test execution.`, 'plan');
  setStatus('Team · Coder');
  const implementation=await runGitHubAgent(`TASK:\n${text}\n\nPLANNER OUTPUT:\n${plan}\n\nAct as Coder. Implement the task now. Inspect before editing and make minimal coherent changes. ${runtime()?'A paired PC Runner is online: use run_command for appropriate build/test/lint/runtime verification after editing, and fix failures before finishing.':'No PC Runner is currently online: do not claim shell/build/test execution; use repository diff and CI evidence instead.'}`, 'agent');
  setStatus('Team · Reviewer');
  const review=await runGitHubAgent(`Original task:\n${text}\n\nCoder report:\n${implementation}\n\nAct as an independent Reviewer. Inspect the current repository diff and relevant files. Find regressions, missing cases, security/reliability issues, and inconsistencies. Do not modify repository files. ${runtime()?'The PC Runner is online; run focused read-only or test/build commands when they materially improve verification.':'The PC Runner is offline; clearly list runtime behavior that could not be verified.'}`, 'review');
  setStatus(modeLabel());
  return `## Planner\n${plan}\n\n## Coder\n${implementation}\n\n## Reviewer\n${review}`;
}
run=async function(text){if(hasGitHub()&&agentMode()==='team')return teamRun(text);return oldRun(text)};

function addButton(parent,id,text,handler,cls=''){const b=document.createElement('button');b.id=id;b.textContent=text;if(cls)b.className=cls;b.onclick=()=>handler().catch(showErr);parent.append(b);return b}

const gitRows=$('#gitTab').querySelectorAll('.row');
if(gitRows.length){
  const row=document.createElement('div');row.className='row';gitRows[gitRows.length-1].after(row);
  addButton(row,'commitsBtn','Recent commits',async()=>{const r=active(),d=await gh(`/repos/${r.owner}/${r.repo}/commits?sha=${encodeURIComponent(r.ref)}&per_page=20`);$('#gitout').textContent=d.map(c=>`${c.sha.slice(0,8)}  ${c.commit?.message?.split('\n')[0]||''}\n${c.html_url}`).join('\n\n')});
  addButton(row,'checksBtn','Checks',async()=>{const r=active(),ref=await gh(`/repos/${r.owner}/${r.repo}/git/ref/heads/${encodeURIComponent(r.ref)}`),sha=ref.object.sha,d=await gh(`/repos/${r.owner}/${r.repo}/commits/${sha}/check-runs`);$('#gitout').textContent=`${sha}\n\n`+(d.check_runs||[]).map(x=>`${x.name}: ${x.status}/${x.conclusion||'-'}\n${x.html_url||''}`).join('\n\n')});
}

const actionRow=$('#actionsTab').querySelector('.row');
if(actionRow){
  addButton(actionRow,'rerunFailed','Rerun failed',async()=>{const id=$('#runId').value.trim();if(!id)throw Error('run id required');const r=active();await gh(`/repos/${r.owner}/${r.repo}/actions/runs/${encodeURIComponent(id)}/rerun-failed-jobs`,{method:'POST'});$('#actionout').textContent='Failed jobs re-run requested for '+id});
  addButton(actionRow,'cancelRun','Cancel',async()=>{const id=$('#runId').value.trim();if(!id)throw Error('run id required');if(!confirm('Cancel this workflow run?'))return;const r=active();await gh(`/repos/${r.owner}/${r.repo}/actions/runs/${encodeURIComponent(id)}/cancel`,{method:'POST'});$('#actionout').textContent='Cancel requested for '+id},'danger');
}

const projectTab=$('#projectTab');
if(projectTab){
  const h=document.createElement('h3');h.textContent='Session';projectTab.append(h);
  const row=document.createElement('div');row.className='row';projectTab.append(row);
  addButton(row,'exportSession','Export session',async()=>{const data={version:1,exportedAt:new Date().toISOString(),settings:{model:selectedModel(),webMode:webMode(),agentMode:agentMode()},memory:memory(),history:hist};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='forgecodex-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  addButton(row,'clearMemory','Clear memory',async()=>{if(!confirm('Clear project memory?'))return;localStorage.removeItem(MK);$('#projectMemory').value='';$('#projectout').textContent='Memory cleared'},'danger');
}

const originalModeLabel=modeLabel;
modeLabel=function(){const base=originalModeLabel();return agentMode()==='team'?base.replace('team','Team×3'):base};
setStatus(modeLabel());
})();