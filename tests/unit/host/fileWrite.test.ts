import { describe, expect, it, vi } from 'vitest';
import { writeTextFile, type ProfileFileWriter } from '../../../src/host/fileWrite.ts';

function writer(
  handler: (
    path: string,
    text: string,
    opts?: { atomic?: boolean },
  ) => Promise<unknown>,
): ProfileFileWriter {
  return { write: handler } as unknown as ProfileFileWriter;
}

describe('writeTextFile', () => {
  it('原子写成功时只调用一次', async () => {
    const write = vi.fn(async () => ({ success: true, bytesWritten: 2 }));
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: true, code: null, win32: null });
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith('C:\\profile\\a.json', '{}', { atomic: true });
  });

  it('PERMISSION_DENIED 不退回普通写', async () => {
    const write = vi.fn(async () => ({
      success: false,
      error: 'protected system path',
      code: 'PERMISSION_DENIED',
    }));
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: false, code: 'PERMISSION_DENIED', win32: null });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('只有 OPERATION_FAILED 退回普通写，并保留第一次的 Win32 错误号', async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        error: 'write failed',
        code: 'OPERATION_FAILED',
        details: { value: 32 },
      })
      .mockResolvedValueOnce({ success: true, bytesWritten: 2 });
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: true, code: null, win32: null });
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[0]).toEqual(['C:\\profile\\a.json', '{}', { atomic: true }]);
    expect(write.mock.calls[1]).toHaveLength(2);
  });

  it('两次都失败时返回第二次的错误码，Win32 号沿用第一次', async () => {
    const write = vi
      .fn()
      .mockResolvedValueOnce({
        success: false,
        code: 'OPERATION_FAILED',
        details: { value: 5 },
      })
      .mockResolvedValueOnce({
        success: false,
        code: 'INVALID_PATH',
      });
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: false, code: 'INVALID_PATH', win32: 5 });
  });

  it('调用被 reject 时不重试：写入可能已经到达宿主', async () => {
    const write = vi.fn(async () => {
      throw new Error('bridge timeout');
    });
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: false, code: null, win32: null });
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('NOT_SUPPORTED 不退回普通写', async () => {
    const write = vi.fn(async () => ({ success: false, code: 'NOT_SUPPORTED' }));
    const result = await writeTextFile(writer(write), 'C:\\profile\\a.json', '{}');
    expect(result).toEqual({ ok: false, code: 'NOT_SUPPORTED', win32: null });
    expect(write).toHaveBeenCalledTimes(1);
  });
});
