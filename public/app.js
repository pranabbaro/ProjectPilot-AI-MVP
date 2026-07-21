
let devopsItems=[],latestPlan=null,latestDiscussion=null;
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
async function api(p,o={}){const r=await fetch(p,{headers:{'Content-Type':'application/json'},...o});const d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d}
async function health(){try{const h=await api('/api/health');sideDot.classList.add('on');sideStatus.textContent='Service Online';apiStatus.textContent='API Online'}catch{sideStatus.textContent='Service unavailable';apiStatus.textContent='API unavailable'}}
function addMeeting(){if(!meetingTitle.value)return;const d=meetingDate.value?new Date(meetingDate.value+'T00:00:00'):new Date();const item=document.createElement('div');item.className='meeting-item';item.innerHTML=`<div class="date-box"><b>${String(d.getDate()).padStart(2,'0')}</b><span>${d.toLocaleString('en',{month:'short'}).toUpperCase()}</span></div><div><strong>${esc(meetingTitle.value)}</strong><p>${esc(meetingTime.value||'TBD')} • Microsoft Teams</p></div><span class="meeting-tag">Scheduled</span>`;meetingList.appendChild(item);scheduleForm.classList.add('hidden')}
async function loadDevOps(){try{const d=await api('/api/devops/work-items');devopsItems=d.items||[];kpiItems.textContent=devopsItems.length;const counts={};const states=new Set();devopsItems.forEach(x=>{counts[x.type]=(counts[x.type]||0)+1;states.add(x.state)});devopsTypeCards.innerHTML=['Epic','Feature','User Story','Product Backlog Item','Task'].map(t=>`<div class="type-card"><span>${esc(t.toUpperCase())}</span><strong>${counts[t]||0}</strong></div>`).join('');stateFilter.innerHTML='<option value="">All States</option>'+[...states].sort().map(s=>`<option>${esc(s)}</option>`).join('');renderDevOpsTable()}catch(e){devopsTable.innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`}}
function renderDevOpsTable(){const tf=typeFilter.value,sf=stateFilter.value;const rows=devopsItems.filter(x=>(!tf||x.type===tf)&&(!sf||x.state===sf));devopsTable.innerHTML=rows.map(x=>`<tr><td>#${x.id}</td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td>${esc(x.state)}</td><td>${esc(x.assignedTo||'—')}</td><td>${esc(x.iteration||'—')}</td><td>${esc(x.tags||'—')}</td></tr>`).join('')||'<tr><td colspan="7">No matching work items.</td></tr>'}
function mark(v){return v?'<span class="badge-ok">OK</span>':'<span class="badge-bad">Missing</span>'}
async function loadCompliance(){try{const d=await api('/api/devops/compliance');compScore.textContent=d.overall+'%';compTotal.textContent=d.total;compNon.textContent=d.nonCompliant;kpiCompliance.textContent=d.overall+'%';complianceTable.innerHTML=d.items.map(x=>`<tr><td>#${x.id}</td><td>${esc(x.type)}</td><td>${esc(x.title)}</td><td><b>${x.compliance.score}%</b></td><td>${mark(x.compliance.tags)}</td><td>${mark(x.compliance.sprint)}</td><td>${mark(x.compliance.description)}</td><td>${mark(x.compliance.acceptance)}</td><td>${mark(x.compliance.assignee)}</td><td>${mark(x.compliance.dates)}</td></tr>`).join('')}catch(e){complianceTable.innerHTML=`<tr><td colspan="10">${esc(e.message)}</td></tr>`}}
async function analyseDiscussion(){discussionStatus.textContent='Analysing...';try{latestDiscussion=await api('/api/discussion-summary',{method:'POST',body:JSON.stringify({discussion_notes:discussionText.value})});kpiActions.textContent=(latestDiscussion.actions||[]).length;const blocks=[];(latestDiscussion.decisions||[]).forEach(x=>blocks.push(`<div class="discussion-card"><b>DECISION</b><span>${esc(x.title)}</span></div>`));(latestDiscussion.actions||[]).forEach(x=>blocks.push(`<div class="discussion-card"><b>ACTION • PMO</b><span>${esc(x.title)}</span><button class="create-btn" onclick='createDiscussionItem(${JSON.stringify(JSON.stringify(x))},"Task")'>Create Task in DevOps</button></div>`));(latestDiscussion.requirements||[]).forEach(x=>blocks.push(`<div class="discussion-card"><b>NEW REQUIREMENT</b><span>${esc(x.title)}</span><button class="create-btn" onclick='createDiscussionItem(${JSON.stringify(JSON.stringify(x))},"User Story")'>Create User Story in DevOps</button></div>`));(latestDiscussion.risks||[]).forEach(x=>blocks.push(`<div class="discussion-card"><b>RISK</b><span>${esc(x.title)}</span></div>`));discussionOutput.innerHTML=blocks.join('')||'<div>No actions detected.</div>';discussionStatus.textContent='Updated';await updateMOM()}catch(e){discussionStatus.textContent=e.message}}
async function createDiscussionItem(serialized,itemType){const x=JSON.parse(serialized);if(!confirm(`Create ${itemType} in Azure DevOps and route to PMO?`))return;try{const r=await api('/api/devops/create-discussion-item',{method:'POST',body:JSON.stringify({approved:true,itemType,title:x.title})});alert(`Created #${r.item.id}`);await loadDevOps();await loadCompliance()}catch(e){alert(e.message)}}
async function updateMOM(){try{const m=await api('/api/mom',{method:'POST',body:JSON.stringify({discussion_notes:discussionText.value})});momContent.innerHTML=`<div class="mom-section"><b>Discussion Summary</b><p>${esc(m.discussionSummary)}</p></div><div class="mom-section"><b>Decisions</b><ul>${(m.decisions||[]).map(x=>`<li>${esc(x.title)}</li>`).join('')||'<li>None</li>'}</ul></div><div class="mom-section"><b>Actions</b><ul>${(m.actions||[]).map(x=>`<li>${esc(x.title)}</li>`).join('')||'<li>None</li>'}</ul></div><div class="mom-section"><b>Risks</b><ul>${(m.risks||[]).map(x=>`<li>${esc(x.title)}</li>`).join('')||'<li>None</li>'}</ul></div><small>Updated: ${new Date(m.generatedAt).toLocaleString()}</small>`}catch(e){momContent.textContent=e.message}}
function renderPlan(p){latestPlan=p;projectName.textContent=p.projectName||p.epic?.title;sprints.textContent=p.estimatedSprints||'—';let h=`<div class="epic-card"><h4>EPIC • ${esc(p.epic?.title)}</h4>`;for(const f of p.epic?.features||[]){h+=`<div class="feature-card"><b>FEATURE • ${esc(f.title)}</b>`;for(const s of f.userStories||[]){h+=`<div class="story-card"><strong>USER STORY • ${esc(s.title)}</strong><ul>${(s.tasks||[]).map(t=>`<li>${esc(t.title)}</li>`).join('')}</ul></div>`}h+='</div>'}hierarchy.innerHTML=h+'</div>';planOutput.classList.remove('hidden');approveBtn.disabled=false}
async function generatePlan(){generateBtn.disabled=true;try{renderPlan(await api('/api/ai-plan',{method:'POST',body:JSON.stringify({project_requirement:requirement.value})}))}catch(e){alert(e.message)}finally{generateBtn.disabled=false}}
async function approvePlan(){if(!latestPlan||!confirm('Approve and create this hierarchy in Azure DevOps?'))return;try{const r=await api('/api/approve-plan',{method:'POST',body:JSON.stringify({approved:true,plan:latestPlan})});approvalStatus.textContent=`Created ${r.created.length} work items`;await loadDevOps();await loadCompliance()}catch(e){approvalStatus.textContent=e.message}}
async function docStatusLoad(){try{const s=await api('/api/documents/status');docStatus.textContent=`SharePoint: ${s.sharePointConfigured?'Configured':'Not configured'} • DevOps Repo: ${s.devOpsRepoConfigured?'Configured':'Not configured'}`}catch(e){docStatus.textContent=e.message}}
async function uploadDocument(){const f=docFile.files[0];if(!f)return alert('Select a file');if(f.size>10*1024*1024)return alert('MVP upload limit is 10 MB');uploadResult.textContent='Uploading...';const b64=await new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f)});try{const x=await api('/api/documents/upload',{method:'POST',body:JSON.stringify({filename:f.name,contentBase64:b64,destination:docDestination.value})});uploadResult.innerHTML=`<div class="badge-ok">${esc(x.message)}</div>`}catch(e){uploadResult.innerHTML=`<div class="badge-bad">${esc(e.message)}</div>`}}

async function loadAll(){await health();await Promise.allSettled([loadDevOps(),loadCompliance(),docStatusLoad(),updateMOM()])}
document.querySelectorAll('.quick-prompts button').forEach(b=>b.onclick=()=>requirement.value=b.dataset.prompt);loadAll();

let handoverChecklistData=[];
let handoverDocumentBase64='';
let handoverDocumentName='';
let handoverSigners=[];

async function loadHandoverStatus(){
  try{
    const s=await api('/api/handover/status');
    handoverChecklistData=s.checklist||[];
    handoverChecklist.innerHTML=handoverChecklistData.map(x=>`
      <label class="handover-check-item">
        <input type="checkbox" class="handover-section" value="${esc(x.id)}">
        ${esc(x.label)}
      </label>`).join('');
    handoverIntegrationStatus.textContent=
      `Adobe Acrobat Sign: ${s.adobeSignConfigured?'Configured':'Not configured'} • SharePoint archive: ${s.sharePointConfigured?'Configured':'Not configured'}`;
  }catch(e){
    handoverIntegrationStatus.textContent=e.message;
  }
}

function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();
    r.onload=()=>resolve(String(r.result).split(',')[1]);
    r.onerror=reject;
    r.readAsDataURL(file);
  });
}

async function submitHandover(){
  const file=handoverFile.files[0];
  if(!file)return alert('Upload the completed standard handover document.');
  if(file.size>10*1024*1024)return alert('MVP upload limit is 10 MB.');

  const completedSections=[...document.querySelectorAll('.handover-section:checked')].map(x=>x.value);
  handoverDocumentBase64=await fileToBase64(file);
  handoverDocumentName=file.name;

  handoverSubmitResult.textContent='Submitting...';
  try{
    const r=await api('/api/handover/submit',{
      method:'POST',
      body:JSON.stringify({
        projectName:handoverProjectName.value,
        architectName:handoverArchitect.value,
        pmName:handoverPM.value,
        completedSections,
        completedDocumentName:file.name,
        completedDocumentBase64:handoverDocumentBase64
      })
    });
    handoverStage.textContent='PM Review';
    handoverSubmitResult.innerHTML=`<div class="badge-ok">Submitted to PM for review${r.archivedToSharePoint?' and archived to SharePoint':''}.</div>`;
    sendAdobeBtn.disabled=false;
  }catch(e){
    handoverSubmitResult.innerHTML=`<div class="badge-bad">${esc(e.message)}</div>`;
  }
}

function addSigner(){
  const name=signerName.value.trim(),email=signerEmail.value.trim();
  if(!email||!email.includes('@'))return alert('Enter a valid stakeholder email.');
  handoverSigners.push({name:name||email,email});
  signerName.value='';signerEmail.value='';
  renderSigners();
}
function renderSigners(){
  signerList.innerHTML=handoverSigners.map((x,i)=>`
    <div class="signer-row"><span>${i+1}. ${esc(x.name)} &lt;${esc(x.email)}&gt;</span><button onclick="removeSigner(${i})">Remove</button></div>`).join('');
}
function removeSigner(i){handoverSigners.splice(i,1);renderSigners()}

async function sendToAdobe(){
  if(!pmHandoverApproved.checked)return alert('PM must approve the completed handover before Adobe Sign.');
  if(!handoverDocumentBase64)return alert('Submit the completed handover first.');
  if(!handoverSigners.length)return alert('Add at least one stakeholder signer.');
  adobeResult.textContent='Sending to Adobe Acrobat Sign...';
  try{
    const r=await api('/api/handover/send-for-signature',{
      method:'POST',
      body:JSON.stringify({
        pmApproved:true,
        projectName:handoverProjectName.value,
        documentName:handoverDocumentName,
        documentBase64:handoverDocumentBase64,
        agreementName:`${handoverProjectName.value||'Project'} - Handover Approval`,
        signers:handoverSigners
      })
    });
    agreementId.value=r.agreementId;
    handoverStage.textContent='Signature Pending';
    adobeResult.innerHTML=`<div class="badge-ok">Sent to Adobe Acrobat Sign. Agreement ID: ${esc(r.agreementId)}</div>`;
    signatureStatus.textContent='Signature workflow is in progress.';
  }catch(e){
    adobeResult.innerHTML=`<div class="badge-bad">${esc(e.message)}</div>`;
  }
}

async function checkAdobeStatus(){
  if(!agreementId.value)return alert('No Adobe Agreement ID is available.');
  signatureStatus.textContent='Checking...';
  try{
    const r=await api(`/api/handover/adobe-status?agreementId=${encodeURIComponent(agreementId.value)}`);
    signatureStatus.textContent=`Adobe agreement status: ${r.status}`;
    if(String(r.status).toUpperCase().includes('SIGNED')){
      handoverStage.textContent='Signed';
    }
  }catch(e){signatureStatus.textContent=e.message}
}

async function archiveSignedHandover(){
  if(!agreementId.value)return alert('No Adobe Agreement ID is available.');
  signatureStatus.textContent='Downloading signed agreement and archiving to SharePoint...';
  try{
    const r=await api('/api/handover/archive-signed',{
      method:'POST',
      body:JSON.stringify({
        agreementId:agreementId.value,
        filename:`${handoverProjectName.value||'Project'}-Signed-Handover.pdf`
      })
    });
    handoverStage.textContent='Completed';
    signatureStatus.innerHTML=`<span class="badge-ok">${esc(r.message)}</span>${r.webUrl?` <a href="${esc(r.webUrl)}" target="_blank">Open in SharePoint</a>`:''}`;
  }catch(e){signatureStatus.textContent=e.message}
}

loadHandoverStatus();
