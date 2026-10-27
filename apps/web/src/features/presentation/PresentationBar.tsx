import { Maximize, Minimize, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useProjectStore } from '@/state/project-store';
import { Button, IconButton } from '@/shared/ui/Button';
import { isFullscreen, stopPresentation, toggleFullscreen } from './presentation';

/** Lo único que queda a la vista en la presentación: el nombre, pantalla completa y salir. */
export function PresentationBar() {
  const { t } = useTranslation();
  const name = useProjectStore((s) => s.project.meta.name);
  const [fullscreen, setFullscreen] = useState(isFullscreen);
  useEffect(() => {
    const update = () => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  return (
    <div
      className="absolute top-3 right-3 flex items-center gap-1 rounded-xl bg-white/90 p-1 pl-3 shadow-lg backdrop-blur"
      data-testid="presentation-bar"
    >
      <span className="max-w-[40vw] truncate text-sm font-semibold text-slate-800">{name}</span>
      <IconButton
        label={t(fullscreen ? 'presentation.exitFullscreen' : 'presentation.fullscreen')}
        onClick={toggleFullscreen}
        data-testid="presentation-fullscreen"
      >
        {fullscreen ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
      </IconButton>
      <Button
        size="sm"
        variant="ghost"
        icon={<X className="size-4" />}
        onClick={stopPresentation}
        data-testid="presentation-exit"
      >
        {t('presentation.exit')}
      </Button>
    </div>
  );
}
