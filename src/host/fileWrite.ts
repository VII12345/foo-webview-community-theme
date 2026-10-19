import type { fb } from 'foo-webview-sdk/bridge';
import { settle } from './hostCall.ts';

/**
 * 主题自己写 profile 数据（统计、测量档案）的统一入口。
 *
 * 先走原子写；只有宿主明确答 `OPERATION_FAILED` 时才退回普通写。退回只覆盖
 * 「临时文件/替换失败」这类兼容性问题，不是放宽路径安全：`PERMISSION_DENIED`、
 * `NOT_SUPPORTED`、`INVALID_PARAMS` 以及整条调用被 reject（`settle` 返回
 * `null`，写入可能已经到达宿主）都不重试。
 */
export interface TextFileWriteResult {
  readonly ok: boolean;
  /** 最后一次失败的宿主错误码；调用被 reject 时为 null。 */
  readonly code: string | null;
  /** 失败信封里的 Win32 错误号（`details.value`），没有时为 null。 */
  readonly win32: number | null;
}

export type ProfileFileWriter = Pick<typeof fb.file, 'write'>;

const RETRYABLE = new Set(['OPERATION_FAILED']);

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function codeOf(answer: unknown): string | null {
  if (typeof answer !== 'object' || answer === null) return null;
  return textOf(Reflect.get(answer, 'code'));
}

function win32Of(answer: unknown): number | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const details: unknown = Reflect.get(answer, 'details');
  if (typeof details !== 'object' || details === null) return null;
  const value: unknown = Reflect.get(details, 'value');
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function writeTextFile(
  file: ProfileFileWriter,
  path: string,
  text: string,
): Promise<TextFileWriteResult> {
  const first = await settle(() => file.write(path, text, { atomic: true }));
  if (first?.success === true) return { ok: true, code: null, win32: null };
  if (!first) return { ok: false, code: null, win32: null };
  const code = codeOf(first);
  const win32 = win32Of(first);
  if (!code || !RETRYABLE.has(code)) return { ok: false, code, win32 };
  const second = await settle(() => file.write(path, text));
  if (second?.success === true) return { ok: true, code: null, win32: null };
  return {
    ok: false,
    code: codeOf(second) ?? code,
    win32: win32Of(second) ?? win32,
  };
}
