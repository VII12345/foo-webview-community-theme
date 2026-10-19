import { createStore } from 'jotai/vanilla';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createConfigWriter } from '../../../src/host/configWrite.ts';
import {
  startSoundPressure,
  type SoundPressureService,
} from '../../../src/playback/soundPressurePrefs.ts';
import {
  emptyRig,
  HEADPHONE_RIG_KEY,
  type HeadphoneRig,
} from '../../../src/playback/soundPressure.ts';
import { SPL_WEIGHTING_KEY } from '../../../src/playback/splWeighting.ts';
import { createMemoryDataWriter } from '../../fixtures/dataWriter.ts';
import { installFakeHost, type UnitHostOptions } from '../../fixtures/unitHost.ts';
import { hostFailure } from '../../fixtures/hostAnswers.ts';

function setup(options: UnitHostOptions = {}) {
  const host = installFakeHost(options);
  const store = createStore();
  const data = createMemoryDataWriter();
  const writer = createConfigWriter(host.fb, data.writer);
  let next = 0;
  const service = startSoundPressure(
    store,
    writer,
    host.fb,
    () => `id-${++next}`,
  );
  onTestFinished(() => service.dispose());
  return { host, store, data, service };
}

const stored = (env: ReturnType<typeof setup>): HeadphoneRig | undefined =>
  env.host.config.get(HEADPHONE_RIG_KEY) as HeadphoneRig | undefined;

async function ready(service: SoundPressureService): Promise<void> {
  await service.ready;
}

describe('耳机设备的偏好服务', () => {
  it('默认没有设备', async () => {
    const env = setup();
    await ready(env.service);
    expect(env.store.get(env.service.rig)).toEqual(emptyRig());
    expect(stored(env)).toBeUndefined();
  });

  it('耳机测量档案 id 随耳机持久化，可用 null 清除', async () => {
    const env = setup();
    await ready(env.service);
    const id = env.service.addHeadphone({
      name: 'FT1',
      impedanceOhm: 32,
      sensitivity: 98,
      sensitivityUnit: 'dbPerMw',
      measurementProfileId: 'huihifi-ft1',
    });
    await env.service.persistence.settled();
    expect(stored(env)?.headphones[0]).toMatchObject({
      id,
      measurementProfileId: 'huihifi-ft1',
    });
    env.service.updateHeadphone(id!, {
      name: 'FT1',
      impedanceOhm: 32,
      sensitivity: 98,
      sensitivityUnit: 'dbPerMw',
      measurementProfileId: null,
    });
    await env.service.persistence.settled();
    expect(stored(env)?.headphones[0]?.measurementProfileId).toBeNull();
  });

  it('声压加权默认 A，切换后落盘，坏值回退 A', async () => {
    const env = setup();
    await ready(env.service);
    expect(env.store.get(env.service.weighting)).toBe('A');
    env.service.setWeighting('K');
    await env.service.persistence.settled();
    expect(env.host.config.get(SPL_WEIGHTING_KEY)).toBe('K');

    const invalid = setup({ config: { [SPL_WEIGHTING_KEY]: 'Q' } });
    await ready(invalid.service);
    expect(invalid.store.get(invalid.service.weighting)).toBe('A');
  });

  it('增删改选都写进 config，删除选中项时同一次写入清掉选择', async () => {
    const env = setup();
    await ready(env.service);
    const amp = env.service.addAmp({ name: '  Desktop  ', vrmsAt0db: 2, gainDb: -6 });
    const headphone = env.service.addHeadphone({
      name: 'Open',
      impedanceOhm: 300,
      sensitivity: 97,
      sensitivityUnit: 'dbPerMw',
    });
    expect(amp).toBe('id-1');
    expect(headphone).toBe('id-2');
    let rig = env.store.get(env.service.rig);
    expect(rig.amps[0]).toMatchObject({ id: 'id-1', name: 'Desktop' });
    expect(rig.headphones[0]).toMatchObject({ id: 'id-2', name: 'Open' });
    env.service.selectAmp('id-1');
    env.service.selectHeadphone('id-2');
    await env.service.persistence.settled();
    rig = env.store.get(env.service.rig);
    expect(rig.selectedAmpId).toBe('id-1');
    expect(rig.selectedHeadphoneId).toBe('id-2');
    expect(stored(env)).toMatchObject({
      selectedAmpId: 'id-1',
      selectedHeadphoneId: 'id-2',
    });
    env.service.removeAmp('id-1');
    rig = env.store.get(env.service.rig);
    expect(rig.amps).toEqual([]);
    expect(rig.selectedAmpId).toBeNull();
    expect(rig.headphones).toHaveLength(1);
    expect(rig.selectedHeadphoneId).toBe('id-2');
  });

  it('越界参数夹回，非法名称与到达上限的新增被拒绝', async () => {
    const env = setup();
    await ready(env.service);
    env.service.addAmp({ name: 'Loud', vrmsAt0db: 99, gainDb: -99 });
    const rig = env.store.get(env.service.rig);
    expect(rig.amps[0]).toMatchObject({ vrmsAt0db: 10, gainDb: -99 });
    expect(env.service.addAmp({ name: '   ', vrmsAt0db: 2, gainDb: 0 })).toBeNull();
    expect(env.service.addHeadphone({
      name: '',
      impedanceOhm: 300,
      sensitivity: 100,
      sensitivityUnit: 'dbPerMw',
    })).toBeNull();
  });

  it('重复 id 只保留第一个', async () => {
    const host = installFakeHost();
    const store = createStore();
    const data = createMemoryDataWriter();
    const writer = createConfigWriter(host.fb, data.writer);
    const service = startSoundPressure(store, writer, host.fb, () => 'same');
    onTestFinished(() => service.dispose());
    await service.ready;
    service.addAmp({ name: 'First', vrmsAt0db: 2, gainDb: 0 });
    service.addAmp({ name: 'Second', vrmsAt0db: 1, gainDb: 0 });
    expect(store.get(service.rig).amps).toHaveLength(1);
    expect(store.get(service.rig).amps[0]?.name).toBe('First');
  });

  it('拒绝未来的配置版本，读存档时丢掉不存在的选择', async () => {
    const env = setup({
      config: {
        [HEADPHONE_RIG_KEY]: {
          version: 2,
          amps: [{ id: 'a', name: 'Old', vrmsAt0db: 2, gainDb: 0 }],
          headphones: [],
          selectedAmpId: 'a',
          selectedHeadphoneId: null,
        },
      },
    });
    await ready(env.service);
    expect(env.store.get(env.service.rig)).toEqual(emptyRig());
  });

  it('保存失败保留当前值，state 记下失败', async () => {
    const env = setup();
    await ready(env.service);
    env.host.answer('config.set', hostFailure('OPERATION_FAILED'));
    env.service.addAmp({ name: 'Desk', vrmsAt0db: 2, gainDb: 0 });
    await env.service.persistence.settled();
    expect(env.store.get(env.service.rig).amps).toHaveLength(1);
    expect(
      env.store.get(env.service.persistence.state).get(HEADPHONE_RIG_KEY)?.status,
    ).toBe('failed');
  });
});
