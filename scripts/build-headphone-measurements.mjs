import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// 从 huihifi 公开测评接口生成随主题打包的耳机测量档案。
// 只取 RAW_FR 与 IMPEDANCE 的形状；FR 在 1 kHz 归一化，绝对声压由用户填的灵敏度锚定。
// 运行：node scripts/build-headphone-measurements.mjs

const PROFILES = [
  {
    id: 'huihifi-ft1',
    name: 'FiiO FT1',
    uuid: '78a5551b-a960-48fe-a2b6-38ec21a7a513',
  },
  {
    id: 'huihifi-jt7',
    name: 'FiiO JT7',
    uuid: '59c7db06-16d9-41e3-9431-43a01a2da6ce',
  },
  {
    id: 'huihifi-mdr-m1',
    name: 'Sony MDR-M1',
    uuid: '39aaf588-0f7e-467e-9a8d-70abcc536130',
  },
];

const FR_MIN_HZ = 20;
const FR_MAX_HZ = 20000;
const FR_POINTS = 240;
const IMPEDANCE_POINTS = 180;
const THD_POINTS = 120;
const COMPRESSION_POINTS = 120;

const round = (value, digits = 3) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function logGrid(min, max, count) {
  const points = [];
  const ratio = (max / min) ** (1 / (count - 1));
  for (let index = 0; index < count; index += 1) points.push(min * ratio ** index);
  return points;
}

function parseRows(child) {
  const rows = Array.isArray(child?.dataSet) ? child.dataSet.slice(1) : [];
  return rows
    .map((row) => row.map(Number))
    .filter((row) => row.length >= 2 && Number.isFinite(row[0]) && Number.isFinite(row[1]))
    .sort((left, right) => left[0] - right[0]);
}

/** 对数频率插值；曲线外按端点保持。 */
function interpolate(rows, hz) {
  if (rows.length === 0) return null;
  if (hz <= rows[0][0]) return rows[0].slice(1);
  if (hz >= rows[rows.length - 1][0]) return rows[rows.length - 1].slice(1);
  let low = 0;
  let high = rows.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (rows[middle][0] <= hz) low = middle;
    else high = middle;
  }
  const a = rows[low];
  const b = rows[high];
  const t = Math.log(hz / a[0]) / Math.log(b[0] / a[0]);
  return a.slice(1).map((value, index) => value + (b[index + 1] - value) * t);
}

function curve(rows, grid, columns) {
  return grid.map((hz) => {
    const values = interpolate(rows, hz);
    return [round(hz, 3), ...columns.map((column) => round(values?.[column] ?? 0, 3))];
  });
}

function projectOf(data, code) {
  return (data.datas ?? []).find((entry) => entry.project?.code === code)?.children?.[0] ?? null;
}

function normalizeFr(rows) {
  const at1k = interpolate(rows, 1000)?.[0] ?? 0;
  return rows.map(([hz, db]) => [hz, db - at1k]);
}

async function build(profile) {
  const response = await fetch(`https://huihifi.com/api/v1/evaluations/${profile.uuid}`);
  if (!response.ok) throw new Error(`${profile.name}: HTTP ${response.status}`);
  const payload = await response.json();
  const data = payload.data;
  const fr = projectOf(data, 'RAW_FR');
  const impedance = projectOf(data, 'IMPEDANCE');
  const thd = projectOf(data, 'THD');
  const compression = projectOf(data, 'SUPER_COMPRESSION');
  if (!fr) throw new Error(`${profile.name}: no RAW_FR`);
  if (!impedance) throw new Error(`${profile.name}: no IMPEDANCE`);

  const frRows = normalizeFr(parseRows(fr));
  const impedanceRows = parseRows(impedance);
  const thdRows = thd ? parseRows(thd) : [];
  const compressionRows = compression ? parseRows(compression) : [];

  return {
    id: profile.id,
    name: profile.name,
    source: 'huihifi',
    sourceUrl: `https://huihifi.com/evaluation/${profile.uuid}`,
    uuid: profile.uuid,
    fetchedAt: new Date().toISOString().slice(0, 10),
    frReference: 'voltage',
    driveImpedanceOhm: null,
    rawPointCounts: {
      frequencyResponse: frRows.length,
      impedance: impedanceRows.length,
      thd: thdRows.length,
      compression: compressionRows.length,
    },
    frequencyResponse: curve(frRows, logGrid(FR_MIN_HZ, FR_MAX_HZ, FR_POINTS), [0]),
    impedance: curve(
      impedanceRows,
      logGrid(FR_MIN_HZ, FR_MAX_HZ, IMPEDANCE_POINTS),
      [0],
    ),
    thd: thdRows.length
      ? curve(thdRows, logGrid(FR_MIN_HZ, FR_MAX_HZ, THD_POINTS), [0, 1, 2])
      : undefined,
    compression: compressionRows.length
      ? curve(compressionRows, logGrid(FR_MIN_HZ, FR_MAX_HZ, COMPRESSION_POINTS), [0, 1])
      : undefined,
  };
}

const output = {
  schema: 1,
  source: 'huihifi public evaluation API',
  generatedAt: new Date().toISOString().slice(0, 10),
  profiles: [],
};
for (const profile of PROFILES) output.profiles.push(await build(profile));

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '../src/playback/headphoneMeasurements.json');
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(`wrote ${target} (${output.profiles.length} profiles)`);
