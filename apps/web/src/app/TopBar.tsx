import { renameProject } from '@decodeny/domain';
import {
  Download,
  EllipsisVertical,
  FilePlus2,
  FolderOpen,
  Lock,
  Redo2,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@/config';
import { CollabButton } from '@/features/collab/CollabDialog';
import { exportCurrentProject, requestOpenFile } from '@/features/io/project-actions';
import { useIoStore } from '@/features/io/io-store';
import { Button, IconButton } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { useCanRedo, useCanUndo, useProjectStore, useReadOnly } from '@/state/project-store';
import { useCommand } from '@/state/use-command';
import { MenuButton } from '@/shared/ui/MenuButton';
import { OptionsMenu } from './OptionsMenu';

export function TopBar() {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.project.meta.name);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const run = useCommand();
  const confirm = useIoStore((s) => s.setConfirmation);
  const readOnly = useReadOnly();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 [@media(orientation:landscape)_and_(max-height:600px)]:h-11">
      <div className="flex items-center gap-2 pr-2">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="size-7" />
        <span className="hidden text-base font-bold tracking-tight text-brand-900 sm:inline">
          {APP_NAME}
        </span>
      </div>
      <TextField
        className="min-w-0 flex-1 sm:w-64 sm:flex-none"
        label={t('topbar.projectName')}
        hideLabel
        value={name}
        maxLength={120}
        inputClassName="border-transparent hover:border-slate-300 font-medium"
        onCommit={(value) => run(renameProject, { name: value })}
        testId="project-name"
        disabled={readOnly}
      />
      {readOnly && (
        <span
          className="flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
          data-testid="read-only-badge"
        >
          <Lock className="size-3" aria-hidden />
          <span className="hidden sm:inline">{t('options.readOnly')}</span>
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        <div className="hidden items-center gap-1 sm:flex">
          <Button
            size="sm"
            variant="ghost"
            icon={<FilePlus2 className="size-4" />}
            onClick={() => confirm('new')}
          >
            <span className="hidden md:inline">{t('topbar.new')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<FolderOpen className="size-4" />}
            title={`${t('topbar.open')} (${t('topbar.shortcutOpen')})`}
            onClick={requestOpenFile}
            data-testid="open-project"
          >
            <span className="hidden md:inline">{t('topbar.open')}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Download className="size-4" />}
            title={`${t('topbar.export')} (${t('topbar.shortcutExport')})`}
            onClick={exportCurrentProject}
            data-testid="export-project"
          >
            <span className="hidden md:inline">{t('topbar.export')}</span>
          </Button>
          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
        </div>
        <MoreMenu onNew={() => confirm('new')} />
        <CollabButton />
        <OptionsMenu />
        <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
        <IconButton
          label={t('topbar.undo')}
          shortcut={t('topbar.shortcutUndo')}
          disabled={!canUndo}
          onClick={undo}
        >
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton
          label={t('topbar.redo')}
          shortcut={t('topbar.shortcutRedo')}
          disabled={!canRedo}
          onClick={redo}
        >
          <Redo2 className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}

/** Pantallas angostas: las acciones de archivo en un menú, para dejar lugar al nombre. */
function MoreMenu({ onNew }: { readonly onNew: () => void }) {
  const { t } = useTranslation();
  const item =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';
  return (
    <MenuButton
      label={t('mobile.more')}
      icon={<EllipsisVertical className="size-4" />}
      testId="topbar-more"
      className="sm:hidden"
      panelClassName="w-52 gap-0.5"
    >
      {(close) => (
        <>
          {[
            { icon: FilePlus2, label: t('topbar.new'), run: onNew, id: 'menu-new' },
            { icon: FolderOpen, label: t('topbar.open'), run: requestOpenFile, id: 'menu-open' },
            {
              icon: Download,
              label: t('topbar.export'),
              run: exportCurrentProject,
              id: 'menu-export',
            },
          ].map(({ icon: Icon, label, run, id }) => (
            <button
              key={id}
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                close();
                run();
              }}
              data-testid={id}
            >
              <Icon className="size-4 text-slate-500" aria-hidden />
              {label}
            </button>
          ))}
        </>
      )}
    </MenuButton>
  );
}
