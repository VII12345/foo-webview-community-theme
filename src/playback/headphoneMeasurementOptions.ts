/**
 * 设置页/沉浸面板只需要的轻量测量档案目录。
 * 完整曲线在 headphoneMeasurements.json，由延迟加载的 SPL 模块读取；
 * 这个文件保持很小，避免把曲线带进初始包。
 */
export interface HeadphoneMeasurementOption {
  readonly id: string;
  readonly name: string;
  readonly uuid: string;
  readonly sourceUrl: string;
}

export const HEADPHONE_MEASUREMENT_OPTIONS: readonly HeadphoneMeasurementOption[] = [
  {
    id: 'huihifi-ft1',
    name: 'FiiO FT1',
    uuid: '78a5551b-a960-48fe-a2b6-38ec21a7a513',
    sourceUrl: 'https://huihifi.com/evaluation/78a5551b-a960-48fe-a2b6-38ec21a7a513',
  },
  {
    id: 'huihifi-jt7',
    name: 'FiiO JT7',
    uuid: '59c7db06-16d9-41e3-9431-43a01a2da6ce',
    sourceUrl: 'https://huihifi.com/evaluation/59c7db06-16d9-41e3-9431-43a01a2da6ce',
  },
  {
    id: 'huihifi-mdr-m1',
    name: 'Sony MDR-M1',
    uuid: '39aaf588-0f7e-467e-9a8d-70abcc536130',
    sourceUrl: 'https://huihifi.com/evaluation/39aaf588-0f7e-467e-9a8d-70abcc536130',
  },
];

export function measurementOptionName(id: string | null | undefined): string | null {
  if (!id) return null;
  return HEADPHONE_MEASUREMENT_OPTIONS.find((option) => option.id === id)?.name ?? id;
}

export function bundledMeasurementOptionByUuid(
  uuid: string,
): HeadphoneMeasurementOption | undefined {
  return HEADPHONE_MEASUREMENT_OPTIONS.find((option) => option.uuid === uuid);
}
