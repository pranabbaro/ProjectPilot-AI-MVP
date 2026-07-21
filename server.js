const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = Number(process.env.PORT || 7071);
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(contentType.includes('json') ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

function titleCase(value) {
  return String(value || '').replace(/[_-]+/g, ' ').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function inferProjectName(requirement) {
  const text = String(requirement || '');
  const match = text.match(/(?:build|create|plan|implement|migrate|deploy)\s+(?:an?\s+)?(.+?)(?:\s+(?:where|that|with|including|from|for|to)\b|[.,]|$)/i);
  return match && match[1] ? titleCase(match[1]).slice(0, 100) : 'New Project';
}

function fallbackPlan(requirement) {
  const projectName = inferProjectName(requirement);
  return {
    projectName,
    projectObjective: requirement,
    estimatedSprints: 4,
    epic: {
      title: projectName,
      features: [
        { title: 'Discovery and Planning', userStories: [
          { title: 'Define delivery requirements', acceptanceCriteria: ['Project scope is documented','Stakeholders approve the delivery requirements'], recommendedSprint: 'Sprint 1', dependencies: [], tasks: [{title:'Confirm project scope'},{title:'Document requirements'},{title:'Review technical dependencies'}] }
        ]},
        { title: 'Implementation', userStories: [
          { title: 'Deliver the core solution', acceptanceCriteria: ['Core solution is implemented','Functional validation is completed'], recommendedSprint: 'Sprint 2', dependencies: ['Discovery and Planning'], tasks: [{title:'Implement core solution'},{title:'Perform functional testing'},{title:'Resolve implementation findings'}] }
        ]},
        { title: 'Handover and Closure', userStories: [
          { title: 'Complete operational handover', acceptanceCriteria: ['Handover documentation is complete','Operations accepts the handover'], recommendedSprint: 'Sprint 4', dependencies: ['Implementation'], tasks: [{title:'Prepare handover documentation'},{title:'Complete knowledge transfer'},{title:'Obtain project sign-off'}] }
        ]}
      ]
    },
    risks: [],
    status: 'DRAFT',
    source: 'PROJECTPILOT_FALLBACK'
  };
}

function normalizePlan(input) {
  let body = input || {};
  if (body.plan) body = body.plan;
  const requirement = body.project_requirement || body.projectRequirement || '';
  if (!body.epic && !body.features) return fallbackPlan(requirement || 'Create a new project');
  const epic = body.epic || { title: body.projectName || body.project_name || 'New Project', features: body.features || [] };
  const projectName = body.projectName || body.project_name || epic.title || inferProjectName(requirement);
  return {
    projectName,
    projectObjective: body.projectObjective || body.project_objective || requirement || `Deliver ${projectName}`,
    estimatedSprints: body.estimatedSprints || body.estimated_sprints || 4,
    epic: {
      title: epic.title || projectName,
      features: (epic.features || []).map(f => ({
        title: f.title || f.name || 'Untitled Feature',
        userStories: (f.userStories || f.user_stories || f.stories || []).map(s => ({
          title: s.title || s.name || 'Untitled User Story',
          acceptanceCriteria: Array.isArray(s.acceptanceCriteria || s.acceptance_criteria) ? (s.acceptanceCriteria || s.acceptance_criteria) : [String(s.acceptanceCriteria || s.acceptance_criteria || '')].filter(Boolean),
          recommendedSprint: s.recommendedSprint || s.recommended_sprint || '',
          dependencies: Array.isArray(s.dependencies) ? s.dependencies : [],
          tasks: (s.tasks || []).map(t => ({ title: typeof t === 'string' ? t : (t.title || t.name || 'Untitled Task') }))
        }))
      }))
    },
    risks: Array.isArray(body.risks) ? body.risks : [],
    status: 'DRAFT',
    source: 'MOVEWORKS_AI'
  };
}

function azdoConfigured() {
  return Boolean(process.env.AZDO_ORG && process.env.AZDO_PROJECT && process.env.AZDO_PAT);
}

function azdoRequest(method, apiPath, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const auth = Buffer.from(`:${process.env.AZDO_PAT}`).toString('base64');
    const req = https.request({
      hostname: 'dev.azure.com',
      path: `/${encodeURIComponent(process.env.AZDO_ORG)}/${encodeURIComponent(process.env.AZDO_PROJECT)}${apiPath}`,
      method,
      headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'Content-Type': 'application/json-patch+json', 'Content-Length': Buffer.byteLength(body) }
    }, res => {
      let raw='';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let parsed={}; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed={raw}; }
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
        else reject(new Error(`Azure DevOps ${res.statusCode}: ${raw.slice(0,600)}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function createWorkItem(type, title, parentId) {
  const patch = [
    {op:'add',path:'/fields/System.Title',value:title},
    {op:'add',path:'/fields/System.Tags',value:'ProjectPilot-AI;PM-Approved'}
  ];
  if (parentId) patch.push({op:'add',path:'/relations/-',value:{rel:'System.LinkTypes.Hierarchy-Reverse',url:`https://dev.azure.com/${process.env.AZDO_ORG}/_apis/wit/workItems/${parentId}`}});
  return azdoRequest('POST', `/_apis/wit/workitems/$${encodeURIComponent(type)}?api-version=7.1`, patch);
}

async function createHierarchy(plan) {
  const created=[];
  const epic = await createWorkItem('Epic', plan.epic.title, null);
  created.push({type:'Epic',id:epic.id,title:plan.epic.title});
  for (const f of plan.epic.features || []) {
    const fi = await createWorkItem('Feature', f.title, epic.id);
    created.push({type:'Feature',id:fi.id,title:f.title});
    for (const s of f.userStories || []) {
      const si = await createWorkItem('User Story', s.title, fi.id);
      created.push({type:'User Story',id:si.id,title:s.title});
      for (const t of s.tasks || []) {
        const ti = await createWorkItem('Task', t.title, si.id);
        created.push({type:'Task',id:ti.id,title:t.title});
      }
    }
  }
  return created;
}

function serveStatic(urlPath, res) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res,404,{error:'Not found'});
  const ext=path.extname(file).toLowerCase();
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8'};
  return send(res,200,fs.readFileSync(file),types[ext] || 'application/octet-stream');
}

const server = http.createServer(async (req,res) => {
  try {
    if (req.method === 'OPTIONS') return send(res,204,'','text/plain');
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/health') {
      return send(res,200,{ok:true,version:'2.2.0',mode:azdoConfigured()?'AZURE_DEVOPS':'DEMO',environment:process.env.WEBSITE_SITE_NAME?'AZURE_APP_SERVICE':'LOCAL_OR_CODESPACES'});
    }

    if (req.method === 'POST' && url.pathname === '/api/ai-plan') {
      const b = await readBody(req);
      if (!b.project_requirement && !b.projectRequirement && !b.plan && !b.epic && !b.features) return send(res,400,{error:'project_requirement or structured plan is required'});
      return send(res,200,normalizePlan(b));
    }

    if (req.method === 'POST' && url.pathname === '/api/approve-plan') {
      const b = await readBody(req);
      if (!b.plan) return send(res,400,{error:'plan is required'});
      if (!azdoConfigured()) return send(res,200,{mode:'DEMO',message:'Approval recorded. Azure DevOps is not configured, so creation was simulated.',created:[{type:'Epic',id:1001,title:b.plan.epic.title}]});
      const created = await createHierarchy(b.plan);
      return send(res,200,{mode:'AZURE_DEVOPS',message:'Approved hierarchy created in Azure DevOps.',created});
    }

    return serveStatic(url.pathname,res);
  } catch (e) {
    console.error(e);
    return send(res,500,{error:e.message || 'Internal server error'});
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ProjectPilot AI Phase 2.2 running on ${HOST}:${PORT}`);
  console.log(`Mode: ${azdoConfigured() ? 'AZURE_DEVOPS' : 'DEMO'}`);
});
