import { renameProject } from '@decodeny/domain';
import { Download, FilePlus2, FolderOpen, Redo2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@/config';
import { exportCurrentProject, requestOpenFile } from '@/features/io/project-actions';
import { useIoStore } from '@/features/io/io-store';
import { Button, IconButton } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { useCanRedo, useCanUndo, useProjectStore } from '@/state/project-store';
import { useCommand } from '@/state/use-command';
import { LanguageSwitch } from './LanguageSwitch';

export function TopBar() {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.project.meta.name);
  const undo = useProjectStore((s) => s.undo);
  const redo = useProjectStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const run = useCommand();
  const confirm = useIoStore((s) => s.setConfirmation);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
      <div className="flex items-center gap-2 pr-2">
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="hidden text-base font-bold tracking-tight text-brand-900 sm:inline">
          {APP_NAME}
        </span>
      </div>
      <TextField
        className="w-40 sm:w-64"
        label={t('topbar.projectName')}
        hideLabel
        value={name}
        maxLength={120}
        inputClassName="border-transparent hover:border-slate-300 font-medium"
        onCommit={(value) => run(renameProject, { name: value })}
        testId="project-name"
      />
      <div className="ml-auto flex items-center gap-1">
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
        <LanguageSwitch />
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
