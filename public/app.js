async function api(path, options={}){const r=await fetch(path,{headers:{'Content-Type':'application/json'},...options});const j=await r.json();if(!r.ok)throw new Error(j.error||'Request failed');return j}
async function health(){try{healthEl.textContent=JSON.stringify(await api('/api/health'),null,2)}catch(e){healthEl.textContent=e.message}}
async function generatePlan(){output.textContent='Generating...';try{output.textContent=JSON.stringify(await api('/api/ai-plan',{method:'POST',body:JSON.stringify({project_requirement:requirement.value})}),null,2)}catch(e){output.textContent=e.message}}
const healthEl=document.getElementById('health');health();
