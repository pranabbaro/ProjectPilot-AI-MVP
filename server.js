
const http=require('http');
const https=require('https');
const fs=require('fs');
const path=require('path');

const PORT=Number(process.env.PORT||7071);
const HOST=process.env.HOST||'0.0.0.0';
const PUBLIC=path.join(__dirname,'public');

function send(res,status,body,type='application/json'){
  res.writeHead(status,{
    'Content-Type':type,
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'Content-Type, Authorization',
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS'
  });
  res.end(type.includes('json')?JSON.stringify(body):body);
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let d='';
    req.on('data',c=>{
      d+=c;
      if(d.length>20*1024*1024){reject(Error('Request body too large'));req.destroy();}
    });
    req.on('end',()=>{
      try{resolve(d?JSON.parse(d):{})}
      catch{reject(Error('Invalid JSON body'))}
    });
    req.on('error',reject);
  });
}
function titleCase(s){return String(s||'').replace(/\w\S*/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase())}
function inferProjectName(q){
  const m=String(q||'').match(/(?:build|create|plan|implement|migrate|deploy)\s+(?:an?\s+)?(.+?)(?:\s+(?:where|that|with|including|from|for|to)\b|[.,]|$)/i);
  return m?titleCase(m[1]).slice(0,100):'New Project';
}
function fallbackPlan(q){
  const n=inferProjectName(q);
  return {projectName:n,projectObjective:q,estimatedSprints:4,status:'DRAFT',source:'PROJECT_COMMAND_CENTER',
    epic:{title:n,features:[
      {title:'Discovery and Planning',userStories:[{title:'Define delivery requirements',acceptanceCriteria:['Project scope is documented','Stakeholders approve delivery requirements'],recommendedSprint:'Sprint 1',dependencies:[],tasks:[{title:'Confirm project scope'},{title:'Document requirements'},{title:'Review technical dependencies'}]}]},
      {title:'Implementation',userStories:[{title:'Deliver the core solution',acceptanceCriteria:['Core solution is implemented','Functional validation is completed'],recommendedSprint:'Sprint 2',dependencies:['Discovery and Planning'],tasks:[{title:'Implement core solution'},{title:'Perform functional testing'},{title:'Resolve implementation findings'}]}]},
      {title:'Handover and Closure',userStories:[{title:'Complete operational handover',acceptanceCriteria:['Handover documentation is complete','Operations accepts the handover'],recommendedSprint:'Sprint 4',dependencies:['Implementation'],tasks:[{title:'Prepare handover documentation'},{title:'Complete knowledge transfer'},{title:'Obtain project sign-off'}]}]}
    ]},risks:[]};
}
function normalizePlan(b){
  if(b.plan)b=b.plan;
  const q=b.project_requirement||b.projectRequirement||'';
  if(!b.epic&&!b.features)return fallbackPlan(q||'Create a new project');
  const e=b.epic||{title:b.projectName||'New Project',features:b.features||[]};
  return {
    projectName:b.projectName||e.title||inferProjectName(q),
    projectObjective:b.projectObjective||q||'',
    estimatedSprints:b.estimatedSprints||4,status:'DRAFT',source:'MOVEWORKS_AI',
    epic:{title:e.title||b.projectName,features:(e.features||[]).map(f=>({
      title:f.title||f.name||'Untitled Feature',
      userStories:(f.userStories||f.user_stories||f.stories||[]).map(s=>({
        title:s.title||s.name||'Untitled User Story',
        acceptanceCriteria:Array.isArray(s.acceptanceCriteria||s.acceptance_criteria)?(s.acceptanceCriteria||s.acceptance_criteria):[],
        recommendedSprint:s.recommendedSprint||s.recommended_sprint||'',
        dependencies:Array.isArray(s.dependencies)?s.dependencies:[],
        tasks:(s.tasks||[]).map(t=>typeof t==='string'?{title:t}:{title:t.title||t.name||'Untitled Task'})
      }))
    }))},
    risks:Array.isArray(b.risks)?b.risks:[]
  };
}

function azdoConfigured(){
  return !!(process.env.AZDO_ORG&&process.env.AZDO_PROJECT&&process.env.AZDO_PAT);
}
function azdoBase(){return `/${encodeURIComponent(process.env.AZDO_ORG)}/${encodeURIComponent(process.env.AZDO_PROJECT)}`}
function azdoReq(method,apiPath,payload,contentType='application/json'){
  return new Promise((resolve,reject)=>{
    const data=payload==null?'':JSON.stringify(payload);
    const auth=Buffer.from(':'+process.env.AZDO_PAT).toString('base64');
    const headers={Authorization:`Basic ${auth}`,Accept:'application/json'};
    if(data){headers['Content-Type']=contentType;headers['Content-Length']=Buffer.byteLength(data)}
    const r=https.request({hostname:'dev.azure.com',path:`${azdoBase()}${apiPath}`,method,headers},resp=>{
      let raw='';resp.on('data',c=>raw+=c);resp.on('end',()=>{
        let out={};try{out=raw?JSON.parse(raw):{}}catch{out={raw}}
        if(resp.statusCode>=200&&resp.statusCode<300)resolve(out);
        else reject(Error(`Azure DevOps ${resp.statusCode}: ${raw.slice(0,1000)}`));
      });
    });
    r.on('error',reject);if(data)r.write(data);r.end();
  });
}
async function queryAllWorkItems(){
  const wiql={query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`};
  const q=await azdoReq('POST',`/_apis/wit/wiql?$top=${Number(process.env.AZDO_DASHBOARD_TOP||500)}&api-version=7.1`,wiql);
  const ids=(q.workItems||[]).map(x=>x.id);
  if(!ids.length)return [];

  const fields=[
    'System.Id','System.Title','System.WorkItemType','System.State','System.AssignedTo',
    'System.IterationPath','System.AreaPath','System.Tags','System.Description','System.ChangedDate',
    'Microsoft.VSTS.Common.AcceptanceCriteria','Microsoft.VSTS.Scheduling.StartDate','Microsoft.VSTS.Scheduling.FinishDate'
  ].join(',');

  const chunks=[];
  for(let i=0;i<ids.length;i+=200)chunks.push(ids.slice(i,i+200));
  const out=[];
  for(const chunk of chunks){
    const data=await azdoReq('GET',`/_apis/wit/workitems?ids=${chunk.join(',')}&fields=${encodeURIComponent(fields)}&api-version=7.1`);
    for(const w of data.value||[]){
      const f=w.fields||{};
      out.push({
        id:w.id,
        title:f['System.Title']||'',
        type:f['System.WorkItemType']||'',
        state:f['System.State']||'',
        assignedTo:f['System.AssignedTo']?.displayName||f['System.AssignedTo']||'',
        iteration:f['System.IterationPath']||'',
        area:f['System.AreaPath']||'',
        tags:f['System.Tags']||'',
        description:f['System.Description']||'',
        acceptanceCriteria:f['Microsoft.VSTS.Common.AcceptanceCriteria']||'',
        startDate:f['Microsoft.VSTS.Scheduling.StartDate']||'',
        finishDate:f['Microsoft.VSTS.Scheduling.FinishDate']||'',
        changedDate:f['System.ChangedDate']||''
      });
    }
  }
  return out;
}
function complianceFor(w){
  const type=String(w.type||'').toLowerCase();
  const checks={
    tags:!!String(w.tags||'').trim(),
    sprint:!!String(w.iteration||'').trim(),
    description:!!String(w.description||'').replace(/<[^>]*>/g,'').trim(),
    assignee:!!String(w.assignedTo||'').trim(),
    dates:!!(w.startDate||w.finishDate),
    acceptance:true
  };
  // Acceptance Criteria is expected for User Story/PBI; not required for task/feature/epic.
  if(type.includes('story')||type.includes('backlog item'))checks.acceptance=!!String(w.acceptanceCriteria||'').replace(/<[^>]*>/g,'').trim();

  const applicable=['tags','sprint','description','assignee'];
  if(type.includes('story')||type.includes('backlog item'))applicable.push('acceptance');
  // Date compliance: we consider presence of iteration path sufficient for task/feature unless explicit start/finish fields exist.
  if(type==='epic'||type==='feature')applicable.push('dates');

  const passed=applicable.filter(k=>checks[k]).length;
  const score=Math.round((passed/applicable.length)*100);
  return {...checks,score,compliant:score===100};
}
function buildCompliance(items){
  const rows=items.map(w=>({...w,compliance:complianceFor(w)}));
  const overall=rows.length?Math.round(rows.reduce((s,x)=>s+x.compliance.score,0)/rows.length):0;
  const nonCompliant=rows.filter(x=>!x.compliance.compliant).length;
  const typeCounts={};
  for(const x of rows)typeCounts[x.type]=(typeCounts[x.type]||0)+1;
  return {overall,nonCompliant,total:rows.length,typeCounts,items:rows};
}
function extractDiscussion(notes){
  const text=String(notes||'').trim();
  const sentences=text.split(/(?<=[.!?])\s+|\n+/).map(x=>x.trim()).filter(Boolean);
  const decisions=[],actions=[],risks=[],requirements=[];
  for(const s of sentences){
    const l=s.toLowerCase();
    if(/approved|agreed|decided|confirmed|deferred|will be included/.test(l))decisions.push({title:s});
    if(/\bwill\b|action|coordinate|validate|review|complete|prepare|follow up|schedule|confirm|pmo/.test(l))actions.push({title:s,owner:'PMO',suggestedType:'Task'});
    if(/risk|may delay|could delay|impact|blocked|pending|dependency|concern/.test(l))risks.push({title:s});
    if(/must|should|requires|requirement|needs to|need to|feature/.test(l))requirements.push({title:s,suggestedType:'User Story'});
  }
  return {summary:sentences.slice(0,5).join(' '),decisions,actions,risks,requirements};
}
function buildMOM(notes){
  const a=extractDiscussion(notes);
  return {
    title:'Minutes of Meeting',
    generatedAt:new Date().toISOString(),
    discussionSummary:a.summary,
    decisions:a.decisions,
    actions:a.actions,
    risks:a.risks,
    requirements:a.requirements,
    nextSteps:[
      ...a.actions.map(x=>x.title),
      ...a.requirements.map(x=>`Review requirement: ${x.title}`)
    ].slice(0,8)
  };
}
function patchField(p,v){return {op:'add',path:p,value:v}}
async function createWorkItem(type,title,parentId,extra={}){
  const patch=[
    patchField('/fields/System.Title',title),
    patchField('/fields/System.Tags',extra.tags||'Project-Command-Center;PM-Approved')
  ];
  if(extra.description)patch.push(patchField('/fields/System.Description',extra.description));
  if(process.env.AZDO_AREA)patch.push(patchField('/fields/System.AreaPath',process.env.AZDO_AREA));
  if(extra.iteration||process.env.AZDO_ITERATION)patch.push(patchField('/fields/System.IterationPath',extra.iteration||process.env.AZDO_ITERATION));
  if(extra.assignedTo)patch.push(patchField('/fields/System.AssignedTo',extra.assignedTo));
  if(parentId)patch.push({op:'add',path:'/relations/-',value:{rel:'System.LinkTypes.Hierarchy-Reverse',url:`https://dev.azure.com/${process.env.AZDO_ORG}/_apis/wit/workItems/${parentId}`}});
  return azdoReq('POST',`/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,patch,'application/json-patch+json');
}
async function createHierarchy(plan){
  const storyType=process.env.AZDO_STORY_TYPE||'User Story';
  const out=[];
  const epic=await createWorkItem('Epic',plan.epic.title,null,{description:plan.projectObjective});
  out.push({type:'Epic',id:epic.id,title:plan.epic.title});
  for(const f of plan.epic.features||[]){
    const fi=await createWorkItem('Feature',f.title,epic.id);out.push({type:'Feature',id:fi.id,title:f.title});
    for(const s of f.userStories||[]){
      const si=await createWorkItem(storyType,s.title,fi.id,{description:(s.acceptanceCriteria||[]).join('<br>')});out.push({type:storyType,id:si.id,title:s.title});
      for(const t of s.tasks||[]){const ti=await createWorkItem('Task',t.title,si.id);out.push({type:'Task',id:ti.id,title:t.title})}
    }
  }
  return out;
}

function graphConfigured(){return !!(process.env.GRAPH_TENANT_ID&&process.env.GRAPH_CLIENT_ID&&process.env.GRAPH_CLIENT_SECRET&&process.env.SHAREPOINT_SITE_ID&&process.env.SHAREPOINT_DRIVE_ID)}
function tokenRequest(){
  return new Promise((resolve,reject)=>{
    const body=new URLSearchParams({
      client_id:process.env.GRAPH_CLIENT_ID,
      client_secret:process.env.GRAPH_CLIENT_SECRET,
      scope:'https://graph.microsoft.com/.default',
      grant_type:'client_credentials'
    }).toString();
    const r=https.request({
      hostname:'login.microsoftonline.com',
      path:`/${encodeURIComponent(process.env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`,
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded','Content-Length':Buffer.byteLength(body)}
    },resp=>{let raw='';resp.on('data',c=>raw+=c);resp.on('end',()=>{let j={};try{j=JSON.parse(raw)}catch{};if(resp.statusCode>=200&&resp.statusCode<300&&j.access_token)resolve(j.access_token);else reject(Error(`Graph token error ${resp.statusCode}: ${raw.slice(0,600)}`))})});
    r.on('error',reject);r.write(body);r.end();
  });
}
async function uploadSharePoint(filename,base64){
  if(!graphConfigured())throw Error('SharePoint integration is not configured.');
  const token=await tokenRequest();
  const buf=Buffer.from(base64,'base64');
  if(buf.length>10*1024*1024)throw Error('MVP upload limit is 10 MB.');
  const folder=(process.env.SHAREPOINT_FOLDER_PATH||'Project Command Center').replace(/^\/+|\/+$/g,'');
  const fullPath=`${folder}/${filename}`.split('/').map(encodeURIComponent).join('/');
  return new Promise((resolve,reject)=>{
    const r=https.request({
      hostname:'graph.microsoft.com',
      path:`/v1.0/sites/${encodeURIComponent(process.env.SHAREPOINT_SITE_ID)}/drives/${encodeURIComponent(process.env.SHAREPOINT_DRIVE_ID)}/root:/${fullPath}:/content`,
      method:'PUT',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/octet-stream','Content-Length':buf.length}
    },resp=>{let raw='';resp.on('data',c=>raw+=c);resp.on('end',()=>{let j={};try{j=raw?JSON.parse(raw):{}}catch{};if(resp.statusCode>=200&&resp.statusCode<300)resolve(j);else reject(Error(`SharePoint ${resp.statusCode}: ${raw.slice(0,700)}`))})});
    r.on('error',reject);r.write(buf);r.end();
  });
}
async function uploadDevOpsRepo(filename,base64){
  if(!azdoConfigured()||!process.env.AZDO_REPO_ID)throw Error('Azure DevOps repository integration is not configured.');
  const branch=process.env.AZDO_REPO_BRANCH||'refs/heads/main';
  const refName=branch.replace(/^refs\/heads\//,'');
  const refs=await azdoReq('GET',`/_apis/git/repositories/${encodeURIComponent(process.env.AZDO_REPO_ID)}/refs?filter=heads/${encodeURIComponent(refName)}&api-version=7.1`);
  const ref=(refs.value||[])[0];
  if(!ref)throw Error(`Branch ${branch} not found.`);
  const folder=(process.env.AZDO_REPO_FOLDER_PATH||'project-documents').replace(/^\/+|\/+$/g,'');
  const itemPath=`/${folder}/${filename}`;
  const payload={
    refUpdates:[{name:branch,oldObjectId:ref.objectId}],
    commits:[{
      comment:`Upload ${filename} from Project Command Center`,
      changes:[{
        changeType:'add',
        item:{path:itemPath},
        newContent:{content:base64,contentType:'base64encoded'}
      }]
    }]
  };
  return azdoReq('POST',`/_apis/git/repositories/${encodeURIComponent(process.env.AZDO_REPO_ID)}/pushes?api-version=7.1`,payload);
}


function adobeConfigured(){
  return !!(process.env.ADOBE_SIGN_ACCESS_TOKEN&&process.env.ADOBE_SIGN_API_BASE);
}
function adobeBase(){
  const u=new URL(process.env.ADOBE_SIGN_API_BASE);
  return {hostname:u.hostname,basePath:u.pathname.replace(/\/+$/,'')};
}
function adobeJson(method,apiPath,payload){
  return new Promise((resolve,reject)=>{
    const base=adobeBase();
    const data=payload==null?'':JSON.stringify(payload);
    const headers={
      Authorization:`Bearer ${process.env.ADOBE_SIGN_ACCESS_TOKEN}`,
      Accept:'application/json'
    };
    if(data){
      headers['Content-Type']='application/json';
      headers['Content-Length']=Buffer.byteLength(data);
    }
    const r=https.request({
      hostname:base.hostname,
      path:`${base.basePath}${apiPath}`,
      method,
      headers
    },resp=>{
      let raw='';
      resp.on('data',c=>raw+=c);
      resp.on('end',()=>{
        let out={};
        try{out=raw?JSON.parse(raw):{}}
        catch{out={raw}}
        if(resp.statusCode>=200&&resp.statusCode<300)resolve(out);
        else reject(Error(`Adobe Sign ${resp.statusCode}: ${raw.slice(0,1000)}`));
      });
    });
    r.on('error',reject);
    if(data)r.write(data);
    r.end();
  });
}
function adobeBinary(method,apiPath){
  return new Promise((resolve,reject)=>{
    const base=adobeBase();
    const r=https.request({
      hostname:base.hostname,
      path:`${base.basePath}${apiPath}`,
      method,
      headers:{
        Authorization:`Bearer ${process.env.ADOBE_SIGN_ACCESS_TOKEN}`,
        Accept:'application/pdf'
      }
    },resp=>{
      const chunks=[];
      resp.on('data',c=>chunks.push(c));
      resp.on('end',()=>{
        const buf=Buffer.concat(chunks);
        if(resp.statusCode>=200&&resp.statusCode<300)resolve(buf);
        else reject(Error(`Adobe Sign ${resp.statusCode}: ${buf.toString('utf8').slice(0,800)}`));
      });
    });
    r.on('error',reject);
    r.end();
  });
}
function adobeUploadTransient(filename,buffer){
  return new Promise((resolve,reject)=>{
    const boundary='----ProjectCommandCenter'+Date.now().toString(16);
    const head=Buffer.from(
      `--${boundary}\r\n`+
      `Content-Disposition: form-data; name="File"; filename="${filename.replace(/"/g,'')}"\r\n`+
      `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
    );
    const tail=Buffer.from(`\r\n--${boundary}--\r\n`);
    const body=Buffer.concat([head,buffer,tail]);
    const base=adobeBase();
    const r=https.request({
      hostname:base.hostname,
      path:`${base.basePath}/transientDocuments`,
      method:'POST',
      headers:{
        Authorization:`Bearer ${process.env.ADOBE_SIGN_ACCESS_TOKEN}`,
        'Content-Type':`multipart/form-data; boundary=${boundary}`,
        'Content-Length':body.length,
        Accept:'application/json'
      }
    },resp=>{
      let raw='';
      resp.on('data',c=>raw+=c);
      resp.on('end',()=>{
        let out={};
        try{out=raw?JSON.parse(raw):{}}
        catch{}
        if(resp.statusCode>=200&&resp.statusCode<300&&out.transientDocumentId)resolve(out);
        else reject(Error(`Adobe Sign transient document ${resp.statusCode}: ${raw.slice(0,1000)}`));
      });
    });
    r.on('error',reject);
    r.write(body);
    r.end();
  });
}
async function adobeSendAgreement(filename,buffer,agreementName,signers){
  const transient=await adobeUploadTransient(filename,buffer);
  const participantSetsInfo=(signers||[]).map((s,i)=>({
    memberInfos:[{email:s.email}],
    order:i+1,
    role:'SIGNER',
    name:s.name||s.email
  }));
  if(!participantSetsInfo.length)throw Error('At least one signer is required.');
  return adobeJson('POST','/agreements',{
    fileInfos:[{transientDocumentId:transient.transientDocumentId}],
    name:agreementName,
    participantSetsInfo,
    signatureType:'ESIGN',
    state:'IN_PROCESS',
    message:'Please review and digitally sign the project handover document.'
  });
}
function standardHandoverChecklist(){
  return [
    {id:'documentMetadata',label:'Document metadata completed (Document ID, file name/location, version, status, author, effective date)',required:true},
    {id:'revisionHistory',label:'Revision history completed',required:true},
    {id:'businessUseCase',label:'Business Use Case / Description completed',required:true},
    {id:'capIseq',label:'ITCCS / CAP rating and ISEQ review completed',required:true},
    {id:'interfaces',label:'Application interfaces and data flows documented',required:true},
    {id:'backup',label:'Backup requirements, RTO and RPO documented',required:true},
    {id:'stakeholders',label:'Stakeholders, demand/environment profile and contacts completed',required:true},
    {id:'cloudArchitecture',label:'Cloud network topology / architecture documented',required:true},
    {id:'physicalNetwork',label:'Physical network / firewall topology documented',required:true},
    {id:'authentication',label:'Authentication design completed',required:true},
    {id:'authorization',label:'Authorization design completed',required:true},
    {id:'networkResources',label:'Network zone and deployed resources documented',required:true},
    {id:'encryption',label:'Encryption for data in transit / at rest / backups documented',required:true},
    {id:'supportingDocs',label:'Supporting architecture/operations documents attached or linked',required:true}
  ];
}
function validateHandoverSubmission(b){
  const required=standardHandoverChecklist().filter(x=>x.required).map(x=>x.id);
  const completed=new Set((b.completedSections||[]).map(String));
  const missing=required.filter(x=>!completed.has(x));
  if(!b.architectName)missing.push('architectName');
  if(!b.projectName)missing.push('projectName');
  if(!b.completedDocumentBase64)missing.push('completedDocument');
  return missing;
}

function serve(p,res){
  const rel=p==='/'?'index.html':p.replace(/^\/+/,'');
  const fp=path.normalize(path.join(PUBLIC,rel));
  if(!fp.startsWith(PUBLIC)||!fs.existsSync(fp))return send(res,404,{error:'Not found'});
  const ext=path.extname(fp).toLowerCase(),types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
  return send(res,200,fs.readFileSync(fp),types[ext]||'application/octet-stream');
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS')return send(res,204,'','text/plain');
    const u=new URL(req.url,`http://${req.headers.host}`);

    if(req.method==='GET'&&u.pathname==='/api/health')return send(res,200,{ok:true,version:'4.1.0',azureDevOpsConfigured:azdoConfigured(),sharePointConfigured:graphConfigured(),repoUploadConfigured:!!process.env.AZDO_REPO_ID,environment:process.env.WEBSITE_SITE_NAME?'AZURE_APP_SERVICE':'LOCAL_OR_CODESPACES'});
    if(req.method==='GET'&&u.pathname==='/api/devops/status')return send(res,200,{configured:azdoConfigured(),organization:process.env.AZDO_ORG||'',project:process.env.AZDO_PROJECT||''});
    if(req.method==='GET'&&u.pathname==='/api/devops/work-items'){if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured.'});return send(res,200,{items:await queryAllWorkItems()})}
    if(req.method==='GET'&&u.pathname==='/api/devops/compliance'){if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured.'});return send(res,200,buildCompliance(await queryAllWorkItems()))}
    if(req.method==='POST'&&u.pathname==='/api/ai-plan'){const b=await readBody(req);return send(res,200,normalizePlan(b))}
    if(req.method==='POST'&&u.pathname==='/api/approve-plan'){const b=await readBody(req);if(b.approved!==true)return send(res,400,{error:'Explicit PM approval is required.'});if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured.'});return send(res,200,{created:await createHierarchy(b.plan),message:'Created in Azure DevOps.'})}
    if(req.method==='POST'&&u.pathname==='/api/discussion-summary'){const b=await readBody(req);if(!b.discussion_notes&&!b.notes)return send(res,400,{error:'discussion_notes is required'});return send(res,200,extractDiscussion(b.discussion_notes||b.notes))}
    if(req.method==='POST'&&u.pathname==='/api/mom'){const b=await readBody(req);if(!b.discussion_notes&&!b.notes)return send(res,400,{error:'discussion_notes is required'});return send(res,200,buildMOM(b.discussion_notes||b.notes))}
    if(req.method==='POST'&&u.pathname==='/api/devops/create-discussion-item'){
      const b=await readBody(req);if(b.approved!==true)return send(res,400,{error:'Explicit PM approval is required.'});if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured.'});
      const type=b.itemType==='User Story'?(process.env.AZDO_STORY_TYPE||'User Story'):'Task';
      const wi=await createWorkItem(type,b.title,null,{description:`Created from call discussion.<br><b>Owner:</b> PMO`,assignedTo:process.env.AZDO_PMO_ASSIGNEE||''});
      return send(res,200,{item:{id:wi.id,title:b.title,type,state:wi.fields?.['System.State']||'New'}});
    }
    if(req.method==='GET'&&u.pathname==='/api/documents/status')return send(res,200,{sharePointConfigured:graphConfigured(),devOpsRepoConfigured:!!(azdoConfigured()&&process.env.AZDO_REPO_ID),sharePointFolder:process.env.SHAREPOINT_FOLDER_PATH||'',devOpsRepoFolder:process.env.AZDO_REPO_FOLDER_PATH||''});
    if(req.method==='POST'&&u.pathname==='/api/documents/upload'){
      const b=await readBody(req);if(!b.filename||!b.contentBase64||!b.destination)return send(res,400,{error:'filename, contentBase64 and destination are required'});
      if(b.destination==='sharepoint'){const r=await uploadSharePoint(b.filename,b.contentBase64);return send(res,200,{message:'Uploaded to SharePoint.',name:r.name||b.filename,webUrl:r.webUrl||''})}
      if(b.destination==='devops'){const r=await uploadDevOpsRepo(b.filename,b.contentBase64);return send(res,200,{message:'Uploaded to Azure DevOps repository.',pushId:r.pushId||'',filename:b.filename})}
      return send(res,400,{error:'Unsupported destination'});
    }
    
    if(req.method==='GET'&&u.pathname==='/api/handover/status'){
      return send(res,200,{
        templateUrl:'/templates/Handover.docx',
        adobeSignConfigured:adobeConfigured(),
        sharePointConfigured:graphConfigured(),
        checklist:standardHandoverChecklist()
      });
    }

    if(req.method==='POST'&&u.pathname==='/api/handover/submit'){
      const b=await readBody(req);
      const missing=validateHandoverSubmission(b);
      if(missing.length)return send(res,400,{error:'Handover submission is incomplete.',missing});

      const buf=Buffer.from(b.completedDocumentBase64,'base64');
      if(buf.length>10*1024*1024)return send(res,400,{error:'MVP handover upload limit is 10 MB.'});

      let archive=null;
      if(graphConfigured()){
        archive=await uploadSharePoint(
          b.completedDocumentName||'Handover.docx',
          b.completedDocumentBase64
        );
      }

      return send(res,200,{
        workflowStatus:'SUBMITTED_TO_PM',
        submittedAt:new Date().toISOString(),
        architectName:b.architectName,
        projectName:b.projectName,
        pmName:b.pmName||'',
        archivedToSharePoint:!!archive,
        sharePointWebUrl:archive?.webUrl||''
      });
    }

    if(req.method==='POST'&&u.pathname==='/api/handover/send-for-signature'){
      const b=await readBody(req);
      if(b.pmApproved!==true)return send(res,400,{error:'PM approval is required before sending for signature.'});
      if(!adobeConfigured())return send(res,503,{error:'Adobe Acrobat Sign is not configured.'});
      if(!b.documentBase64||!b.documentName)return send(res,400,{error:'Signed workflow requires documentBase64 and documentName.'});
      if(!Array.isArray(b.signers)||!b.signers.length)return send(res,400,{error:'At least one stakeholder signer is required.'});

      const invalid=b.signers.filter(x=>!x.email||!String(x.email).includes('@'));
      if(invalid.length)return send(res,400,{error:'Every signer must have a valid email address.'});

      const agreement=await adobeSendAgreement(
        b.documentName,
        Buffer.from(b.documentBase64,'base64'),
        b.agreementName||`${b.projectName||'Project'} - Handover Approval`,
        b.signers
      );

      return send(res,200,{
        workflowStatus:'SIGNATURE_IN_PROGRESS',
        agreementId:agreement.id,
        sentAt:new Date().toISOString()
      });
    }

    if(req.method==='GET'&&u.pathname==='/api/handover/adobe-status'){
      if(!adobeConfigured())return send(res,503,{error:'Adobe Acrobat Sign is not configured.'});
      const id=u.searchParams.get('agreementId');
      if(!id)return send(res,400,{error:'agreementId is required'});
      const agreement=await adobeJson('GET',`/agreements/${encodeURIComponent(id)}`);
      return send(res,200,{
        agreementId:id,
        status:agreement.status||agreement.state||'UNKNOWN',
        name:agreement.name||'',
        raw:agreement
      });
    }

    if(req.method==='POST'&&u.pathname==='/api/handover/archive-signed'){
      const b=await readBody(req);
      if(!adobeConfigured())return send(res,503,{error:'Adobe Acrobat Sign is not configured.'});
      if(!graphConfigured())return send(res,503,{error:'SharePoint is not configured.'});
      if(!b.agreementId)return send(res,400,{error:'agreementId is required'});
      const pdf=await adobeBinary('GET',`/agreements/${encodeURIComponent(b.agreementId)}/combinedDocument`);
      const filename=b.filename||'Signed-Handover.pdf';
      const archive=await uploadSharePoint(filename,pdf.toString('base64'));
      return send(res,200,{
        workflowStatus:'COMPLETED',
        message:'Signed handover archived to SharePoint.',
        filename,
        webUrl:archive.webUrl||''
      });
    }


    return serve(u.pathname,res);
  }catch(e){console.error(e);return send(res,500,{error:e.message||'Internal server error'})}
});
server.listen(PORT,HOST,()=>console.log(`Project Command Center v4.1 running on ${HOST}:${PORT}`));
