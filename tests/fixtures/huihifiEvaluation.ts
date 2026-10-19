import type { HuihifiEvaluationProfile } from '../../src/playback/huihifiEvaluation.ts';

export const HUHIFI_UUID = '78a5551b-a960-48fe-a2b6-38ec21a7a513';
export const HUHIFI_LINK = `https://huihifi.com/evaluation/${HUHIFI_UUID}`;

export function huihifiPayload(): unknown {
  return {
    code: 0,
    message: 'success',
    data: {
      uuid: HUHIFI_UUID,
      title: '飞傲 FT1',
      brand: { title: '飞傲 FiiO' },
      datas: [
        {
          project: { code: 'RAW_FR', name: '频响曲线 Frequency Response' },
          children: [
            {
              name: '频响',
              dataSet: [
                ['Freq(Hz)', 'SPL(dB)'],
                ['20', '100.000'],
                ['100', '101.000'],
                ['500', '100.500'],
                ['1000', '100.000'],
                ['2000', '99.000'],
                ['4000', '98.000'],
                ['8000', '97.000'],
                ['12000', '96.000'],
                ['16000', '95.000'],
                ['20000', '94.000'],
              ],
            },
          ],
        },
        {
          project: { code: 'IMPEDANCE', name: '阻抗曲线 Impedance' },
          children: [
            {
              name: '阻抗',
              dataSet: [
                ['Hz', 'Ohms'],
                ['20000', '41.5'],
                ['8000', '37.5'],
                ['4000', '36.5'],
                ['1000', '37.0'],
                ['500', '37.0'],
                ['100', '40.3'],
                ['20', '43.0'],
              ],
            },
          ],
        },
        {
          project: { code: 'THD', name: '谐波失真 THD' },
          children: [{ name: '失真 94dB', dataSet: [['Freq(Hz)', 'THD(%)'], ['1000', '0.1']] }],
        },
      ],
    },
  };
}

export function huihifiProfile(overrides: Partial<HuihifiEvaluationProfile> = {}): HuihifiEvaluationProfile {
  return {
    id: `huihifi-custom-${HUHIFI_UUID}`,
    uuid: HUHIFI_UUID,
    name: '飞傲 FT1',
    brand: '飞傲 FiiO',
    source: 'huihifi',
    sourceUrl: HUHIFI_LINK,
    fetchedAt: '2026-10-20',
    frReference: 'voltage',
    driveImpedanceOhm: null,
    rawPointCounts: { frequencyResponse: 10, impedance: 7 },
    frequencyResponse: [
      { hz: 20, db: 0 },
      { hz: 1000, db: 0 },
      { hz: 20000, db: -6 },
    ],
    impedance: [
      { hz: 20, ohm: 43 },
      { hz: 1000, ohm: 37 },
      { hz: 20000, ohm: 41.5 },
    ],
    ...overrides,
  };
}
