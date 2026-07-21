const assert = require('assert');
const { generatePlan, analyzeNotes, generateMom, generateHandover } = require('./server');
const fs = require('fs');
const path = require('path');

const plan = generatePlan('Build an Employee Service Portal where employees submit requests and managers approve them. Include notifications and reporting.');
assert.strictEqual(plan.epic, 'Employee Service Portal');
assert(plan.features.some(f => f.name === 'Manager Approval Workflow'));
assert(plan.features.some(f => f.stories.some(s => s.name === 'Allow managers to approve requests')));

const notes = analyzeNotes('The team approved the workflow.\nRahul will complete the approval UI by Friday.\nThe security review is pending.');
assert(notes.decisions.length === 1);
assert(notes.actions.length === 1);
assert(notes.risks.length === 1);

const state = JSON.parse(fs.readFileSync(path.join(__dirname,'data','state.json'),'utf8'));
assert(generateMom(state).title.includes('Minutes of Meeting'));
assert(['Ready','Conditionally Ready'].includes(generateHandover(state).readiness));
console.log('All tests passed.');
