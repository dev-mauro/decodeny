import type { ViewerCameraPose, ViewerPeerPose, ViewerPeers } from '@decodeny/viewer';
import { useMemo } from 'react';
import {
  assetBlob as localAssetBlob,
  onLocalAsset,
  saveAssetBlob,
} from '@/features/assets/asset-store';
import { i18next } from '@/i18n';
import { notify } from '@/state/notifications-store';
import { useProjectStore } from '@/state/project-store';
import { activeLevel, useUiStore } from '@/state/ui-store';
import { assetBlob, assetMessage } from './asset-transfer';
import { IDLE_SESSION, useCollabStore, type Invite, type PresenceMeta } from './collab-store';
import { GuestSync } from './guest-sync';
import { HostSync } from './host-sync';
import { PeerLink, type LinkChannel } from './peer-link';
import {
  HOST_ID,
  isGuestMessage,
  isHostMessage,
  PEER_COLORS,
  type HostMessage,
  type PeerInfo,
  type PeerPose,
} from './protocol';
import {
  parseRoomCode,
  type RoomJoin,
  type RoomRequest,
  type RoomSignaling,
} from './room-signaling';
import { loadRooms } from './rooms';
import {
  answerCodeFrom,
  decodeSignal,
  encodeSignal,
  inviteCodeFrom,
  inviteLink,
} from './signal-codec';

/**
 * Sesión colaborativa: une el transporte (WebRTC), la sincronización del documento y la
 * presencia. Vive fuera de React, como las demás acciones de la app; la interfaz lee
 * `useCollabStore` y llama a estas funciones.
 */

/** Tiempo para conectar después de pegar la respuesta (o de recibir una solicitud por sala). */
const CONNECT_TIMEOUT_MS = 30_000;
/** Cuánto espera el invitado a que el anfitrión conteste su solicitud en la sala. */
const ROOM_ANSWER_TIMEOUT_MS = 60_000;
/** Parámetro de la dirección con el código de una sala: `…/?sala=K7Q4MD`. */
export const ROOM_PARAM = 'sala';
/** La pose propia se reenvía aunque no cambie: llega a quien entra y repone lo perdido. */
const HEARTBEAT_MS = 1000;
const MAX_NAME = 40;

const set = useCollabStore.setState;
const get = useCollabStore.getState;

/** Errores que la interfaz muestra al invitar o al unirse. */
export type CollabErrorKey =
  | 'collab.answerInvalid'
  | 'collab.answerUnknown'
  | 'collab.inviteInvalid'
  | 'collab.connectFailed'
  | 'collab.roomInvalid'
  | 'collab.roomNotFound';

interface HostSession {
  readonly sync: HostSync;
  /** Invitados conectados. */
  readonly links: Map<string, PeerLink>;
  /** Invitaciones aún sin conectar. */
  readonly pending: Map<string, PeerLink>;
  readonly names: Map<string, string>;
  joined: number;
  /** Sala con código abierta (se cierra al terminar). */
  room: {
    readonly code: string;
    readonly signaling: RoomSignaling;
    readonly stop: () => void;
  } | null;
  readonly stop: () => void;
}

interface GuestSession {
  readonly link: PeerLink;
  sync: GuestSync | null;
  /** Solicitud en una sala, mientras espera la respuesta. */
  roomJoin?: RoomJoin;
  stop: () => void;
}

let host: HostSession | null = null;
let guest: GuestSession | null = null;

// --- Presencia ---

const poses = new Map<string, PeerPose>();
const poseListeners = new Set<() => void>();
let lastCamera: ViewerCameraPose | null = null;

function emitPoses(): void {
  for (const listener of poseListeners) listener();
}

function subscribePoses(listener: () => void): () => void {
  poseListeners.add(listener);
  return () => poseListeners.delete(listener);
}

function receivePose(pose: PeerPose): void {
  poses.set(pose.id, pose);
  const meta: PresenceMeta = { view: pose.view, levelId: pose.levelId, mode: pose.mode };
  const current = get().presence[pose.id];
  if (
    current?.view !== meta.view ||
    current.levelId !== meta.levelId ||
    current.mode !== meta.mode
  ) {
    set({ presence: { ...get().presence, [pose.id]: meta } });
  }
  emitPoses();
}

function forgetPeer(id: string): void {
  poses.delete(id);
  set({
    presence: Object.fromEntries(Object.entries(get().presence).filter(([key]) => key !== id)),
  });
  emitPoses();
}

function myPose(): PeerPose | null {
  const me = get().me;
  if (!me) return null;
  const ui = useUiStore.getState();
  return {
    id: me.id,
    position: lastCamera?.position ?? [0, 0, 0],
    yaw: lastCamera?.yaw ?? 0,
    pitch: lastCamera?.pitch ?? 0,
    mode: ui.navigationMode,
    view: ui.view,
    levelId: activeLevel(useProjectStore.getState().project, ui.levelId).id,
  };
}

function sendMyPose(): void {
  const pose = myPose();
  if (!pose) return;
  const message = { t: 'pose', pose } as const;
  if (host) for (const link of host.links.values()) link.sendPresence(message);
  guest?.link.sendPresence(message);
}

/** La vista 3D informa la cámara propia; se comparte con los demás. */
export function shareCameraPose(pose: ViewerCameraPose): void {
  lastCamera = pose;
  sendMyPose();
}

/** Envía la pose al cambiar de vista, de modo o de nivel, y cada segundo. */
function startPresence(): () => void {
  const unsubscribe = useUiStore.subscribe((state, previous) => {
    if (
      state.view !== previous.view ||
      state.navigationMode !== previous.navigationMode ||
      state.levelId !== previous.levelId
    ) {
      sendMyPose();
    }
  });
  const timer = setInterval(sendMyPose, HEARTBEAT_MS);
  sendMyPose();
  return () => {
    unsubscribe();
    clearInterval(timer);
  };
}

const toViewerPose = (id: string): ViewerPeerPose | undefined => {
  const pose = poses.get(id);
  return pose && { ...pose, standing: pose.mode === 'person' };
};

/** Los demás participantes que están en 3D en el mismo nivel, para el visor (`null` sin sesión). */
export function useViewerPeers(levelId: string): ViewerPeers | null {
  const peers = useCollabStore((s) => s.peers);
  const presence = useCollabStore((s) => s.presence);
  return useMemo(() => {
    if (peers.length === 0) return null;
    const list = peers.filter(
      (p) => presence[p.id]?.view === '3d' && presence[p.id]?.levelId === levelId,
    );
    return { list, pose: toViewerPose, subscribe: subscribePoses };
  }, [peers, presence, levelId]);
}

// --- Común ---

function updateInvite(peerId: string, patch: Partial<Invite>): void {
  set({ invites: get().invites.map((i) => (i.peerId === peerId ? { ...i, ...patch } : i)) });
}

function appUrl(): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}`;
}

function resetSession(): void {
  set(IDLE_SESSION);
  poses.clear();
  emitPoses();
}

const cleanName = (name: string) => name.trim().slice(0, MAX_NAME) || '?';

// --- Anfitrión ---

function hostBroadcast(message: HostMessage, except?: string): void {
  for (const [id, link] of host?.links ?? []) if (id !== except) link.send(message);
}

/** Crea una sesión con el proyecto actual; quien la crea es el anfitrión. */
export function startHosting(name: string): void {
  if (get().role) return;
  const me: PeerInfo = { id: HOST_ID, name: cleanName(name), color: PEER_COLORS[0] };
  const links = new Map<string, PeerLink>();
  const sync = new HostSync(useProjectStore, {
    broadcast: hostBroadcast,
    send: (id, message) => links.get(id)?.send(message),
  });
  set({ role: 'host', me });
  sync.start();
  const stopAssets = onLocalAsset((id, blob) => {
    void assetMessage(id, blob).then((message) => hostBroadcast(message));
  });
  const stopPresence = startPresence();
  host = {
    sync,
    links,
    pending: new Map(),
    names: new Map(),
    joined: 0,
    room: null,
    stop: () => {
      stopAssets();
      stopPresence();
      sync.stop();
    },
  };
}

/**
 * Anfitrión: abre una sala con código. Cada solicitud que llega se contesta sola; la sala queda
 * abierta para más personas hasta terminar la sesión.
 */
export async function openRoom(): Promise<void> {
  const session = host;
  const me = get().me;
  if (!session || !me || session.room) return;
  set({ room: { code: null, status: 'opening' } });
  try {
    const signaling = await loadRooms();
    const code = await signaling.openRoom(me.name);
    if (host !== session) {
      void signaling.closeRoom(code).catch(() => undefined);
      return;
    }
    const stopListening = signaling.onRequest(code, (request) => {
      void hostAcceptRequest(session, signaling, code, request);
    });
    session.room = { code, signaling, stop: stopListening };
    set({ room: { code, status: 'open' } });
  } catch (error) {
    console.warn('No se pudo abrir la sala', error);
    if (host === session) set({ room: { code: null, status: 'failed' } });
  }
}

/** Anfitrión: contesta una solicitud de la sala con su respuesta WebRTC. */
async function hostAcceptRequest(
  session: HostSession,
  signaling: RoomSignaling,
  code: string,
  request: RoomRequest,
): Promise<void> {
  const peerId = `r${request.id}`;
  if (session.pending.has(peerId) || session.links.has(peerId)) return;
  const link = new PeerLink();
  session.pending.set(peerId, link);
  session.names.set(peerId, cleanName(request.name));
  // Conectados (o fracasado el intento), la solicitud ya no hace falta: lleva direcciones IP.
  const forget = () => void signaling.removeRequest(code, request.id).catch(() => undefined);
  link.listen({
    onOpen: () => {
      hostGuestJoined(peerId);
      forget();
    },
    onClose: (reason) => {
      hostLinkClosed(peerId, reason);
      forget();
    },
    onMessage: (channel, message) => hostReceive(peerId, channel, message),
  });
  try {
    const sdp = await link.acceptOffer(request.offer);
    await signaling.answer(code, request.id, sdp);
  } catch (error) {
    console.warn('No se pudo contestar la solicitud', error);
    link.close();
    return;
  }
  setTimeout(() => {
    if (!link.open && session.pending.has(peerId)) link.close();
  }, CONNECT_TIMEOUT_MS);
}

/** Prepara una invitación (un enlace por persona). */
export async function createInvite(): Promise<void> {
  const session = host;
  const me = get().me;
  if (!session || !me) return;
  const peerId = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const link = new PeerLink();
  session.pending.set(peerId, link);
  set({ invites: [...get().invites, { peerId, link: null, status: 'preparing' }] });
  link.listen({
    onOpen: () => hostGuestJoined(peerId),
    onClose: (reason) => hostLinkClosed(peerId, reason),
    onMessage: (channel, message) => hostReceive(peerId, channel, message),
  });
  try {
    const sdp = await link.createOffer();
    const code = await encodeSignal({ kind: 'offer', sdp, peerId, name: me.name });
    updateInvite(peerId, { link: inviteLink(code, appUrl()), status: 'waiting' });
  } catch (error) {
    console.warn('No se pudo preparar la invitación', error);
    updateInvite(peerId, { status: 'failed' });
  }
}

export function cancelInvite(peerId: string): void {
  host?.pending.get(peerId)?.close();
  host?.pending.delete(peerId);
  set({ invites: get().invites.filter((i) => i.peerId !== peerId) });
}

/**
 * Anfitrión: aplica la respuesta que pegó (de cualquiera de sus invitaciones). Devuelve la clave
 * del error para mostrar, o `null` si se está conectando.
 */
export async function acceptAnswer(text: string): Promise<CollabErrorKey | null> {
  const session = host;
  if (!session) return 'collab.answerInvalid';
  const code = answerCodeFrom(text);
  if (!code) return 'collab.answerInvalid';
  let payload;
  try {
    payload = await decodeSignal(code);
  } catch {
    return 'collab.answerInvalid';
  }
  const link = session.pending.get(payload.peerId);
  if (!link) return 'collab.answerUnknown';
  session.names.set(payload.peerId, cleanName(payload.name));
  updateInvite(payload.peerId, { status: 'connecting' });
  try {
    await link.acceptAnswer(payload.sdp);
  } catch (error) {
    console.warn('Respuesta no aplicable', error);
    updateInvite(payload.peerId, { status: 'failed' });
    return 'collab.connectFailed';
  }
  const peerId = payload.peerId;
  setTimeout(() => {
    if (!link.open && session.pending.has(peerId)) updateInvite(peerId, { status: 'failed' });
  }, CONNECT_TIMEOUT_MS);
  return null;
}

function hostGuestJoined(peerId: string): void {
  const session = host;
  const link = session?.pending.get(peerId);
  const me = get().me;
  if (!session || !link || !me) return;
  session.pending.delete(peerId);
  session.links.set(peerId, link);
  const peer: PeerInfo = {
    id: peerId,
    name: session.names.get(peerId) ?? '?',
    color: PEER_COLORS[1 + (session.joined++ % (PEER_COLORS.length - 1))]!,
  };
  const peers = [...get().peers, peer];
  set({ peers, invites: get().invites.filter((i) => i.peerId !== peerId) });
  link.send(session.sync.welcome(peer, [me, ...peers]));
  hostBroadcast({ t: 'peers', peers: [me, ...peers] }, peerId);
  // Las imágenes del proyecto viajan aparte del documento.
  for (const asset of useProjectStore.getState().project.assets) {
    const blob = localAssetBlob(asset.id);
    if (blob) void assetMessage(asset.id, blob).then((message) => link.send(message));
  }
  sendMyPose();
  notify('info', i18next.t('collab.joined', { name: peer.name }));
}

function hostLinkClosed(peerId: string, reason: 'closed' | 'failed'): void {
  const session = host;
  if (!session) return;
  if (session.pending.delete(peerId)) {
    if (reason === 'failed') updateInvite(peerId, { status: 'failed' });
    return;
  }
  if (!session.links.delete(peerId)) return;
  const gone = get().peers.find((p) => p.id === peerId);
  const peers = get().peers.filter((p) => p.id !== peerId);
  set({ peers });
  forgetPeer(peerId);
  const me = get().me;
  if (me) hostBroadcast({ t: 'peers', peers: [me, ...peers] });
  if (gone) notify('info', i18next.t('collab.left', { name: gone.name }));
}

function hostReceive(peerId: string, _channel: LinkChannel, message: unknown): void {
  const session = host;
  if (!session || !isGuestMessage(message)) return;
  switch (message.t) {
    case 'pose': {
      // Cada uno solo informa su propia pose.
      const pose = { ...message.pose, id: peerId };
      receivePose(pose);
      for (const [id, link] of session.links) {
        if (id !== peerId) link.sendPresence({ t: 'pose', pose });
      }
      return;
    }
    case 'asset':
      void saveAssetBlob(message.id, assetBlob(message), { remote: true });
      hostBroadcast(message, peerId);
      return;
    default:
      session.sync.handle(peerId, message);
  }
}

// --- Invitado ---

/**
 * Invitado: acepta la invitación (enlace o código) y prepara la respuesta para el anfitrión.
 * Devuelve la clave del error para mostrar, o `null`.
 */
export async function prepareJoin(text: string, name: string): Promise<CollabErrorKey | null> {
  if (get().role || guest) return null;
  const code = inviteCodeFrom(text);
  if (!code) return 'collab.inviteInvalid';
  let offer;
  try {
    offer = await decodeSignal(code);
  } catch {
    return 'collab.inviteInvalid';
  }
  const link = new PeerLink();
  const session: GuestSession = { link, sync: null, stop: () => undefined };
  guest = session;
  set({
    join: { via: 'manual', hostName: offer.name, answer: null, status: 'preparing' },
    joinCode: null,
  });
  link.listen({
    onOpen: () => {
      const join = get().join;
      if (join) set({ join: { ...join, status: 'connected' } });
    },
    onClose: () => guestClosed(session),
    onMessage: (_channel, message) => guestReceive(session, message),
  });
  try {
    const sdp = await link.acceptOffer(offer.sdp);
    const answer = await encodeSignal({
      kind: 'answer',
      sdp,
      peerId: offer.peerId,
      name: cleanName(name),
    });
    if (guest === session) {
      set({ join: { via: 'manual', hostName: offer.name, answer, status: 'answer' } });
    }
    return null;
  } catch (error) {
    console.warn('No se pudo preparar la respuesta', error);
    if (guest === session) {
      set({ join: { via: 'manual', hostName: offer.name, answer: null, status: 'failed' } });
    }
    return 'collab.connectFailed';
  }
}

/**
 * Invitado: se une a una sala con su código. Deja su oferta en la sala y, cuando el anfitrión
 * contesta, se conectan. Devuelve la clave del error para mostrar, o `null`.
 */
export async function joinRoom(text: string, name: string): Promise<CollabErrorKey | null> {
  if (get().role || guest) return null;
  const code = parseRoomCode(text);
  if (!code) return 'collab.roomInvalid';
  let signaling: RoomSignaling;
  let room: { readonly hostName: string } | null;
  try {
    signaling = await loadRooms();
    room = await signaling.findRoom(code);
  } catch (error) {
    console.warn('No se pudo buscar la sala', error);
    return 'collab.connectFailed';
  }
  if (!room) return 'collab.roomNotFound';
  const hostName = room.hostName;
  const link = new PeerLink();
  const session: GuestSession = { link, sync: null, stop: () => undefined };
  guest = session;
  set({ join: { via: 'room', hostName, answer: null, status: 'preparing' }, roomCode: null });
  link.listen({
    onOpen: () => {
      const join = get().join;
      if (join) set({ join: { ...join, status: 'connected' } });
    },
    onClose: () => guestClosed(session),
    onMessage: (_channel, message) => guestReceive(session, message),
  });
  const failed = () => {
    session.roomJoin?.cancel();
    if (guest === session) set({ join: { via: 'room', hostName, answer: null, status: 'failed' } });
  };
  try {
    const offer = await link.createOffer();
    const roomJoin = await signaling.request(code, cleanName(name), offer);
    session.roomJoin = roomJoin;
    if (guest !== session) {
      roomJoin.cancel();
      return null;
    }
    set({ join: { via: 'room', hostName, answer: null, status: 'waiting' } });
    const answer = await Promise.race([
      roomJoin.answer,
      new Promise<never>((_, reject) =>
        setTimeout(() => {
          reject(new Error('room-timeout'));
        }, ROOM_ANSWER_TIMEOUT_MS),
      ),
    ]);
    if (guest !== session) return null;
    await link.acceptAnswer(answer);
    setTimeout(() => {
      if (guest === session && !link.open) failed();
    }, CONNECT_TIMEOUT_MS);
    return null;
  } catch (error) {
    console.warn('No se pudo unir a la sala', error);
    failed();
    return null;
  }
}

function guestReceive(session: GuestSession, message: unknown): void {
  if (guest !== session || !isHostMessage(message)) return;
  switch (message.t) {
    case 'welcome': {
      const sync = new GuestSync(
        useProjectStore,
        (m) => session.link.send(m),
        {
          onRejected: () => notify('error', i18next.t('collab.rejected')),
          onLocalReplace: () => {
            leaveSession();
            notify('info', i18next.t('collab.leftByReplace'));
          },
        },
        message.you.id,
      );
      session.sync = sync;
      sync.handle(message);
      const hostName = get().join?.hostName ?? '';
      set({
        role: 'guest',
        me: message.you,
        peers: message.peers.filter((p) => p.id !== message.you.id),
        join: null,
        dialogOpen: false,
      });
      useUiStore.setState({
        selection: null,
        selectionGroup: [],
        levelId: message.project.levels[0]?.id ?? null,
      });
      const stopAssets = onLocalAsset((id, blob) => {
        void assetMessage(id, blob).then((m) => session.link.send(m));
      });
      const stopPresence = startPresence();
      session.stop = () => {
        stopAssets();
        stopPresence();
        sync.stop();
      };
      notify('success', i18next.t('collab.joinedAsGuest', { name: hostName }));
      return;
    }
    case 'peers': {
      const me = get().me;
      const peers = message.peers.filter((p) => p.id !== me?.id);
      for (const id of Object.keys(get().presence)) {
        if (!peers.some((p) => p.id === id)) forgetPeer(id);
      }
      set({ peers });
      return;
    }
    case 'pose':
      receivePose(message.pose);
      return;
    case 'asset':
      void saveAssetBlob(message.id, assetBlob(message), { remote: true });
      return;
    case 'end':
      endGuest(session);
      notify('info', i18next.t('collab.hostEnded'));
      return;
    default:
      session.sync?.handle(message);
  }
}

function endGuest(session: GuestSession): void {
  if (guest !== session) return;
  guest = null;
  session.roomJoin?.cancel();
  session.stop();
  session.link.close();
  resetSession();
}

function guestClosed(session: GuestSession): void {
  if (guest !== session) return;
  const joined = get().role === 'guest';
  const join = get().join;
  endGuest(session);
  if (joined) notify('error', i18next.t('collab.disconnected'));
  // Aún uniéndose: el diálogo muestra que no se pudo conectar.
  else if (join) set({ join: { ...join, status: 'failed' } });
}

// --- Salir ---

/** Deja la sesión (el invitado conserva su copia) o la termina para todos (anfitrión). */
export function leaveSession(): void {
  if (host) {
    const session = host;
    host = null;
    for (const link of session.links.values()) link.send({ t: 'end' });
    session.stop();
    if (session.room) {
      session.room.stop();
      void session.room.signaling.closeRoom(session.room.code).catch(() => undefined);
    }
    // Se da un momento para que salga el aviso de fin antes de cerrar.
    const links = [...session.links.values(), ...session.pending.values()];
    setTimeout(() => {
      for (const link of links) link.close();
    }, 250);
    resetSession();
    return;
  }
  if (guest) endGuest(guest);
  else resetSession();
}

/**
 * Abre el diálogo si la app se abrió con un enlace de sala (`?sala=…`) o de invitación a mano
 * (`#join=…`).
 */
export function readInviteFromUrl(): void {
  const url = new URL(window.location.href);
  const room = url.searchParams.get(ROOM_PARAM);
  if (room !== null) {
    // Recargar no vuelve a unirse.
    url.searchParams.delete(ROOM_PARAM);
    window.history.replaceState(null, '', url);
    const code = parseRoomCode(room);
    if (code) set({ roomCode: code, dialogOpen: true, manual: false });
    return;
  }
  const hash = window.location.hash;
  if (!hash.includes('join=')) return;
  const code = inviteCodeFrom(hash);
  // El código no queda en la barra de direcciones (recargar no vuelve a unirse).
  window.history.replaceState(null, '', appUrl());
  if (code) set({ joinCode: code, dialogOpen: true, manual: true });
}

/** Invitado: abandona una unión que no llegó a conectarse (vuelve al inicio del diálogo). */
export function dismissJoin(): void {
  if (guest && get().role !== 'guest') endGuest(guest);
  set({ join: null, joinCode: null, roomCode: null });
}

/** Enlace para invitar a la sala: `…/?sala=K7Q4MD`. */
export function roomLink(code: string): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.searchParams.set(ROOM_PARAM, code);
  return url.href;
}
