import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  formatDryRunSummary,
  isolatedReleaseEnvironment,
  recoverReleaseFailure,
  releaseBuildEnvironment,
  releaseCandidateEnvironment,
  releaseFetch,
  withProcessEnvironment,
} from './prepare-release.mjs'

test('release environments remove credentials and reproduce tagged Client branding', () => {
  const ambient = {
    PATH: '/managed/bin',
    LANG: 'zh_CN.UTF-8',
    LC_ALL: 'zh_CN.UTF-8',
    npm_execpath: '/managed/pnpm.cjs',
    GITHUB_TOKEN: 'github-secret',
    GH_TOKEN: 'gh-secret',
    DEEPSEEK_API_KEY: 'model-secret',
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: 'signing-secret',
    SSH_AUTH_SOCK: '/tmp/agent.sock',
    NPM_CONFIG_USERCONFIG: '/Users/example/.npmrc',
    PIP_INDEX_URL: 'https://user:password@example.test/simple',
    NODE_OPTIONS: '--require=/tmp/inject.cjs',
    NODE_PATH: '/tmp/injected-modules',
    PYTHONPATH: '/tmp/injected-python',
    PYTHONHOME: '/tmp/injected-python-home',
    BASH_ENV: '/tmp/injected-bash',
    ENV: '/tmp/injected-shell',
    ZDOTDIR: '/tmp/injected-zsh',
    RUBYOPT: '-r/tmp/injected-ruby.rb',
    PERL5OPT: '-M/tmp/injected-perl.pm',
    LD_PRELOAD: '/tmp/injected-loader.so',
    dyld_insert_libraries: '/tmp/injected-loader.dylib',
    GIT_CONFIG_PARAMETERS: "'http.extraHeader=Authorization: secret'",
    GIT_CONFIG_KEY_0: 'core.fsmonitor',
    GIT_CONFIG_VALUE_0: '/tmp/injected-git-hook',
    DSH_CLIENT_TITLE: 'Ambient title',
    DSH_CLIENT_FAVICON: '/tmp/ambient.svg',
  }

  const candidate = releaseCandidateEnvironment(ambient)
  assert.equal(candidate.PATH, '/managed/bin')
  assert.equal(candidate.LANG, 'zh_CN.UTF-8')
  assert.equal(candidate.LC_ALL, 'zh_CN.UTF-8')
  assert.equal(candidate.npm_execpath, '/managed/pnpm.cjs')
  assert.equal(candidate.DSH_CLIENT_TITLE, 'Ambient title')
  for (const name of [
    'GITHUB_TOKEN',
    'GH_TOKEN',
    'DEEPSEEK_API_KEY',
    'TAURI_SIGNING_PRIVATE_KEY_PASSWORD',
    'SSH_AUTH_SOCK',
    'NPM_CONFIG_USERCONFIG',
    'PIP_INDEX_URL',
    'NODE_OPTIONS',
    'NODE_PATH',
    'PYTHONPATH',
    'PYTHONHOME',
    'BASH_ENV',
    'ENV',
    'ZDOTDIR',
    'RUBYOPT',
    'PERL5OPT',
    'LD_PRELOAD',
    'dyld_insert_libraries',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_KEY_0',
    'GIT_CONFIG_VALUE_0',
  ]) {
    assert.equal(candidate[name], undefined, `${name} must not reach candidate subprocesses`)
  }

  const build = releaseBuildEnvironment(ambient)
  assert.equal(build.DSH_CLIENT_TITLE, 'XiaoHui Harness')
  assert.equal(build.DSH_CLIENT_FAVICON, undefined)
  assert.deepEqual(
    Object.keys(build).filter(name => name.startsWith('DSH_CLIENT_')),
    ['DSH_CLIENT_TITLE'],
  )
})

test('releaseFetch confines GitHub credentials to GitHub API requests', async () => {
  const requests = []
  const fetchImpl = async (url, options) => {
    requests.push({ url, headers: new Headers(options?.headers) })
    return new Response('{}', { status: 200 })
  }
  const fetchRelease = releaseFetch({ GITHUB_TOKEN: 'github-secret' }, fetchImpl)

  await fetchRelease('https://api.github.com/repos/example/project', {
    headers: { accept: 'application/vnd.github+json' },
  })
  await fetchRelease('https://registry.npmjs.org/example/latest', {
    headers: { accept: 'application/json' },
  })

  assert.equal(requests[0].headers.get('authorization'), 'Bearer github-secret')
  assert.equal(requests[0].headers.get('accept'), 'application/vnd.github+json')
  assert.equal(requests[1].headers.get('authorization'), null)
})

test('isolatedReleaseEnvironment replaces ambient homes, DSH state, and temporary paths', () => {
  const parent = mkdtempSync(join(tmpdir(), 'xiaohui-release-environment-test-'))
  const isolated = isolatedReleaseEnvironment({
    HOME: '/Users/example',
    XDG_CONFIG_HOME: '/Users/example/.config',
    XDG_CACHE_HOME: '/Users/example/.cache',
    DSH_HOME: '/Users/example/.dsh',
    DSH_AGENTS_HOME: '/Users/example/.agents',
    DSH_PROFILE: 'ambient-profile',
    DSH_CLIENT_FAVICON: '/Users/example/favicon.svg',
    TMPDIR: '/ambient/tmp',
    TMP: '/ambient/tmp',
    TEMP: '/ambient/tmp',
    PATH: '/managed/bin',
  }, parent)
  try {
    assert.equal(isolated.env.PATH, '/managed/bin')
    assert.equal(isolated.env.DSH_PROFILE, undefined)
    assert.equal(isolated.env.DSH_CLIENT_FAVICON, undefined)
    assert.equal(isolated.env.DSH_CLIENT_TITLE, 'XiaoHui Harness')
    for (const name of [
      'HOME',
      'XDG_CONFIG_HOME',
      'XDG_CACHE_HOME',
      'XDG_DATA_HOME',
      'XDG_STATE_HOME',
      'DSH_HOME',
      'DSH_AGENTS_HOME',
      'TMPDIR',
      'UV_CACHE_DIR',
      'PIP_CACHE_DIR',
      'npm_config_cache',
      'TMP',
      'TEMP',
    ]) {
      assert.ok(isolated.env[name].startsWith(isolated.root), `${name} must use the isolated root`)
      assert.equal(existsSync(isolated.env[name]), true)
    }
  }
  finally {
    isolated.discard()
    assert.equal(existsSync(isolated.root), false)
    rmSync(parent, { recursive: true, force: true })
  }
})

test('withProcessEnvironment restores the ambient environment after failure', async () => {
  const ambientName = 'XIAOHUI_PREPARE_RELEASE_AMBIENT_TEST'
  const candidateName = 'XIAOHUI_PREPARE_RELEASE_CANDIDATE_TEST'
  const previousAmbient = process.env[ambientName]
  const previousCandidate = process.env[candidateName]
  process.env[ambientName] = 'ambient'
  delete process.env[candidateName]
  try {
    await assert.rejects(
      withProcessEnvironment({ [candidateName]: 'candidate' }, async () => {
        assert.equal(process.env[ambientName], undefined)
        assert.equal(process.env[candidateName], 'candidate')
        throw new Error('candidate failed')
      }),
      /candidate failed/,
    )
    assert.equal(process.env[ambientName], 'ambient')
    assert.equal(process.env[candidateName], undefined)
  }
  finally {
    if (previousAmbient === undefined) delete process.env[ambientName]
    else process.env[ambientName] = previousAmbient
    if (previousCandidate === undefined) delete process.env[candidateName]
    else process.env[candidateName] = previousCandidate
  }
})

test('recoverReleaseFailure retains the primary error when every recovery step fails', () => {
  const primary = new Error('build failed first')
  const attempted = []
  const error = recoverReleaseFailure(primary, [
    {
      label: 'product rollback',
      run() {
        attempted.push('rollback')
        throw new Error('copy failed')
      },
    },
    {
      label: 'temporary node_modules cleanup',
      run() {
        attempted.push('cleanup')
        throw new Error('unlink failed')
      },
    },
    {
      label: 'rollback snapshot cleanup',
      run() {
        attempted.push('discard')
      },
    },
  ])

  assert.equal(error.cause, primary)
  assert.match(error.message, /^local release preparation failed: build failed first;/)
  assert.match(error.message, /product rollback: copy failed/)
  assert.match(error.message, /temporary node_modules cleanup: unlink failed/)
  assert.deepEqual(attempted, ['rollback', 'cleanup', 'discard'])
})

test('dry-run summary describes static candidate checks without compatibility claims', () => {
  const summary = formatDryRunSummary([{}, {}])
  assert.match(summary, /2 latest candidate updates/)
  assert.match(summary, /static candidate checks passed/)
  assert.match(summary, /were not run/)
  assert.doesNotMatch(summary, /compatible/iu)
})
