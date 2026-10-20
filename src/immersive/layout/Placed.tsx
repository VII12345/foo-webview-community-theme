import type { ReactNode } from 'react';
import type { ImmersivePanelId } from '../page/immersiveComponents.ts';
import type { StageBox } from '../paper/paperComponentLayout.ts';
import type { ImmersivePlacement } from './immersivePlacement.ts';
import { placementTransform } from './immersiveBoxes.ts';
import styles from './placed.module.css';

/** 一组摆放覆盖：`${view}/${tier}` → 模块 id → 覆盖。 */
export type Placements = Readonly<Record<string, ImmersivePlacement>>;

/**
 * 覆盖落在组件外层的一套变换上：组件内部照旧按舞台坐标排，外层平移到位并按比例缩放，
 * 所以挪位置与改大小都不用动组件自己的排版。
 *
 * 外层铺满舞台（`inset: 0`），里面的件照旧相对舞台定位；缩放的原点取该组件默认盒子的左上角，
 * 缩放就在原地发生，不会连着整幅舞台一起缩。
 */
export function Placed({
  id,
  boxes,
  placements,
  children,
}: {
  readonly id: ImmersivePanelId;
  readonly boxes: ReadonlyMap<ImmersivePanelId, StageBox>;
  readonly placements: Placements;
  readonly children: ReactNode;
}) {
  const transform = placementTransform(boxes.get(id), placements[id]);
  if (!transform) return <>{children}</>;
  return (
    <div className={styles.placed} style={transform}>
      {children}
    </div>
  );
}
