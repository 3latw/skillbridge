const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyzeJob } = require('../src/utils/matcher');
const { normalizeSkill } = require('../src/utils/skills');
const skill = (name, level) => ({ skill_name: name, level });
const need = (name, required_level) => ({ skill_name: name, required_level });
test('fully qualified', () => assert.deepEqual(analyzeJob([skill('React', 5)], [need('React', 5)]), { status: 'ready', gaps: [], readinessPercent: 100 }));
test('partial progress is 80 percent, not ready', () => {
 const result = analyzeJob([skill('React', 4)], [need('React', 5)]);
 assert.equal(result.readinessPercent, 80); assert.equal(result.status, 'near'); assert.equal(result.gaps[0].gap, 1);
});
test('missing skill is zero', () => { const result = analyzeJob([], [need('React', 5)]); assert.equal(result.readinessPercent, 0); assert.equal(result.status, 'not_ready'); });
test('no requirements is ready', () => assert.equal(analyzeJob([], []).status, 'ready'));
test('case, whitespace and aliases', () => assert.equal(analyzeJob([skill(' JS ', 3), skill('NodeJS', 4)], [need('JavaScript', 3), need('node.js', 4)]).readinessPercent, 100));
test('excess levels cannot compensate for missing skills', () => assert.equal(analyzeJob([skill('React', 5)], [need('React', 1), need('SQL', 4)]).readinessPercent, 50));
test('three small gaps are not near', () => assert.equal(analyzeJob([], [need('a', 1), need('b', 1), need('c', 1)]).status, 'not_ready'));
test('normalization preserves distinct punctuation', () => { assert.notEqual(normalizeSkill('C++'), normalizeSkill('C#')); assert.equal(normalizeSkill(' ＪＳ '), 'javascript'); });
