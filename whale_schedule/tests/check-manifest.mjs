// 校验某个 loader 入口的 manifest 解析结果（复刻 dsh-plugin-package-inventory-deepseek）。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, parse } from 'node:path'

function nearestManifest(modulePath) {
  let current = dirname(modulePath)
  const root = parse(current).root
  while (true) {
    const manifest = join(current, 'package.json')
    if (existsSync(manifest)) return manifest
    if (current === root) return void 0
    current = dirname(current)
  }
}

function identityFromManifest(path, allowAnonymous) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (allowAnonymous && manifest.name === void 0) return void 0
  if (typeof manifest.name !== 'string' || manifest.name.length === 0 || typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`plugin-package-inventory-deepseek: ${path} must declare non-empty name and version`)
  }
  return { name: manifest.name, version: manifest.version }
}

for (const modulePath of process.argv.slice(2)) {
  console.log(`entry   : ${modulePath}`)
  const manifest = nearestManifest(modulePath)
  console.log(`manifest: ${manifest ?? '(none)'}`)
  if (manifest === void 0) { console.log('identity: OK (无 manifest，按匿名松散模块跳过)\n'); continue }
  try {
    const id = identityFromManifest(manifest, true)
    console.log(`identity: OK ${id === void 0 ? '(匿名)' : JSON.stringify(id)}\n`)
  } catch (err) {
    console.log(`identity: THROW ${err.message}\n`)
  }
}
