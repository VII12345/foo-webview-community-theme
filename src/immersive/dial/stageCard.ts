/*
 * 卡片场景的舞台坐标。两个卡片档（`card` / `cardLyrics`）把 1920 宽的舞台左右均分：左半 0–960 放卡片，
 * 右半 960–1920 放歌词。卡片整块在左半里水平居中，歌词在右半里水平居中。
 *
 * 卡片竖排：封面 460 见方 → 曲名/艺人那一行（只有卡片歌词档出）→ 进度条 → 传输三键 → 三格。
 * 三格的左缘跟着封面走，所以整块与罗盘一样，底边落在 842 附近。
 */
export const STAGE_CARD_COVER = { x: 250, y: 220, size: 460 } as const;
/** 卡片内容的左缘与宽：居中在左半（0–960），左右各留 250。 */
export const STAGE_CARD = {
  left: STAGE_CARD_COVER.x,
  width: STAGE_CARD_COVER.size,
} as const;
/** 卡片里各件的缩放：传输键与罗盘一致，用原尺寸（56 / 80）。 */
export const STAGE_CARD_SCALE = 1;

/** 右半的歌词区：从舞台中线到右缘，上下与卡片齐平。 */
export const STAGE_LYRICS_PANE = {
  left: 960,
  top: 220,
  width: 960,
  height: 622,
} as const;
