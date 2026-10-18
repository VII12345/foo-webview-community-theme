// 把 build-github-bundle.mjs 生成的资产发到 GitHub release。
// 默认创建 draft，核对后加 --publish 再发布。Token 只从 GITHUB_TOKEN 读取，不打印。
//
// 用法：
//   GITHUB_TOKEN=... node scripts/release/publish-github.mjs --dir release-out/v0.3.0
//   GITHUB_TOKEN=... node scripts/release/publish-github.mjs --dir release-out/v0.3.0 --publish
//   GITHUB_TOKEN=... node scripts/release/publish-github.mjs --dir release-out/v0.3.0 --update-about --publish

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    dir: { type: 'string' },
    repo: { type: 'string', default: 'VII12345/foo-webview-community-theme' },
    notes: { type: 'string' },
    publish: { type: 'boolean', default: false },
    draft: { type: 'boolean', default: true },
    'update-about': { type: 'boolean', default: false },
    title: { type: 'string' },
  },
});
if (!values.dir) throw new Error('需要 --dir <release-out/vX.Y.Z>');
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('需要 GITHUB_TOKEN');
const dir = resolve(values.dir);
const release = JSON.parse(readFileSync(join(dir, 'release.json'), 'utf8'));
const notesPath = resolve(values.notes ?? join('docs', `RELEASE-NOTES-${release.version}.md`));
const body = readFileSync(notesPath, 'utf8');
const title = values.title ?? `${release.version} — 社区增强版 / Community Edition`;
const [owner, repo] = values.repo.split('/');
if (!owner || !repo) throw new Error('--repo 需要 owner/repo');

const api = 'https://api.github.com';
async function call(path, options = {}) {
  const answer = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await answer.text();
  if (!answer.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${answer.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

let existing = null;
try {
  existing = await call(`/repos/${owner}/${repo}/releases/tags/${release.tag}`);
} catch {
  existing = null;
}
if (existing && !existing.draft) {
  throw new Error(`release ${release.tag} 已发布；先手动处理，脚本不会覆盖已发布版本`);
}

const payload = {
  tag_name: release.tag,
  target_commitish: 'main',
  name: title,
  body,
  draft: values.draft,
  prerelease: false,
};
const created = existing
  ? await call(`/repos/${owner}/${repo}/releases/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  : await call(`/repos/${owner}/${repo}/releases`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

const current = new Map((created.assets ?? []).map((asset) => [asset.name, asset]));
for (const asset of release.assets) {
  const path = join(dir, asset.path ?? asset.name);
  const bytes = readFileSync(path);
  if (current.has(asset.name)) {
    await call(`/repos/${owner}/${repo}/releases/assets/${current.get(asset.name).id}`, {
      method: 'DELETE',
    });
  }
  const upload = created.upload_url.replace(/\{.*$/, '');
  const answer = await fetch(`${upload}?name=${encodeURIComponent(asset.name)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
    },
    body: bytes,
  });
  if (!answer.ok) {
    throw new Error(`上传 ${asset.name} 失败：${answer.status} ${(await answer.text()).slice(0, 300)}`);
  }
  console.log(`uploaded ${asset.name} (${bytes.length} bytes)`);
}

if (values['update-about']) {
  await call(`/repos/${owner}/${repo}`, {
    method: 'PATCH',
    body: JSON.stringify({
      description:
        'Community-enhanced fork of the foo_ui_webview2 default theme: five immersive views, word-level lyrics, playback statistics and headphone SPL estimation',
      homepage: `https://github.com/${owner}/${repo}/releases`,
      topics: [
        'foobar2000',
        'foobar2000-theme',
        'foo-ui-webview2',
        'webview2',
        'react',
        'typescript',
        'lyrics',
      ],
    }),
  });
  console.log('updated repository description and topics');
}

if (values.publish) {
  const published = await call(`/repos/${owner}/${repo}/releases/${created.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ draft: false }),
  });
  console.log(`published ${published.html_url}`);
} else {
  console.log(`draft ready: ${created.html_url}`);
}
