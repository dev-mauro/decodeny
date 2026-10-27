import { renameProject } from '@decodeny/domain';
import { Download, EllipsisVertical, FilePlus2, FolderOpen, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
      />
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
          <LanguageSwitch />
          <span className="mx-1 h-6 w-px bg-slate-200" aria-hidden />
        </div>
        <MoreMenu onNew={() => confirm('new')} />
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

/** Pantallas angostas: archivo e idioma en un menú, para dejar lugar al nombre del proyecto. */
function MoreMenu({ onNew }: { readonly onNew: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  const item =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100';
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={root} className="relative sm:hidden">
      <IconButton
        label={t('mobile.more')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="topbar-more"
      >
        <EllipsisVertical className="size-4" />
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute top-10 right-0 z-20 flex w-52 flex-col gap-0.5 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <button type="button" role="menuitem" className={item} onClick={act(onNew)}>
            <FilePlus2 className="size-4 text-slate-500" aria-hidden />
            {t('topbar.new')}
          </button>
          <button type="button" role="menuitem" className={item} onClick={act(requestOpenFile)}>
            <FolderOpen className="size-4 text-slate-500" aria-hidden />
            {t('topbar.open')}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={act(exportCurrentProject)}
            data-testid="menu-export"
          >
            <Download className="size-4 text-slate-500" aria-hidden />
            {t('topbar.export')}
          </button>
          <div className="mt-1 border-t border-slate-100 px-2 pt-1.5">
            <LanguageSwitch />
          </div>
        </div>
      )}
    </div>
  );
}
