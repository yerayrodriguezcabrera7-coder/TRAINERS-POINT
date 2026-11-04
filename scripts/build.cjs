const { rmSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { spawnSync } = require('node:child_process');
const root = resolve(__dirname, '..');
// Generated files from moved modules must not survive and mask a broken import.
rmSync(join(root, 'dist'), { recursive: true, force: true });
const result = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', join(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
