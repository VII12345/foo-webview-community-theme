// 生成本仓库的 GitHub 发行包，只写本地目录，不上传：
//   foo-webview-default-theme-<版本>.zip          主题（index.html 在根）
//   foo-webview-components-<版本>.zip             两个组件目录 + 说明
//   foo-webview-default-theme-<版本>-full.zip     主题 + 组件 + 安装说明
//   SHA256SUMS.txt / release.json
//
// 用法：node scripts/release/build-github-bundle.mjs --components <user-components-x64 目录>
//       [--out release-out] [--version <版本>]
// 先运行 npm run build，产物在 dist/。

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { zipEntries } from './zipEntries.mjs';

const root = resolve(new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const { values } = parseArgs({
  options: {
    out: { type: 'string', default: 'release-out' },
    components: { type: 'string' },
    version: { type: 'string' },
  },
});

const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = values.version ?? metadata.version;
const outDir = resolve(root, values.out, `v${version}`);
const dist = join(root, 'dist');
const frontend = join(dist, 'fe', version);
if (!existsSync(join(dist, 'index.html')) || !existsSync(join(dist, 'current.json'))) {
  throw new Error('dist/ 缺 index.html 或 current.json，先运行 npm run build');
}
if (!existsSync(frontend)) throw new Error(`dist/fe/${version} 不存在，先运行 npm run build`);
if (!values.components) throw new Error('需要 --components <user-components-x64 目录>');
const components = resolve(values.components);
for (const name of [
  'foo_ui_webview2/foo_ui_webview2.dll',
  'foo_ui_webview2/WebView2Loader.dll',
  'foo_monthly_stats/foo_monthly_stats.dll',
])
  if (!existsSync(join(components, name))) throw new Error(`组件目录缺 ${name}`);

/** 递归收集文件，路径统一用 `/`。 */
function collect(base, prefix = '') {
  return readdirSync(join(base, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = `${prefix}${entry.name}`;
    if (entry.isDirectory()) return collect(base, `${path}/`);
    return entry.isFile() ? [path] : [];
  });
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function filesOf(base, paths, prefix = '') {
  return paths.map((path) => ({
    path: `${prefix}${path}`,
    bytes: new Uint8Array(readFileSync(join(base, path))),
  }));
}

const themePaths = [
  'index.html',
  'current.json',
  ...collect(frontend).map((path) => `fe/${version}/${path}`),
];
const themeFiles = filesOf(dist, themePaths).sort((a, b) => (a.path < b.path ? -1 : 1));
/** 只收主题需要的两个组件目录，不把 user-components-x64 里的其他组件打进去。 */
const componentPaths = ['foo_ui_webview2', 'foo_monthly_stats']
  .flatMap((name) => collect(components, `${name}/`))
  .sort();
const componentFiles = filesOf(components, componentPaths);

const componentHashes = Object.fromEntries(
  componentPaths.map((path) => [path, sha256(new Uint8Array(readFileSync(join(components, path))))]),
);

const componentNotes = `随包组件说明 / Bundled components
================================

主题版本 / Theme version: ${version}

foo_ui_webview2/foo_ui_webview2.dll
  状态：修改版（非官方） / Modified, unofficial
  大小：${statSync(join(components, 'foo_ui_webview2/foo_ui_webview2.dll')).size}
  SHA-256：${componentHashes['foo_ui_webview2/foo_ui_webview2.dll']}
  官方来源：https://github.com/NereaFantasia/foo_ui_webview2/releases/tag/v2.0.0

foo_ui_webview2/WebView2Loader.dll
  状态：官方 Microsoft 1.0.3719.77（未修改） / Official, unmodified
  大小：${statSync(join(components, 'foo_ui_webview2/WebView2Loader.dll')).size}
  SHA-256：${componentHashes['foo_ui_webview2/WebView2Loader.dll']}

foo_monthly_stats/foo_monthly_stats.dll
  状态：修改版（非官方） / Modified, unofficial
  大小：${statSync(join(components, 'foo_monthly_stats/foo_monthly_stats.dll')).size}
  SHA-256：${componentHashes['foo_monthly_stats/foo_monthly_stats.dll']}
  官方来源：https://github.com/shirafukayayoi/foo_monthly_stats/releases/tag/v1.6
  说明：增加播放统计页使用的 length_seconds / total_time_seconds 字段与替代版本回退。

这些组件只随本发行包提供，版权归原作者。主题内置在线更新仍指向上游；
不要安装上游主题更新覆盖本分支，更新宿主组件前请备份修改版 DLL。
`;

const componentInstallNotes = `安装 / Installation
====================

1. 关闭 foobar2000。
2. 把本包的 foo_ui_webview2/ 与 foo_monthly_stats/ 两个文件夹
   复制到 <profile>\\user-components-x64\\。
   - 便携版：<foobar2000 目录>\\profile\\user-components-x64\\
   - 安装版：%APPDATA%\\foobar2000-v2\\user-components-x64\\
3. 启动 foobar2000，确认组件列表出现 WebView2 UI 与 Monthly Stats。

主题本身另见 foo-webview-default-theme-${version}.zip。
不要用主题内置的在线更新安装上游版本；它会覆盖本分支的功能。
`;

const fullInstallNotes = `安装 / Installation
====================

1. 关闭 foobar2000。
2. 把本包的 components/foo_ui_webview2/ 与 components/foo_monthly_stats/
   复制到 <profile>\\user-components-x64\\。
   - 便携版：<foobar2000 目录>\\profile\\user-components-x64\\
   - 安装版：%APPDATA%\\foobar2000-v2\\user-components-x64\\
3. 把本包 theme/ 里的内容解压到 <profile>\\webview-ui\\<模板名>\\，
   index.html 必须直接位于该目录。
4. 启动 foobar2000，在 foo_ui_webview2 首选项选择该模板，应用并重启。

已有组件时，也可以只用 foo-webview-default-theme-${version}.zip 更新主题。

不要用主题内置的在线更新安装上游版本；它会覆盖本分支的功能。
`;

const componentDocs = [
  { path: 'COMPONENTS.txt', bytes: new TextEncoder().encode(componentNotes) },
  { path: 'INSTALL.txt', bytes: new TextEncoder().encode(componentInstallNotes) },
];
const fullDocs = [
  { path: 'COMPONENTS.txt', bytes: new TextEncoder().encode(componentNotes) },
  { path: 'INSTALL.txt', bytes: new TextEncoder().encode(fullInstallNotes) },
];

const themeZip = zipEntries(themeFiles);
const componentZip = zipEntries([...componentFiles, ...componentDocs]);
const fullZip = zipEntries([
  ...themeFiles.map((file) => ({ path: `theme/${file.path}`, bytes: file.bytes })),
  ...componentFiles.map((file) => ({ path: `components/${file.path}`, bytes: file.bytes })),
  ...fullDocs,
]);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const assets = [
  {
    name: `foo-webview-default-theme-${version}.zip`,
    bytes: themeZip,
    description: 'theme only, index.html at root',
  },
  {
    name: `foo-webview-components-${version}.zip`,
    bytes: componentZip,
    description: 'bundled components',
  },
  {
    name: `foo-webview-default-theme-${version}-full.zip`,
    bytes: fullZip,
    description: 'theme + components + install notes',
  },
];
const manifest = [];
for (const asset of assets) {
  const path = join(outDir, asset.name);
  writeFileSync(path, asset.bytes);
  const hash = sha256(asset.bytes);
  manifest.push({
    name: asset.name,
    path: basename(path),
    size: asset.bytes.length,
    sha256: hash,
    description: asset.description,
  });
}
writeFileSync(
  join(outDir, 'SHA256SUMS.txt'),
  manifest.map((asset) => `${asset.sha256}  ${asset.name}`).join('\n') + '\n',
);
writeFileSync(
  join(outDir, 'release.json'),
  JSON.stringify({ version, tag: `v${version}`, assets: manifest }, null, 2) + '\n',
);
console.log(
  JSON.stringify(
    {
      version,
      out: relative(root, outDir),
      files: manifest.map((asset) => `${asset.name} (${asset.size} bytes)`),
    },
    null,
    2,
  ),
);
