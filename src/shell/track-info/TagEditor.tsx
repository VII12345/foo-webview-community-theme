import { Button, Input, Tooltip } from '@fluentui/react-components';
import { Add16Regular, Delete16Regular, Dismiss16Regular } from '@fluentui/react-icons';
import { useState } from 'react';
import type { Translate } from '../../i18n/translate.ts';
import styles from './TagEditor.module.css';

export interface TagDraft {
  readonly name: string;
  readonly values: readonly string[];
  /** 摘要里的同义标签：名字固定，只改值。 */
  readonly fixedName?: boolean;
}

export interface TagEditorProps {
  readonly drafts: readonly TagDraft[];
  readonly t: Translate;
  readonly busy: boolean;
  readonly allowDelete?: boolean;
  readonly onSave: (drafts: readonly TagDraft[]) => Promise<boolean>;
  readonly onDelete?: () => Promise<boolean>;
  readonly onCancel: () => void;
}

/**
 * 标签编辑：一行名字（摘要里的别名固定不可改），下面每个值一行；加值、删值、保存或取消。
 * 空值保存时由服务过滤；整份空掉就是删除这个标签。写入失败时留在编辑态并提示。
 */
export function TagEditor({
  drafts,
  t,
  busy,
  allowDelete = false,
  onSave,
  onDelete,
  onCancel,
}: TagEditorProps) {
  const [state, setState] = useState<TagDraft[]>(() =>
    drafts.map((draft) => ({ ...draft, values: [...draft.values] })),
  );
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const update = (index: number, patch: Partial<TagDraft>) =>
    setState((current) =>
      current.map((draft, at) => (at === index ? { ...draft, ...patch } : draft)),
    );
  const invalid = state.some((draft) => !draft.name.trim());
  const save = async () => {
    if (saving || busy || invalid) return;
    setSaving(true);
    setFailed(false);
    const ok = await onSave(state);
    setSaving(false);
    if (!ok) setFailed(true);
  };
  const remove = async () => {
    if (!onDelete || saving || busy) return;
    setSaving(true);
    setFailed(false);
    const ok = await onDelete();
    setSaving(false);
    if (!ok) setFailed(true);
  };
  const disabled = saving || busy;
  return (
    <div className={styles.root} data-tag-editor>
      {state.map((draft, index) => (
        <div className={styles.draft} key={`${draft.name}:${index}`}>
          {!draft.fixedName && (
            <Input
              className={styles.name}
              size="small"
              aria-label={t('trackInfo.tagName')}
              placeholder={t('trackInfo.tagName')}
              value={draft.name}
              disabled={disabled}
              onChange={(_, data) => update(index, { name: data.value })}
            />
          )}
          <div className={styles.values}>
            {draft.values.map((value, at) => (
              <div className={styles.value} key={at}>
                <Input
                  className={styles.input}
                  size="small"
                  aria-label={t('trackInfo.tagValue')}
                  placeholder={t('trackInfo.tagValue')}
                  value={value}
                  disabled={disabled}
                  onChange={(_, data) =>
                    update(index, {
                      values: draft.values.map((item, where) =>
                        where === at ? data.value : item,
                      ),
                    })
                  }
                />
                <Tooltip content={t('trackInfo.removeValue')} relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<Dismiss16Regular />}
                    aria-label={t('trackInfo.removeValue')}
                    disabled={disabled}
                    onClick={() =>
                      update(index, {
                        values: draft.values.filter((_, where) => where !== at),
                      })
                    }
                  />
                </Tooltip>
              </div>
            ))}
            <Button
              appearance="subtle"
              size="small"
              icon={<Add16Regular />}
              disabled={disabled}
              onClick={() => update(index, { values: [...draft.values, ''] })}
            >
              {t('trackInfo.addValue')}
            </Button>
          </div>
        </div>
      ))}
      {failed && (
        <p className={styles.failed} role="alert">
          {t('trackInfo.saveFailed')}
        </p>
      )}
      <div className={styles.actions}>
        <Button size="small" appearance="primary" disabled={disabled || invalid} onClick={() => void save()}>
          {saving ? t('trackInfo.saving') : t('trackInfo.save')}
        </Button>
        <Button size="small" appearance="subtle" disabled={saving} onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        {allowDelete && onDelete && (
          <Tooltip content={t('trackInfo.deleteTag')} relationship="label">
            <Button
              size="small"
              appearance="subtle"
              icon={<Delete16Regular />}
              aria-label={t('trackInfo.deleteTag')}
              disabled={disabled}
              onClick={() => void remove()}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
