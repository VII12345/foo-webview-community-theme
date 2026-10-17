/**
 * 图纸舞台与版心的场景档：五个沉浸场景共用同一张图纸，差别只在左区与右栏怎么写。
 * `paper` 原图纸、`focus` 原图纸＋聚焦歌词、`lyrics` 原图纸＋右栏换动画歌词、`card` 左区换卡片、
 * `cardLyrics` 左区换卡片且右栏去掉四行字（只留动画歌词）。
 */
export type PaperVariant = 'paper' | 'focus' | 'lyrics' | 'card' | 'cardLyrics';
