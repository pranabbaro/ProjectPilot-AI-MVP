const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 7071);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const STATE_PATH = path.join(ROOT, 'data', 'state.json');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON')) }
    });
    req.on('error', reject);
  });
}

function loadState() {
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

function titleCase(value) {
  return value.replace(/\b\w/g, c => c.toUpperCase());
}

function inferProjectName(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('employee service')) return 'Employee Service Portal';
  if (p.includes('hospital')) return 'Hospital Management Platform';
  if (p.includes('ecommerce') || p.includes('e-commerce')) return 'E-Commerce Platform';
  if (p.includes('landing zone')) return 'Azure Landing Zone Program';
  if (p.includes('chatbot')) return 'Enterprise AI Chatbot';
  const cleaned = prompt.replace(/\b(build|create|develop|design|an|a|the|project|platform|portal|system)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  return cleaned ? titleCase(cleaned.split(/[,.]/)[0].slice(0, 45)) : 'New Digital Product';
}

function makeTasks(prefix) {
  return [
    `Design ${prefix.toLowerCase()} experience`,
    `Develop ${prefix.toLowerCase()} API`,
    `Configure ${prefix.toLowerCase()} data model`,
    `Complete ${prefix.toLowerCase()} testing`
  ];
}

function generatePlan(prompt) {
  const projectName = inferProjectName(prompt);
  const lower = prompt.toLowerCase();
  const features = [];
  const addFeature = (name, stories) => features.push({
    name,
    stories: stories.map(name => ({ name, tasks: makeTasks(name) }))
  });

  addFeature('Project Foundation and Access', ['Set up secure user access']);

  if (lower.includes('employee') || lower.includes('request')) {
    addFeature('Employee Request Management', ['Allow employees to submit requests', 'Allow employees to track request status']);
  }
  if (lower.includes('manager') || lower.includes('approve')) {
    addFeature('Manager Approval Workflow', ['Allow managers to approve requests', 'Allow managers to reject requests']);
  }
  if (lower.includes('notification') || lower.includes('email')) {
    addFeature('Notifications', ['Notify users when request status changes']);
  }
  if (lower.includes('report') || lower.includes('dashboard') || lower.includes('track')) {
    addFeature('Reporting and Operations', ['Provide operational dashboard', 'Provide audit history']);
  }
  if (features.length === 1) {
    addFeature('Core Business Capability', ['Deliver the primary user journey']);
    addFeature('Administration and Reporting', ['Provide administration controls', 'Provide project reporting']);
  }

  return {
    projectName,
    epic: projectName,
    estimatedDuration: `${Math.max(4, features.length * 2)} weeks`,
    estimatedSprints: Math.max(2, features.length),
    complexity: features.length > 4 ? 'Medium' : 'Low',
    features
  };
}

function analyzeNotes(notes) {
  const lines = notes.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const decisions = [];
  const actions = [];
  const risks = [];
  const deferred = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (/(approved|agreed|decided)/.test(lower)) decisions.push(line);
    if (/(risk|pending|delay|blocked|issue)/.test(lower)) risks.push(line);
    if (/(defer|phase 2|later|postpone)/.test(lower)) deferred.push(line);
    const ownerMatch = line.match(/^([A-Z][a-z]+)\s+will\s+(.+?)(?:\s+by\s+(.+)|\s+during\s+(.+))?[.]?$/i);
    if (ownerMatch) {
      actions.push({
        owner: titleCase(ownerMatch[1]),
        title: ownerMatch[2].replace(/[.]$/, ''),
        target: (ownerMatch[3] || ownerMatch[4] || 'TBD').replace(/[.]$/, '')
      });
    }
  }
  return { decisions, actions, risks, deferred };
}

function generateMom(state) {
  const d = state.discussion;
  return {
    title: `${state.project.name} – Minutes of Meeting`,
    objective: 'Review delivery status, decisions, actions, risks, and next steps.',
    decisions: d.decisions,
    actions: d.actions,
    risks: d.risks,
    nextSteps: ['Review proposed backlog updates', 'Confirm owners and target dates', 'Track open risks in the next project call']
  };
}

function generateHandover(state) {
  const p = state.project;
  const gaps = [];
  if (p.blocked > 0) gaps.push(`${p.blocked} blocked work item(s) remain`);
  if (p.risks > 0) gaps.push(`${p.risks} open risk(s) remain`);
  if (p.compliance < 90) gaps.push(`Compliance score is ${p.compliance}%`);
  return {
    project: p.name,
    readiness: gaps.length ? 'Conditionally Ready' : 'Ready',
    sections: [
      'Executive Summary', 'Project Objectives', 'Delivered Scope', 'Deferred Scope',
      'Solution Overview', 'Delivery Summary', 'Deployment Information',
      'Support Ownership', 'Monitoring and Operations', 'Security and Access',
      'Known Issues', 'Open Risks', 'Documentation Index', 'Lessons Learned',
      'Outstanding Actions', 'Handover Checklist', 'Sign-off'
    ],
    gaps
  };
}

function serveStatic(req, res) {
  let requestPath = decodeURIComponent(req.url.split('?')[0]);
  if (requestPath === '/') requestPath = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const ext = path.extname(filePath);
    const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml'};
    res.writeHead(200, {'Content-Type': types[ext] || 'application/octet-stream'});
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/api/health') return sendJson(res, 200, {status:'ok', mode:'demo'});
    if (req.method === 'GET' && url === '/api/dashboard') return sendJson(res, 200, loadState());

    if (req.method === 'POST' && url === '/api/meeting') {
      const body = await readBody(req);
      const state = loadState();
      state.meeting = {
        title: body.title || `${state.project.name} – Project Discussion`,
        date: body.date || 'Tomorrow',
        time: body.time || '11:00 AM',
        attendees: body.attendees || ['Project Manager', 'Product Owner', 'Technical Lead', 'Scrum Master'],
        agenda: body.agenda || ['Sprint progress', 'Blocked items', 'Open risks', 'Required decisions']
      };
      saveState(state);
      return sendJson(res, 200, {message:'Meeting arranged in demo mode', meeting:state.meeting});
    }

    if (req.method === 'POST' && url === '/api/plan') {
      const body = await readBody(req);
      if (!body.prompt || body.prompt.trim().length < 10) return sendJson(res, 400, {error:'Please provide a more detailed project prompt.'});
      return sendJson(res, 200, generatePlan(body.prompt));
    }

    if (req.method === 'POST' && url === '/api/discussion') {
      const body = await readBody(req);
      if (!body.notes || body.notes.trim().length < 10) return sendJson(res, 400, {error:'Please provide meeting notes.'});
      const result = analyzeNotes(body.notes);
      const state = loadState();
      state.discussion = {
        decisions: result.decisions,
        actions: result.actions,
        risks: result.risks
      };
      saveState(state);
      return sendJson(res, 200, {...result, proposedDevOpsChanges: result.actions.map(a => `Create task: ${a.title}`)});
    }

    if (req.method === 'POST' && url === '/api/mom') return sendJson(res, 200, generateMom(loadState()));
    if (req.method === 'POST' && url === '/api/handover') return sendJson(res, 200, generateHandover(loadState()));

    return serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, {error:error.message || 'Unexpected server error'});
  }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ProjectPilot AI MVP running at http://localhost:${PORT}`);
    console.log('Mode: DEMO');
  });
}

module.exports = { server, generatePlan, analyzeNotes, generateMom, generateHandover };
