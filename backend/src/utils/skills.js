const aliases = new Map([
  ['js', 'javascript'], ['nodejs', 'node.js'], ['node js', 'node.js'],
  ['reactjs', 'react'], ['react.js', 'react'], ['ts', 'typescript'],
  ['postgres', 'postgresql'], ['ui ux', 'ui/ux'], ['ui/ux design', 'ui/ux'],
]);
function normalizeSkill(value) {
  if (typeof value !== 'string') return '';
  const key = value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
  return aliases.get(key) || key;
}
module.exports = { normalizeSkill };
