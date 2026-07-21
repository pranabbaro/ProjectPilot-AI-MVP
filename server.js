
const http=require('http');
const fs=require('fs');
const path=require('path');
const https=require('https');

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
      if(d.length>1024*1024){reject(Error('Request body too large'));req.destroy();}
    });
    req.on('end',()=>{
      try{resolve(d?JSON.parse(d):{})}
      catch{reject(Error('Invalid JSON body'))}
    });
    req.on('error',reject);
  });
}

function titleCase(s){
  return String(s||'').replace(/\w\S*/g,w=>w[0].toUpperCase()+w.slice(1).toLowerCase());
}
function inferProjectName(q){
  const m=String(q||'').match(/(?:build|create|plan|implement|migrate|deploy)\s+(?:an?\s+)?(.+?)(?:\s+(?:where|that|with|including|from|for|to)\b|[.,]|$)/i);
  return m?titleCase(m[1]).slice(0,100):'New Project';
}
function fallbackPlan(q){
  const n=inferProjectName(q);
  return {
    projectName:n,projectObjective:q,estimatedSprints:4,status:'DRAFT',source:'PROJECT_COMMAND_CENTER',
    epic:{title:n,features:[
      {title:'Discovery and Planning',userStories:[{title:'Define delivery requirements',acceptanceCriteria:['Project scope is documented','Stakeholders approve delivery requirements'],recommendedSprint:'Sprint 1',dependencies:[],tasks:[{title:'Confirm project scope'},{title:'Document requirements'},{title:'Review technical dependencies'}]}]},
      {title:'Implementation',userStories:[{title:'Deliver the core solution',acceptanceCriteria:['Core solution is implemented','Functional validation is completed'],recommendedSprint:'Sprint 2',dependencies:['Discovery and Planning'],tasks:[{title:'Implement core solution'},{title:'Perform functional testing'},{title:'Resolve implementation findings'}]}]},
      {title:'Handover and Closure',userStories:[{title:'Complete operational handover',acceptanceCriteria:['Handover documentation is complete','Operations accepts the handover'],recommendedSprint:'Sprint 4',dependencies:['Implementation'],tasks:[{title:'Prepare handover documentation'},{title:'Complete knowledge transfer'},{title:'Obtain project sign-off'}]}]}
    ]},risks:[]
  };
}
function normalizePlan(b){
  if(b.plan)b=b.plan;
  const q=b.project_requirement||b.projectRequirement||'';
  if(!b.epic&&!b.features)return fallbackPlan(q||'Create a new project');
  const e=b.epic||{title:b.projectName||'New Project',features:b.features||[]};
  return {
    projectName:b.projectName||e.title||inferProjectName(q),
    projectObjective:b.projectObjective||q||'',
    estimatedSprints:b.estimatedSprints||4,
    status:'DRAFT',
    source:'MOVEWORKS_AI',
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
function azdoBasePath(){
  return `/${encodeURIComponent(process.env.AZDO_ORG)}/${encodeURIComponent(process.env.AZDO_PROJECT)}`;
}
function azdoRequest(method,apiPath,payload,contentType='application/json'){
  return new Promise((resolve,reject)=>{
    const data=payload===undefined||payload===null?'':JSON.stringify(payload);
    const auth=Buffer.from(':'+process.env.AZDO_PAT).toString('base64');
    const headers={Authorization:`Basic ${auth}`,Accept:'application/json'};
    if(data){
      headers['Content-Type']=contentType;
      headers['Content-Length']=Buffer.byteLength(data);
    }
    const req=https.request({
      hostname:'dev.azure.com',
      path:`${azdoBasePath()}${apiPath}`,
      method,
      headers
    },res=>{
      let raw='';
      res.on('data',c=>raw+=c);
      res.on('end',()=>{
        let parsed={};
        try{parsed=raw?JSON.parse(raw):{}}
        catch{parsed={raw}}
        if(res.statusCode>=200&&res.statusCode<300)resolve(parsed);
        else reject(Error(`Azure DevOps ${res.statusCode}: ${raw.slice(0,900)}`));
      });
    });
    req.on('error',reject);
    if(data)req.write(data);
    req.end();
  });
}

async function queryWorkItems(){
  const top=Math.min(Number(process.env.AZDO_DASHBOARD_TOP||30),100);
  const wiql={
    query:`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.State] <> 'Removed' ORDER BY [System.ChangedDate] DESC`
  };
  const q=await azdoRequest('POST',`/_apis/wit/wiql?$top=${top}&api-version=7.1`,wiql);
  const ids=(q.workItems||[]).map(x=>x.id);
  if(!ids.length)return [];
  const fields=[
    'System.Id','System.Title','System.WorkItemType','System.State',
    'System.AssignedTo','System.IterationPath','System.ChangedDate'
  ].join(',');
  const data=await azdoRequest('GET',`/_apis/wit/workitems?ids=${ids.join(',')}&fields=${encodeURIComponent(fields)}&api-version=7.1`);
  return (data.value||[]).map(w=>({
    id:w.id,
    title:w.fields?.['System.Title']||'',
    type:w.fields?.['System.WorkItemType']||'',
    state:w.fields?.['System.State']||'',
    assignedTo:w.fields?.['System.AssignedTo']?.displayName||w.fields?.['System.AssignedTo']||'',
    iteration:w.fields?.['System.IterationPath']||'',
    changedDate:w.fields?.['System.ChangedDate']||''
  }));
}

function patchField(path,value){return {op:'add',path,value};}
async function createWorkItem(type,title,parentId,extra={}){
  const patch=[
    patchField('/fields/System.Title',title),
    patchField('/fields/System.Tags','Project-Command-Center;PM-Approved')
  ];
  if(process.env.AZDO_AREA)patch.push(patchField('/fields/System.AreaPath',process.env.AZDO_AREA));
  if(extra.iteration||process.env.AZDO_ITERATION)patch.push(patchField('/fields/System.IterationPath',extra.iteration||process.env.AZDO_ITERATION));
  if(extra.description)patch.push(patchField('/fields/System.Description',extra.description));
  if(parentId){
    patch.push({
      op:'add',
      path:'/relations/-',
      value:{
        rel:'System.LinkTypes.Hierarchy-Reverse',
        url:`https://dev.azure.com/${process.env.AZDO_ORG}/_apis/wit/workItems/${parentId}`,
        attributes:{comment:'Linked by Project Command Center after PM approval'}
      }
    });
  }
  return azdoRequest('POST',`/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`,patch,'application/json-patch+json');
}

async function createHierarchy(plan){
  const storyType=process.env.AZDO_STORY_TYPE||'User Story';
  const created=[];
  const epic=await createWorkItem('Epic',plan.epic.title,null,{description:plan.projectObjective||''});
  created.push({type:'Epic',id:epic.id,title:plan.epic.title});

  for(const feature of plan.epic.features||[]){
    const f=await createWorkItem('Feature',feature.title,epic.id);
    created.push({type:'Feature',id:f.id,title:feature.title});

    for(const story of feature.userStories||[]){
      const iteration=story.recommendedSprint && process.env.AZDO_ITERATION_PREFIX
        ? `${process.env.AZDO_ITERATION_PREFIX}\\${story.recommendedSprint}`
        : undefined;
      const desc=(story.acceptanceCriteria||[]).length
        ? `<b>Acceptance Criteria</b><br>${story.acceptanceCriteria.map(x=>String(x)).join('<br>')}`
        : '';
      const s=await createWorkItem(storyType,story.title,f.id,{iteration,description:desc});
      created.push({type:storyType,id:s.id,title:story.title});

      for(const task of story.tasks||[]){
        const t=await createWorkItem('Task',task.title,s.id,{iteration});
        created.push({type:'Task',id:t.id,title:task.title});
      }
    }
  }
  return created;
}


function extractDiscussion(notes){
  const text=String(notes||'').trim();
  if(!text)return {summary:'',decisions:[],actions:[],risks:[],requirements:[]};

  const sentences=text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(x=>x.trim())
    .filter(Boolean);

  const decisions=[],actions=[],risks=[],requirements=[];

  for(const s of sentences){
    const lower=s.toLowerCase();

    if(/approved|agreed|decided|will use|will be included|deferred|moved to phase|confirmed/.test(lower)){
      decisions.push({title:s,source:'Project Discussion'});
    }

    if(/\bwill\b|action|coordinate|validate|review|complete|prepare|follow up|follow-up|schedule|confirm|owner|pm[o0]/.test(lower)){
      actions.push({
        title:s.replace(/^action[:\-\s]*/i,''),
        owner:/pmo/.test(lower)?'PMO':'PMO',
        target:/before sprint\s*\d+/i.test(s)?(s.match(/before sprint\s*\d+/i)||[''])[0]:'',
        source:'Project Discussion',
        suggestedType:'Task'
      });
    }

    if(/risk|may delay|could delay|impact|blocked|pending|dependency|concern|security review/.test(lower)){
      risks.push({title:s,source:'Project Discussion'});
    }

    if(/must|should|requires|requirement|needs to|need to|dashboard should|feature/.test(lower)){
      requirements.push({
        title:s,
        source:'Project Discussion',
        suggestedType:'User Story'
      });
    }
  }

  // de-duplicate by title
  const dedupe = arr => {
    const seen=new Set();
    return arr.filter(x=>{
      const k=(x.title||'').toLowerCase();
      if(seen.has(k))return false;
      seen.add(k);return true;
    });
  };

  const summary=sentences.slice(0,4).join(' ');
  return {
    summary,
    decisions:dedupe(decisions),
    actions:dedupe(actions),
    risks:dedupe(risks),
    requirements:dedupe(requirements)
  };
}

async function createDiscussionWorkItem(payload){
  if(!azdoConfigured())throw Error('Azure DevOps is not configured.');

  const itemType=payload.itemType==='User Story'
    ? (process.env.AZDO_STORY_TYPE||'User Story')
    : 'Task';

  const title=String(payload.title||'').trim();
  if(!title)throw Error('Work item title is required.');

  const parentId=payload.parentId?Number(payload.parentId):null;
  const owner=payload.owner||'PMO';
  const description=[
    payload.description||'',
    `<br><b>Source:</b> ${payload.source||'Project Discussion'}`,
    `<br><b>Owner:</b> ${owner}`,
    payload.target?`<br><b>Target:</b> ${payload.target}`:''
  ].join('');

  const patch=[
    patchField('/fields/System.Title',title),
    patchField('/fields/System.Tags','Project-Command-Center;Project-Discussion;PM-Approved'),
    patchField('/fields/System.Description',description)
  ];

  const assignee=process.env.AZDO_PMO_ASSIGNEE;
  if(assignee){
    patch.push(patchField('/fields/System.AssignedTo',assignee));
  }

  if(process.env.AZDO_AREA){
    patch.push(patchField('/fields/System.AreaPath',process.env.AZDO_AREA));
  }

  if(process.env.AZDO_ITERATION){
    patch.push(patchField('/fields/System.IterationPath',process.env.AZDO_ITERATION));
  }

  if(parentId){
    patch.push({
      op:'add',
      path:'/relations/-',
      value:{
        rel:'System.LinkTypes.Hierarchy-Reverse',
        url:`https://dev.azure.com/${process.env.AZDO_ORG}/_apis/wit/workItems/${parentId}`,
        attributes:{comment:'Linked from Project Discussion by Project Command Center'}
      }
    });
  }

  return azdoRequest(
    'POST',
    `/_apis/wit/workitems/$${encodeURIComponent(itemType)}?api-version=7.1`,
    patch,
    'application/json-patch+json'
  );
}


function serve(p,res){
  const rel=p==='/'?'index.html':p.replace(/^\/+/,'');
  const fp=path.normalize(path.join(PUBLIC,rel));
  if(!fp.startsWith(PUBLIC)||!fs.existsSync(fp))return send(res,404,{error:'Not found'});
  const ext=path.extname(fp).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
  return send(res,200,fs.readFileSync(fp),types[ext]||'application/octet-stream');
}

const server=http.createServer(async(req,res)=>{
  try{
    if(req.method==='OPTIONS')return send(res,204,'','text/plain');
    const u=new URL(req.url,`http://${req.headers.host}`);

    if(req.method==='GET'&&u.pathname==='/api/health'){
      return send(res,200,{
        ok:true,version:'3.3.0',
        mode:azdoConfigured()?'AZURE_DEVOPS':'DEMO',
        environment:process.env.WEBSITE_SITE_NAME?'AZURE_APP_SERVICE':'LOCAL_OR_CODESPACES',
        azureDevOpsConfigured:azdoConfigured()
      });
    }

    if(req.method==='GET'&&u.pathname==='/api/devops/status'){
      return send(res,200,{
        configured:azdoConfigured(),
        organization:process.env.AZDO_ORG||'',
        project:process.env.AZDO_PROJECT||'',
        storyType:process.env.AZDO_STORY_TYPE||'User Story'
      });
    }

    if(req.method==='GET'&&u.pathname==='/api/devops/work-items'){
      if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured in App Service settings.'});
      return send(res,200,{items:await queryWorkItems()});
    }

    if(req.method==='POST'&&u.pathname==='/api/ai-plan'){
      const b=await readBody(req);
      if(!b.project_requirement&&!b.projectRequirement&&!b.plan&&!b.epic&&!b.features)
        return send(res,400,{error:'project_requirement or structured plan is required'});
      return send(res,200,normalizePlan(b));
    }

    
    if(req.method==='POST'&&u.pathname==='/api/discussion-summary'){
      const b=await readBody(req);
      if(!b.discussion_notes&&!b.notes)return send(res,400,{error:'discussion_notes is required'});
      return send(res,200,extractDiscussion(b.discussion_notes||b.notes));
    }

    if(req.method==='POST'&&u.pathname==='/api/devops/create-discussion-item'){
      const b=await readBody(req);
      if(b.approved!==true)return send(res,400,{error:'Explicit PM approval is required.'});
      const created=await createDiscussionWorkItem(b);
      return send(res,200,{
        message:'Discussion item created in Azure DevOps.',
        item:{
          id:created.id,
          title:created.fields?.['System.Title']||b.title,
          type:created.fields?.['System.WorkItemType']||b.itemType,
          state:created.fields?.['System.State']||'New'
        }
      });
    }

if(req.method==='POST'&&u.pathname==='/api/approve-plan'){
      const b=await readBody(req);
      if(!b.plan)return send(res,400,{error:'plan is required'});
      if(b.approved!==true)return send(res,400,{error:'Explicit PM approval is required.'});
      if(!azdoConfigured())return send(res,503,{error:'Azure DevOps is not configured.'});
      const created=await createHierarchy(b.plan);
      return send(res,200,{mode:'AZURE_DEVOPS',message:'Approved hierarchy created in Azure DevOps.',created});
    }

    return serve(u.pathname,res);
  }catch(e){
    console.error(e);
    return send(res,500,{error:e.message||'Internal server error'});
  }
});

server.listen(PORT,HOST,()=>console.log(`Project Command Center v3.3 running on ${HOST}:${PORT}`));
