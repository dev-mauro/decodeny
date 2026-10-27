import { LogOut, UserPlus, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';
import { Button, IconButton } from '@/shared/ui/Button';
import { CopyBox as SharedCopyBox, Field, inputClass } from '@/shared/ui/CopyBox';
import { Dialog } from '@/shared/ui/Dialog';
import { useCollabStore, type Invite } from './collab-store';
import { HOST_ID } from './protocol';
import {
  acceptAnswer,
  cancelInvite,
  createInvite,
  dismissJoin,
  leaveSession,
  prepareJoin,
  readInviteFromUrl,
  startHosting,
  type CollabErrorKey,
} from './session';

const NAME_KEY = 'decodeny.collabName';

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // Solo para no volver a escribirlo.
  }
}

function ErrorText({ error }: { readonly error: CollabErrorKey | null }) {
  const { t } = useTranslation();
  if (!error) return null;
  return (
    <p className="text-sm text-red-600" role="alert" data-testid="collab-error">
      {t(error)}
    </p>
  );
}

function Participants() {
  const { t } = useTranslation();
  const me = useCollabStore((s) => s.me);
  const peers = useCollabStore((s) => s.peers);
  if (!me) return null;
  const all = [me, ...peers];
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {t('collab.participants')}
      </h3>
      <ul className="flex flex-col gap-1" data-testid="collab-participants">
        {all.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm text-slate-800">
            <span className="size-3 rounded-full" style={{ background: p.color }} aria-hidden />
            <span className="font-medium">{p.name}</span>
            <span className="text-xs text-slate-400">
              {[
                p.id === me.id ? t('collab.you') : null,
                p.id === HOST_ID ? t('collab.hostTag') : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InviteRow({ invite }: { readonly invite: Invite }) {
  const { t } = useTranslation();
  return (
    <li
      className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3"
      data-testid="collab-invite"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">
          {invite.status === 'preparing' && t('collab.preparing')}
          {invite.status === 'waiting' && t('collab.inviteHint')}
          {invite.status === 'connecting' && t('collab.connecting')}
          {invite.status === 'failed' && (
            <span className="text-red-600">{t('collab.inviteFailed')}</span>
          )}
        </p>
        <IconButton
          label={t('collab.cancelInvite')}
          onClick={() => cancelInvite(invite.peerId)}
          className="size-7"
        >
          <X className="size-4" />
        </IconButton>
      </div>
      {invite.link && invite.status !== 'failed' && (
        <CopyBox label={t('collab.inviteLink')} value={invite.link} testId="collab-invite-link" />
      )}
    </li>
  );
}

function HostPanel() {
  const { t } = useTranslation();
  const invites = useCollabStore((s) => s.invites);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<CollabErrorKey | null>(null);
  const waiting = invites.some((i) => i.status === 'waiting');
  const connect = async () => {
    const out = await acceptAnswer(answer);
    setError(out);
    if (!out) setAnswer('');
  };
  return (
    <div className="flex flex-col gap-4">
      <Participants />
      {invites.length > 0 && (
        <ul className="flex flex-col gap-2">
          {invites.map((invite) => (
            <InviteRow key={invite.peerId} invite={invite} />
          ))}
        </ul>
      )}
      {waiting && (
        <div className="flex flex-col gap-2">
          <Field label={t('collab.answerField')}>
            {(id) => (
              <textarea
                id={id}
                value={answer}
                rows={3}
                onChange={(e) => setAnswer(e.target.value)}
                className={cn(inputClass, 'resize-none py-1.5 font-mono text-xs')}
                data-testid="collab-answer-input"
              />
            )}
          </Field>
          <ErrorText error={error} />
          <Button
            variant="primary"
            disabled={answer.trim() === ''}
            onClick={() => void connect()}
            data-testid="collab-connect"
          >
            {t('collab.connect')}
          </Button>
        </div>
      )}
      <Button
        icon={<UserPlus className="size-4" />}
        onClick={() => void createInvite()}
        data-testid="collab-invite-create"
      >
        {t('collab.invite')}
      </Button>
      <p className="text-xs text-slate-400">{t('collab.sessionHint')}</p>
    </div>
  );
}

function JoinPanel() {
  const { t } = useTranslation();
  const join = useCollabStore((s) => s.join);
  if (!join) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-slate-800">
        {t('collab.joining', { name: join.hostName })}
      </p>
      {join.status === 'preparing' && (
        <p className="text-sm text-slate-500">{t('collab.preparing')}</p>
      )}
      {(join.status === 'answer' || join.status === 'connected') && join.answer && (
        <>
          <p className="text-sm text-slate-700">
            {t('collab.answerTitle', { name: join.hostName })}
          </p>
          <CopyBox label={t('collab.answerField')} value={join.answer} testId="collab-answer" />
          <p className="text-xs text-slate-500">
            {join.status === 'connected' ? t('collab.connecting') : t('collab.answerHint')}
          </p>
        </>
      )}
      {join.status === 'failed' && (
        <>
          <ErrorText error="collab.connectFailed" />
          <p className="text-xs text-slate-500">{t('collab.limitations')}</p>
        </>
      )}
    </div>
  );
}

function StartPanel() {
  const { t } = useTranslation();
  const joinCode = useCollabStore((s) => s.joinCode);
  const [name, setName] = useState(storedName);
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<CollabErrorKey | null>(null);
  const ready = name.trim() !== '';
  const join = async (text: string) => {
    rememberName(name);
    setError(await prepareJoin(text, name));
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label={t('collab.yourName')}>
        {(id) => (
          <input
            id={id}
            value={name}
            maxLength={40}
            placeholder={t('collab.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
            className={cn(inputClass, 'h-9')}
            data-testid="collab-name"
          />
        )}
      </Field>
      {joinCode ? (
        <section className="flex flex-col gap-2">
          <p className="text-sm text-slate-600">{t('collab.joiningHint')}</p>
          <ErrorText error={error} />
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => void join(joinCode)}
            data-testid="collab-join"
          >
            {t('collab.joinAction')}
          </Button>
        </section>
      ) : (
        <>
          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-800">{t('collab.host')}</h3>
            <p className="text-xs text-slate-500">{t('collab.hostHint')}</p>
            <Button
              variant="primary"
              disabled={!ready}
              icon={<Users className="size-4" />}
              onClick={() => {
                rememberName(name);
                startHosting(name);
                void createInvite();
              }}
              data-testid="collab-host"
            >
              {t('collab.host')}
            </Button>
          </section>
          <section className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
            <h3 className="text-sm font-semibold text-slate-800">{t('collab.join')}</h3>
            <Field label={t('collab.inviteField')}>
              {(id) => (
                <input
                  id={id}
                  value={invite}
                  placeholder={t('collab.joinHint')}
                  onChange={(e) => setInvite(e.target.value)}
                  className={cn(inputClass, 'h-9 font-mono text-xs')}
                  data-testid="collab-invite-input"
                />
              )}
            </Field>
            <ErrorText error={error} />
            <Button
              disabled={!ready || invite.trim() === ''}
              onClick={() => void join(invite)}
              data-testid="collab-join"
            >
              {t('collab.joinAction')}
            </Button>
          </section>
        </>
      )}
      <p className="text-xs text-slate-400">{t('collab.limitations')}</p>
    </div>
  );
}

/** Diálogo «Colaborar»: crear una sesión e invitar, o unirse con un enlace. */
export function CollabDialog() {
  const { t } = useTranslation();
  const open = useCollabStore((s) => s.dialogOpen);
  const setOpen = useCollabStore((s) => s.setDialogOpen);
  const role = useCollabStore((s) => s.role);
  const join = useCollabStore((s) => s.join);
  useEffect(() => {
    readInviteFromUrl();
    // Cerrar o recargar la página deja la sesión (el resto se entera de inmediato).
    const onHide = () => leaveSession();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  const footer =
    role === 'host' ? (
      <Button
        variant="danger"
        icon={<LogOut className="size-4" />}
        onClick={leaveSession}
        data-testid="collab-end"
      >
        {t('collab.end')}
      </Button>
    ) : role === 'guest' ? (
      <Button
        variant="danger"
        icon={<LogOut className="size-4" />}
        onClick={leaveSession}
        data-testid="collab-leave"
      >
        {t('collab.leave')}
      </Button>
    ) : join ? (
      <Button onClick={dismissJoin} data-testid="collab-join-cancel">
        {t('io.cancel')}
      </Button>
    ) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={t('collab.title')}
      description={t('collab.description')}
      size="sm"
      closeLabel={t('io.close')}
      footer={footer}
    >
      <div data-testid="collab-dialog">
        {role === 'host' ? (
          <HostPanel />
        ) : role === 'guest' ? (
          <div className="flex flex-col gap-3">
            <Participants />
            <p className="text-xs text-slate-400">{t('collab.sessionHint')}</p>
          </div>
        ) : join ? (
          <JoinPanel />
        ) : (
          <StartPanel />
        )}
      </div>
    </Dialog>
  );
}

/** Botón de la barra superior: abre el diálogo y muestra los colores de quienes están. */
export function CollabButton() {
  const { t } = useTranslation();
  const setOpen = useCollabStore((s) => s.setDialogOpen);
  const me = useCollabStore((s) => s.me);
  const peers = useCollabStore((s) => s.peers);
  const count = me ? peers.length + 1 : 0;
  return (
    <Button
      size="sm"
      variant={me ? 'secondary' : 'ghost'}
      onClick={() => setOpen(true)}
      title={count > 0 ? t('collab.inSession', { count }) : t('collab.button')}
      aria-label={count > 0 ? t('collab.inSession', { count }) : t('collab.button')}
      data-testid="collab-open"
      icon={<Users className="size-4" />}
    >
      {me ? (
        <span className="flex -space-x-1" data-testid="collab-count" data-count={count}>
          {[me, ...peers].slice(0, 4).map((p) => (
            <span
              key={p.id}
              className="size-3 rounded-full ring-2 ring-white"
              style={{ background: p.color }}
            />
          ))}
        </span>
      ) : (
        <span className="hidden lg:inline">{t('collab.button')}</span>
      )}
    </Button>
  );
}

function CopyBox(props: {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
}) {
  const { t } = useTranslation();
  return <SharedCopyBox {...props} copyLabel={t('collab.copy')} copiedLabel={t('collab.copied')} />;
}
