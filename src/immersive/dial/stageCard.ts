/*
 * 卡片场景左区的舞台坐标。与罗盘占同一块地方：封面还是 460 见方、顶边 270，下面依次是星级/更多、
 * 进度条与传输三键；三格（Date · Track · Label）仍在 776，所以整块与罗盘一样到 842 为止。
 * 不写罗盘的三圈环、转动轨道与刻度字。
 */
export const STAGE_CARD_COVER = { x: 150, y: 270, size: 460 } as const;
/** 卡片里各件的缩放：传输键与罗盘一致，用原尺寸（56 / 80）。 */
export const STAGE_CARD_SCALE = 1;
