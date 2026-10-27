import { describe, expect, it } from 'vitest';
import { assetBlob, assetMessage } from './asset-transfer';
import { Deframer, frame } from './framing';
import { answerCodeFrom, decodeSignal, encodeSignal, inviteCodeFrom } from './signal-codec';

const SDP = [
  'v=0',
  'o=- 4611731400430051336 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122260223 192.168.1.20 56143 typ host generation 0',
  'a=candidate:2 1 udp 1686052607 181.42.10.7 56143 typ srflx raddr 192.168.1.20 rport 56143',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:0123456789abcdefghijklmn',
  'a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11',
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
].join('\r\n');

describe('señalización manual', () => {
  it('codifica y decodifica la oferta sin perder nada, y es más corta que el SDP', async () => {
    const code = await encodeSignal({ kind: 'offer', sdp: SDP, peerId: 'p_1', name: 'Ana' });
    expect(code.startsWith('D1.o.')).toBe(true);
    expect(code.length).toBeLessThan(SDP.length);
    // Los mensajeros suelen partir el texto: se toleran espacios y saltos de línea.
    const pasted = `${code.slice(0, 40)}\n ${code.slice(40)}`;
    expect(await decodeSignal(pasted)).toEqual({
      kind: 'offer',
      sdp: SDP,
      peerId: 'p_1',
      name: 'Ana',
    });
  });

  it('rechaza códigos inválidos y extrae los códigos de un texto o enlace', async () => {
    await expect(decodeSignal('hola')).rejects.toThrow('signal-invalid');
    await expect(decodeSignal('D1.o.@@@')).rejects.toThrow('signal-invalid');
    const offer = await encodeSignal({ kind: 'offer', sdp: SDP, peerId: 'p', name: 'A' });
    const answer = await encodeSignal({ kind: 'answer', sdp: SDP, peerId: 'p', name: 'B' });
    expect(inviteCodeFrom(`Únete: https://x.dev/decodeny/#join=${offer}`)).toBe(offer);
    expect(answerCodeFrom(`mi respuesta: ${answer} gracias`)).toBe(answer);
    expect(inviteCodeFrom('nada')).toBeNull();
  });
});

describe('fragmentación de mensajes', () => {
  it('parte los mensajes grandes y los reúne aunque lleguen desordenados', () => {
    const big = { t: 'welcome', snapshot: 'x'.repeat(50_000), seq: 3 };
    const parts = frame(big, 16_000);
    expect(parts.length).toBe(4);
    const deframer = new Deframer();
    const shuffled = [parts[2]!, parts[0]!, parts[3]!, parts[1]!];
    const results = shuffled.map((p) => deframer.push(p));
    expect(results.slice(0, 3)).toEqual([null, null, null]);
    expect(results[3]).toEqual(big);
    expect(new Deframer().push(frame({ t: 'pose' })[0]!)).toEqual({ t: 'pose' });
  });
});

describe('imágenes de la sesión', () => {
  it('viajan como base64 sin perder bytes (también las grandes)', async () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => (i * 7) % 256);
    const message = await assetMessage('asset_1', new Blob([bytes], { type: 'image/png' }));
    expect(message).toMatchObject({ t: 'asset', id: 'asset_1', mime: 'image/png' });
    const back = assetBlob(JSON.parse(JSON.stringify(message)) as typeof message);
    expect(back.type).toBe('image/png');
    expect(new Uint8Array(await back.arrayBuffer())).toEqual(bytes);
  });
});
