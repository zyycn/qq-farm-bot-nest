import fs from 'node:fs'
import path from 'node:path'

// 编译后: dist/config/paths.js -> dist/
export const DIST_ROOT = path.join(__dirname, '..')
export const CORE_ROOT = path.join(DIST_ROOT, '..')
export const WORKSPACE_ROOT = path.resolve(DIST_ROOT, '..', '..')
export const ASSETS_DIR = path.join(DIST_ROOT, 'assets')

export function resolveWebDist(): string {
  const candidates = [
    path.join(WORKSPACE_ROOT, 'apps', 'web', 'dist'),
    path.join(WORKSPACE_ROOT, 'web', 'dist'),
    path.join(CORE_ROOT, 'web', 'dist')
  ]
  return candidates.find(p => fs.existsSync(p)) ?? ''
}
