
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
async function api(p,o={}){const r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
async function health(){try{const h=await api('/api/health');sideDot.classList.add('on');sideStatus.textContent='Service Online';apiStatus.textContent='API Online'}catch{sideStatus.textContent='Service unavailable';apiStatus.textContent='API unavailable'}}
function scrollToPlanner(){document.getElementById('planner').scrollIntoView({behavior:'smooth'})}
function openScheduleForm(){scheduleForm.classList.toggle('hidden')}
function addMeeting(){if(!meetingTitle.value)return;const d=meetingDate.value?new Date(meetingDate.value+'T00:00:00'):new Date();const day=String(d.getDate()).padStart(2,'0'),mon=d.toLocaleString('en',{month:'short'}).toUpperCase();const item=document.createElement('div');item.className='meeting-item';item.innerHTML=`<div class="date-box"><b>${day}</b><span>${mon}</span></div><div><strong>${esc(meetingTitle.value)}</strong><p>${esc(meetingTime.value||'TBD')} • Microsoft Teams</p></div><span class="meeting-tag neutral">Scheduled</span>`;meetingList.appendChild(item);meetingTitle.value='';scheduleForm.classList.add('hidden')}
function summarizeDiscussion(){discussionOutput.innerHTML=`<div><b>Decision</b><span>Discussion updated and captured for project tracking.</span></div><div><b>Action</b><span>Review identified actions with owners in the next project sync.</span></div><div><b>Risk</b><span>Validate any scope or delivery impact before the next sprint.</span></div>`}
function renderPlan(p){projectName.textContent=p.projectName||p.epic?.title||'Project Plan';sprints.textContent=p.estimatedSprints||'—';let h=`<div class="epic-card"><h4>EPIC • ${esc(p.epic?.title||p.projectName)}</h4>`;for(const f of p.epic?.features||[]){h+=`<div class="feature-card"><b>FEATURE • ${esc(f.title)}</b>`;for(const s of f.userStories||[]){h+=`<div class="story-card"><strong>USER STORY • ${esc(s.title)}</strong>`;if((s.tasks||[]).length)h+=`<ul>${s.tasks.map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul>`;h+='</div>'}h+='</div>'}hierarchy.innerHTML=h+'</div>';planOutput.classList.remove('hidden')}
async function generatePlan(){generateBtn.disabled=true;generateBtn.textContent='Generating...';try{const p=await api('/api/ai-plan',{method:'POST',body:JSON.stringify({project_requirement:requirement.value})});renderPlan(p)}catch(e){alert(e.message)}finally{generateBtn.disabled=false;generateBtn.textContent='✦ Generate Plan'}}
function generateMOM(){momContent.innerHTML=`<b>Minutes of Meeting</b><p><strong>Decisions:</strong> Approval escalation retained at 48 hours.</p><p><strong>Actions:</strong> RBAC validation with Security; reporting scope confirmation with business.</p><p><strong>Risks:</strong> Expanded reporting scope may affect Sprint 4 timeline.</p>`}
function generateHandover(){handoverContent.innerHTML=`<b>Project Handover Package</b><p>Executive summary, architecture overview, delivery summary, operational procedures, known issues, risks, lessons learned, documentation index and sign-off sections prepared for final review.</p>`}
document.querySelectorAll('.quick-prompts button').forEach(b=>b.onclick=()=>requirement.value=b.dataset.prompt);health();

let currentGeneratedPlan=null;
let devOpsConfigured=false;

async function loadDevOpsStatus(){
  try{
    const s=await api('/api/devops/status');
    devOpsConfigured=!!s.configured;
    const badge=document.querySelector('#devops .status-badge');
    if(badge)badge.textContent=devOpsConfigured?'Connected':'Not Configured';
    if(!devOpsConfigured){
      devopsConfigMessage.textContent='Configure AZDO_ORG, AZDO_PROJECT and AZDO_PAT in Azure App Service environment variables to enable live Azure DevOps data.';
      devopsConfigMessage.classList.remove('hidden');
    }else{
      devopsConfigMessage.classList.add('hidden');
    }
    if(currentGeneratedPlan)approveDevOpsBtn.disabled=!devOpsConfigured;
  }catch(e){
    devOpsConfigured=false;
  }
}

function workTypeClass(type){
  const x=String(type||'').toLowerCase();
  if(x==='epic')return 'epic';
  if(x==='feature')return 'feature';
  if(x.includes('story')||x.includes('backlog'))return 'story';
  return 'task';
}

async function loadDevOpsWorkItems(){
  await loadDevOpsStatus();
  if(!devOpsConfigured){
    workItems.innerHTML='<div class="loading-row">Azure DevOps connection is not configured yet.</div>';
    return;
  }
  workItems.innerHTML='<div class="loading-row">Loading live Azure DevOps work items...</div>';
  try{
    const data=await api('/api/devops/work-items');
    if(!data.items?.length){
      workItems.innerHTML='<div class="loading-row">No work items found.</div>';
      return;
    }
    workItems.innerHTML=data.items.slice(0,12).map(w=>`
      <div class="work-row">
        <span class="type ${workTypeClass(w.type)}">${esc(w.type).toUpperCase()}</span>
        <div><b>#${w.id} ${esc(w.title)}</b><small>${esc(w.iteration||w.assignedTo||'Azure DevOps')}</small></div>
        <span>${esc(w.state)}</span>
      </div>`).join('');
  }catch(e){
    workItems.innerHTML=`<div class="loading-row">Unable to load Azure DevOps: ${esc(e.message)}</div>`;
  }
}

// Override plan renderer to retain generated plan for approval.
const originalRenderPlan=renderPlan;
renderPlan=function(p){
  currentGeneratedPlan=p;
  originalRenderPlan(p);
  approveDevOpsBtn.disabled=!devOpsConfigured;
  approvalStatus.textContent=devOpsConfigured?'Ready for PM approval':'Configure Azure DevOps first';
};

async function approveAndCreate(){
  if(!currentGeneratedPlan)return;
  if(!confirm('PM approval: Create this Epic → Feature → User Story → Task hierarchy in Azure DevOps?'))return;
  approveDevOpsBtn.disabled=true;
  approvalStatus.textContent='Creating work items...';
  try{
    const result=await api('/api/approve-plan',{
      method:'POST',
      body:JSON.stringify({approved:true,plan:currentGeneratedPlan})
    });
    approvalStatus.textContent=`Created ${result.created?.length||0} Azure DevOps work items successfully.`;
    await loadDevOpsWorkItems();
  }catch(e){
    approvalStatus.textContent=`Creation failed: ${e.message}`;
    approveDevOpsBtn.disabled=false;
  }
}

loadDevOpsWorkItems();

let latestDiscussionAnalysis=null;

async function summarizeDiscussion(){
  discussionStatus.textContent='Analysing...';
  discussionOutput.innerHTML='<div class="loading-row">Analysing project discussion...</div>';
  try{
    latestDiscussionAnalysis=await api('/api/discussion-summary',{
      method:'POST',
      body:JSON.stringify({discussion_notes:discussionText.value})
    });

    const sections=[];

    for(const d of latestDiscussionAnalysis.decisions||[]){
      sections.push(`
        <div class="discussion-card">
          <div class="kind">DECISION</div>
          <div class="title">${esc(d.title)}</div>
        </div>`);
    }

    for(const a of latestDiscussionAnalysis.actions||[]){
      sections.push(`
        <div class="discussion-card">
          <div class="kind">ACTION</div>
          <div class="title">${esc(a.title)}</div>
          <div class="meta">Owner: ${esc(a.owner||'PMO')}${a.target?' • Target: '+esc(a.target):''}</div>
          <div class="create-actions">
            <button class="primary-create" onclick='createDiscussionItem(${JSON.stringify(JSON.stringify(a))},"Task")'>Create Task in Azure DevOps</button>
          </div>
        </div>`);
    }

    for(const r of latestDiscussionAnalysis.requirements||[]){
      sections.push(`
        <div class="discussion-card">
          <div class="kind">NEW REQUIREMENT</div>
          <div class="title">${esc(r.title)}</div>
          <div class="meta">Suggested work item: User Story</div>
          <div class="create-actions">
            <button class="primary-create" onclick='createDiscussionItem(${JSON.stringify(JSON.stringify(r))},"User Story")'>Create User Story in Azure DevOps</button>
          </div>
        </div>`);
    }

    for(const r of latestDiscussionAnalysis.risks||[]){
      sections.push(`
        <div class="discussion-card">
          <div class="kind">RISK</div>
          <div class="title">${esc(r.title)}</div>
        </div>`);
    }

    discussionOutput.innerHTML=sections.length
      ? sections.join('')
      : '<div class="discussion-card"><div class="title">No structured actions or risks detected.</div></div>';

    discussionStatus.textContent='Discussion analysed';
  }catch(e){
    discussionOutput.innerHTML=`<div class="discussion-card"><div class="title">Unable to analyse discussion: ${esc(e.message)}</div></div>`;
    discussionStatus.textContent='Analysis failed';
  }
}

async function createDiscussionItem(serialized,itemType){
  const item=JSON.parse(serialized);
  if(!devOpsConfigured){
    alert('Azure DevOps is not configured yet.');
    return;
  }
  if(!confirm(`PM approval: Create this ${itemType} in Azure DevOps and route it to PMO?`))return;

  try{
    const result=await api('/api/devops/create-discussion-item',{
      method:'POST',
      body:JSON.stringify({
        approved:true,
        itemType,
        title:item.title,
        owner:item.owner||'PMO',
        target:item.target||'',
        source:item.source||'Project Discussion',
        description:'Created from Latest Discussion Summary in Project Command Center.'
      })
    });

    const note=document.createElement('div');
    note.className='discussion-success';
    note.textContent=`Created ${result.item.type} #${result.item.id}: ${result.item.title}`;
    discussionOutput.prepend(note);
    await loadDevOpsWorkItems();
  }catch(e){
    alert(`Unable to create Azure DevOps item: ${e.message}`);
  }
}
