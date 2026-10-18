import { atom } from 'jotai/vanilla';

/**
 * foobar2000 当前输出设备的显示名，由输出设备服务写入。放在 playback 层，供沉浸视图等
 * 不能直接依赖 shell 的模块读取。
 */
export const currentOutputDeviceNameAtom = atom<string | undefined>(undefined);
