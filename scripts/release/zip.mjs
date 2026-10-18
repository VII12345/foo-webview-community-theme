// 发行包的 zip 写入。只写 stored 与 deflate，不写 zip64、加密和额外字段，时间戳固定为 1980-01-01，
// 同样的输入得到同样的字节。zipForRelease 打包后用客户端的解包代码核对一遍，客户端不认的包不发布。

import { readZip } from '../../src/update/zipArchive.ts';
import { zipEntries } from './zipEntries.mjs';

export { zipEntries };

/**
 * 按路径排序后打包并核对：客户端必须原样解出同样的文件与字节。
 * @param {{ path: string, bytes: Uint8Array }[]} files
 */
export async function zipForRelease(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const zip = zipEntries(sorted);
  const reading = await readZip(zip);
  if (!reading.ok) throw new Error(`客户端不认这个包：${reading.problem}`);
  if (
    reading.files.length !== sorted.length ||
    reading.files.some(
      (file, index) =>
        file.path !== sorted[index]?.path ||
        Buffer.compare(Buffer.from(file.bytes), Buffer.from(sorted[index].bytes)) !== 0,
    )
  )
    throw new Error('客户端解出的内容与打包的文件不一致');
  return zip;
}
