#!/usr/bin/env node
/**
 * Deploy script: ncc build + copy assets to dist
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const distRoot = join(root, 'dist')

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: 'inherit', ...opts })
}

console.log('\n📦 deploy start\n')

// Ensure dist dir exists
if (!existsSync(distRoot)) mkdirSync(distRoot, { recursive: true })

// ncc build main + worker
run('ncc build client.js -o dist/main')
run('ncc build src/core/worker.js -o dist/worker')

// Copy proto and gameConfig to dist root
cpSync(join(root, 'src/proto'), join(distRoot, 'proto'), { recursive: true })
cpSync(join(root, 'src/gameConfig'), join(distRoot, 'gameConfig'), { recursive: true })

console.log('\n✅ deploy done\n')
