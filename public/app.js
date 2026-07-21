const $ = id => document.getElementById(id);
let currentPlan = null;

async function api(path, options = {}) {
  const response = await fetch(path, {headers:{'Content-Type':'application/json'}, ...options});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function show(el, html, isError=false) {
  el.classList.remove('hidden','error');
  if (isError) el.classList.add('error');
  el.innerHTML = html;
}

function list(items) {
  return `<ul class="summary-list">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;
}

async function loadDashboard() {
  const data = await api('/api/dashboard');
  const p = data.project;
  $('metrics').innerHTML = [
    ['Progress',`${p.progress}%`],['Features',p.features],['Stories',p.stories],['Tasks',p.tasks],['Blocked',p.blocked],['Compliance',`${p.compliance}%`]
  ].map(([label,value])=>`<div class="metric"><div class="value">${value}</div><div class="label">${label}</div></div>`).join('');

  $('meetingSummary').innerHTML = `<h3>${data.meeting.title}</h3><p><strong>${data.meeting.date}, ${data.meeting.time}</strong></p><div>${data.meeting.attendees.map(x=>`<span class="pill">${x}</span>`).join('')}</div><h4>Agenda</h4>${list(data.meeting.agenda)}`;
  $('discussionSummary').innerHTML = `<h4>Decisions</h4>${list(data.discussion.decisions)}<h4>Actions</h4>${list(data.discussion.actions.map(a=>`${a.title} — ${a.owner} (${a.target})`))}<h4>Risks</h4>${list(data.discussion.risks)}`;
}

document.querySelectorAll('[data-scroll]').forEach(btn => btn.addEventListener('click',()=>$(btn.dataset.scroll).scrollIntoView({behavior:'smooth'})));

$('arrangeMeeting').addEventListener('click', async () => {
  try {
    const result = await api('/api/meeting',{method:'POST',body:JSON.stringify({
      title:$('meetingTitle').value,date:$('meetingDate').value,time:$('meetingTime').value,
      attendees:$('meetingAttendees').value.split(',').map(x=>x.trim()).filter(Boolean)
    })});
    show($('meetingResult'),`<div class="callout"><strong>${result.message}</strong><br>${result.meeting.title}<br>${result.meeting.date}, ${result.meeting.time}</div>`);
    loadDashboard();
  } catch(e){show($('meetingResult'),e.message,true)}
});

function renderPlan(plan) {
  return `<div class="callout"><strong>${plan.projectName}</strong><br>${plan.estimatedDuration} · ${plan.estimatedSprints} sprints · ${plan.complexity} complexity</div>
  <div class="tree"><ul><li class="epic">Epic: ${plan.epic}<ul>${plan.features.map(f=>`<li class="feature">Feature: ${f.name}<ul>${f.stories.map(s=>`<li>User Story: ${s.name}<ul>${s.tasks.map(t=>`<li>Task: ${t}</li>`).join('')}</ul></li>`).join('')}</ul></li>`).join('')}</ul></li></ul></div>`;
}

$('generatePlan').addEventListener('click', async () => {
  try {
    currentPlan = await api('/api/plan',{method:'POST',body:JSON.stringify({prompt:$('planPrompt').value})});
    show($('planResult'),renderPlan(currentPlan));
    $('approvePlan').disabled = false;
  } catch(e){show($('planResult'),e.message,true)}
});

$('approvePlan').addEventListener('click',()=>{
  if (!currentPlan) return;
  show($('planResult'),renderPlan(currentPlan)+`<div class="callout"><strong>Approved in demo mode.</strong><br>The next phase will connect this approval to Azure DevOps REST APIs.</div>`);
});

$('analyzeNotes').addEventListener('click', async () => {
  try {
    const r = await api('/api/discussion',{method:'POST',body:JSON.stringify({notes:$('notes').value})});
    show($('discussionResult'),`<h3>Discussion Updated</h3><h4>Decisions</h4>${list(r.decisions)}<h4>Actions</h4>${list(r.actions.map(a=>`${a.title} — ${a.owner} (${a.target})`))}<h4>Risks</h4>${list(r.risks)}<h4>Deferred</h4>${list(r.deferred)}<h4>Proposed DevOps Changes</h4>${list(r.proposedDevOpsChanges)}<div class="callout"><strong>No external changes were made.</strong> Human approval remains required.</div>`);
    loadDashboard();
  } catch(e){show($('discussionResult'),e.message,true)}
});

$('generateMom').addEventListener('click', async () => {
  try {
    const r = await api('/api/mom',{method:'POST'});
    show($('discussionResult'),`<h3>${r.title}</h3><p>${r.objective}</p><h4>Decisions</h4>${list(r.decisions)}<h4>Actions</h4>${list(r.actions.map(a=>`${a.title} — ${a.owner} (${a.target})`))}<h4>Risks</h4>${list(r.risks)}<h4>Next Steps</h4>${list(r.nextSteps)}`);
  } catch(e){show($('discussionResult'),e.message,true)}
});

$('generateHandover').addEventListener('click', async () => {
  try {
    const r = await api('/api/handover',{method:'POST'});
    show($('handoverResult'),`<h3>${r.project}</h3><div class="callout"><strong>Handover status: ${r.readiness}</strong></div><h4>Document Sections</h4>${list(r.sections)}<h4>Remaining Gaps</h4>${list(r.gaps.length?r.gaps:['No critical gaps detected'])}`);
  } catch(e){show($('handoverResult'),e.message,true)}
});

loadDashboard().catch(err=>alert(err.message));
