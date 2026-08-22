import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const skillDir = path.resolve(moduleDir, '../skills/evolve-agent-with-harbor')
const skillPath = path.join(skillDir, 'SKILL.md')

function parseScalar(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed)
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1)
  return trimmed
}

function parseBoolean(value, field) {
  const normalized = String(value).toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  throw new TypeError(`bundled Skill frontmatter field "${field}" must be a boolean`)
}

function parseSkillMarkdown(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error(`bundled Skill is missing YAML frontmatter: ${skillPath}`)

  const metadata = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const separator = line.indexOf(':')
    if (separator <= 0) throw new Error(`invalid bundled Skill frontmatter line: ${line}`)
    metadata[line.slice(0, separator).trim()] = parseScalar(line.slice(separator + 1))
  }

  for (const field of ['name', 'description']) {
    if (typeof metadata[field] !== 'string' || !metadata[field]) {
      throw new Error(`bundled Skill frontmatter requires "${field}"`)
    }
  }

  return {
    name: metadata.name,
    description: metadata.description,
    ...(metadata.whenToUse ? { whenToUse: metadata.whenToUse } : {}),
    invocation: {
      modelInvocable: metadata['disable-model-invocation'] === undefined
        ? true
        : !parseBoolean(metadata['disable-model-invocation'], 'disable-model-invocation'),
      userInvocable: metadata['user-invocable'] === undefined
        ? true
        : parseBoolean(metadata['user-invocable'], 'user-invocable'),
    },
    source: 'npm:dsh-harbor-evolution',
    resourceBase: { kind: 'directory', path: skillDir },
    content: match[2].trim(),
    path: skillPath,
  }
}

export function loadBundledSkill() {
  return parseSkillMarkdown(readFileSync(skillPath, 'utf8'))
}
