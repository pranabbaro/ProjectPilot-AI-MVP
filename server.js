const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 7071;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STATE_FILE = path.join(ROOT, 'data', 'state.json');

function send(res, status, body, type='application/json') {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control':'no-store'});
  res.end(type.includes('json') ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve,reject)=>{
    let data='';
    req.on('data',c=>data+=c);
    req.on('end',()=>{ try { resolve(data ? JSON.parse(data) : {}); } catch(e){reject(e);} });
    req.on('error',reject);
  });
}
function getState(){ return JSON.parse(fs.readFileSync(STATE_FILE,'utf8')); }
function saveState(s){ fs.writeFileSync(STATE_FILE, JSON.stringify(s,null,2)); }

function inferProjectName(prompt) {
  const m = prompt.match(/(?:build|create|develop|plan)\s+(?:an?\s+)?(.+?)(?:\s+(?:where|that|with|for|which)\b|[.,]|$)/i);
  if (m && m[1].length < 80) return titleCase(m[1].replace(/^the\s+/i,''));
  return 'New Digital Project';
}
function titleCase(s){ return s.replace(/\w\S*/g,w=>w.charAt(0).toUpperCase()+w.slice(1).toLowerCase()); }
function tasksFor(story, special=[]) {
  return [
    `Design ${story.toLowerCase()} experience`,
    `Develop ${story.toLowerCase()} API/service`,
    `Configure ${story.toLowerCase()} data model`,
    `Test ${story.toLowerCase()} end-to-end`,
    ...special
  ].map(title=>({type:'Task',title}));
}
function story(title, acceptance) {
  return {type:'User Story',title,acceptanceCriteria:acceptance,tasks:tasksFor(title)};
}
function feature(title, stories) { return {type:'Feature',title,stories}; }

function generatePlan(prompt) {
  const p = prompt.toLowerCase();
  const name = inferProjectName(prompt);
  let features = [];
  if (p.includes('employee') || p.includes('service portal') || p.includes('it request')) {
    features = [
      feature('Employee Request Management',[
        story('Allow employees to submit IT requests','Employees can submit a request with category, description and priority.'),
        story('Allow employees to track request status','Employees can see current status and history of their requests.')
      ]),
      feature('Manager Approval Workflow',[
        story('Allow managers to approve requests','Managers can review, approve or reject requests with comments.')
      ]),
      feature('Notifications',[
        story('Notify users about request updates','Users receive notifications for submission, approval and status changes.')
      ]),
      feature('Reporting and Operations',[
        story('Provide service request dashboard','Authorized users can view request volume, status and SLA indicators.')
      ])
    ];
  } else {
    features = [
      feature('Project Foundation and Access',[
        story('Provide secure user access','Authorized users can securely access the solution.')
      ]),
      feature('Core Business Capability',[
        story('Deliver the primary business workflow','Users can complete the core business process described in the requirement.')
      ]),
      feature('Notifications and Reporting',[
        story('Provide operational visibility','Stakeholders can see status and receive relevant notifications.')
      ])
    ];
  }
  return {
    projectName:name,
    summary:`AI-generated delivery plan for ${name}`,
    epic:{type:'Epic',title:name,features},
    recommendedSprints: p.includes('sprint 1') ? 1 : Math.max(2, Math.ceil(features.length/2)),
    status:'DRAFT - no Azure DevOps changes made'
  };
}

function flatten(plan) {
  const rows=[{level:0,type:'Epic',title:plan.epic.title}];
  for (const f of plan.epic.features) {
    rows.push({level:1,type:'Feature',title:f.title});
    for (const s of f.stories) {
      rows.push({level:2,type:'User Story',title:s.title});
      for (const t of s.tasks) rows.push({level:3,type:'Task',title:t.title});
    }
  }
  return rows;
}

function azdoConfigured() {
  return !!(process.env.AZDO_ORG && process.env.AZDO_PROJECT && process.env.AZDO_PAT);
}
function azdoRequest(method, apiPath, body, contentType='application/json-patch+json') {
  return new Promise((resolve,reject)=>{
    const auth = Buffer.from(':'+process.env.AZDO_PAT).toString('base64');
    const data = body ? JSON.stringify(body) : '';
    const opts = {
      hostname:'dev.azure.com',
      path:`/${encodeURIComponent(process.env.AZDO_ORG)}/${encodeURIComponent(process.env.AZDO_PROJECT)}${apiPath}`,
      method,
      headers:{'Authorization':`Basic ${auth}`,'Accept':'application/json','Content-Type':contentType}
    };
    if(data) opts.headers['Content-Length']=Buffer.byteLength(data);
    const r=https.request(opts, resp=>{
      let out='';
      resp.on('data',c=>out+=c);
      resp.on('end',()=>{
        let parsed={}; try{parsed=out?JSON.parse(out):{};}catch{parsed={raw:out};}
        if(resp.statusCode>=200 && resp.statusCode<300) resolve(parsed);
        else reject(new Error(`Azure DevOps ${resp.statusCode}: ${out.slice(0,600)}`));
      });
    });
    r.on('error',reject);
    if(data) r.write(data);
    r.end();
  });
}
function field(path,value){ return {op:'add',path,value}; }
async function createWorkItem(type,title,parentId,extra={}) {
  const encoded=encodeURIComponent(type);
  const patch=[field('/fields/System.Title',title)];
  if(extra.description) patch.push(field('/fields/System.Description',extra.description));
  if(extra.acceptanceCriteria) patch.push(field('/fields/Microsoft.VSTS.Common.AcceptanceCriteria',extra.acceptanceCriteria));
  if(process.env.AZDO_ITERATION) patch.push(field('/fields/System.IterationPath',process.env.AZDO_ITERATION));
  if(process.env.AZDO_AREA) patch.push(field('/fields/System.AreaPath',process.env.AZDO_AREA));
  patch.push(field('/fields/System.Tags','ProjectPilot-AI;PM-Approved'));
  if(parentId) patch.push({op:'add',path:'/relations/-',value:{rel:'System.LinkTypes.Hierarchy-Reverse',url:`https://dev.azure.com/${process.env.AZDO_ORG}/_apis/wit/workItems/${parentId}`,attributes:{comment:'Linked by ProjectPilot AI after PM approval'}}});
  return azdoRequest('POST',`/_apis/wit/workitems/$${encoded}?api-version=7.1`,patch);
}
async function createHierarchy(plan) {
  const created=[];
  const epic=await createWorkItem('Epic',plan.epic.title,null,{description:plan.summary});
  created.push({type:'Epic',id:epic.id,title:epic.fields?.['System.Title']||plan.epic.title});
  for(const f of plan.epic.features){
    const fi=await createWorkItem('Feature',f.title,epic.id);
    created.push({type:'Feature',id:fi.id,title:f.title});
    for(const s of f.stories){
      const si=await createWorkItem('User Story',s.title,fi.id,{acceptanceCriteria:s.acceptanceCriteria});
      created.push({type:'User Story',id:si.id,title:s.title});
      for(const t of s.tasks){
        const ti=await createWorkItem('Task',t.title,si.id);
        created.push({type:'Task',id:ti.id,title:t.title});
      }
    }
  }
  return created;
}

const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(req.method==='GET' && url.pathname==='/api/health') return send(res,200,{ok:true,version:'2.0.0',mode:azdoConfigured()?'AZURE_DEVOPS':'DEMO'});
    if(req.method==='GET' && url.pathname==='/api/state') return send(res,200,getState());
    if(req.method==='GET' && url.pathname==='/api/config') return send(res,200,{azureDevOpsConfigured:azdoConfigured(),organization:process.env.AZDO_ORG||'',project:process.env.AZDO_PROJECT||''});
    if(req.method==='POST' && url.pathname==='/api/plan'){
      const b=await readBody(req); if(!b.prompt) return send(res,400,{error:'prompt is required'});
      return send(res,200,generatePlan(b.prompt));
    }
    if(req.method==='POST' && url.pathname==='/api/approve-plan'){
      const b=await readBody(req); if(!b.plan) return send(res,400,{error:'plan is required'});
      if(!azdoConfigured()){
        const simulated=flatten(b.plan).map((x,i)=>({...x,id:1000+i+1,result:'SIMULATED'}));
        return send(res,200,{mode:'DEMO',message:'Approval recorded. Azure DevOps is not configured, so creation was simulated.',created:simulated});
      }
      const created=await createHierarchy(b.plan);
      return send(res,200,{mode:'AZURE_DEVOPS',message:'Approved hierarchy created in Azure DevOps.',created});
    }
    if(req.method==='POST' && url.pathname==='/api/meeting'){
      const b=await readBody(req);
      const s=getState(); s.meetings.unshift({title:b.title||'Project Discussion',when:b.when||'Tomorrow, 11:00 AM',attendees:b.attendees||'PM, Product Owner, Technical Lead'});
      saveState(s); return send(res,200,{ok:true,meeting:s.meetings[0],agenda:['Review sprint health','Review blocked and overdue items','Discuss decisions and risks','Confirm DevOps updates','Agree next steps']});
    }
    if(req.method==='POST' && url.pathname==='/api/discussion'){
      const b=await readBody(req); const notes=b.notes||'';
      const lines=notes.split(/[.\n]+/).map(x=>x.trim()).filter(Boolean);
      const decisions=lines.filter(x=>/approved|agreed|decided|defer|phase 2/i.test(x));
      const risks=lines.filter(x=>/risk|pending|delay|blocked|security/i.test(x));
      const actions=lines.filter(x=>/\bwill\b|by friday|by monday|complete|develop|configure|test/i.test(x));
      const s=getState(); s.discussion=[...decisions,...actions,...risks].slice(0,8); saveState(s);
      return send(res,200,{decisions,actions,risks,proposedDevOpsChanges:actions.map(x=>`Create/Update task: ${x}`)});
    }
    if(req.method==='POST' && url.pathname==='/api/mom'){
      const b=await readBody(req); const s=getState();
      return send(res,200,{title:`MOM - ${s.project.name}`,content:`Meeting Objective\nProject delivery review\n\nDiscussion Summary\n${(b.notes||s.discussion.join('. '))}\n\nDecisions / Actions / Risks\n${s.discussion.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nNext Steps\nReview approved Azure DevOps changes and track them in the next sprint.`});
    }
    if(req.method==='POST' && url.pathname==='/api/handover'){
      const s=getState();
      return send(res,200,{status:'Conditionally Ready',blockers:['Support owner is not documented','Security review evidence is pending','One operational risk remains open'],document:`PROJECT HANDOVER DOCUMENT\n\nProject: ${s.project.name}\nStatus: Conditionally Ready\n\n1. Executive Summary\n${s.project.name} is prepared for controlled handover subject to closure of the listed blockers.\n\n2. Delivered Scope\nCore project delivery capabilities recorded in the project dashboard.\n\n3. Outstanding Items\n- Support owner is not documented\n- Security review evidence is pending\n- One operational risk remains open\n\n4. Handover Checklist\n- Delivery status reviewed\n- Known risks recorded\n- Operational ownership: INFORMATION REQUIRED BEFORE HANDOVER\n- Security evidence: INFORMATION REQUIRED BEFORE HANDOVER\n\n5. Sign-off\nProject Manager: __________\nProduct Owner: __________\nOperations Owner: __________`});
    }

    let file=url.pathname==='/'?'index.html':url.pathname.slice(1);
    const fp=path.normalize(path.join(PUBLIC,file));
    if(!fp.startsWith(PUBLIC) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return send(res,404,'Not found','text/plain');
    const ext=path.extname(fp); const types={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json'};
    return send(res,200,fs.readFileSync(fp),types[ext]||'application/octet-stream');
  } catch(e){ console.error(e); return send(res,500,{error:e.message}); }
});
server.listen(PORT,()=>console.log(`ProjectPilot AI MVP Phase 2 running at http://localhost:${PORT}\nMode: ${azdoConfigured()?'AZURE_DEVOPS':'DEMO'}`));
