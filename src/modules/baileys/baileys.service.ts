import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import * as qrcode from 'qrcode';

@Injectable()
export class BaileysService implements OnModuleInit {
  private readonly logger = new Logger(BaileysService.name);
  private sock: any = null;
  private isConnected = false;
  private qrCode: string | null = null;

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    const authDir = path.resolve(process.cwd(), 'baileys_auth');
    if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: 'silent' }),
        ),
      },
      logger: pino({ level: 'silent' }),
      browser: ['OfertasBot', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.logger.log('📱 QR Code gerado — acesse GET /baileys/qrcode');
      }

      if (connection === 'close') {
        this.isConnected = false;
        const shouldReconnect =
          (lastDisconnect?.error as Boom)?.output?.statusCode !==
          DisconnectReason.loggedOut;

        this.logger.warn(`Conexão fechada. Reconectando: ${shouldReconnect}`);

        if (shouldReconnect) {
          setTimeout(() => this.connect(), 5000);
        } else {
          this.logger.error(
            'Deslogado! Delete a pasta baileys_auth e reinicie.',
          );
        }
      }

      if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        this.logger.log('✅ WhatsApp conectado via Baileys!');
      }
    });
  }

  async sendText(groupId: string, message: string): Promise<void> {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp não conectado');
    }

    await this.sock.sendMessage(groupId, { text: message });
    this.logger.log(`[Baileys] Mensagem enviada para ${groupId}`);
  }

  async sendImage(
    groupId: string,
    imageUrl: string,
    caption?: string,
  ): Promise<void> {
    if (!this.isConnected || !this.sock) {
      throw new Error('WhatsApp não conectado');
    }

    await this.sock.sendMessage(groupId, {
      image: { url: imageUrl },
      caption: caption ?? '',
    });

    this.logger.log(`[Baileys] Imagem enviada para ${groupId}`);
  }

  async getGroups(): Promise<any[]> {
    if (!this.isConnected || !this.sock) return [];

    const groups = await this.sock.groupFetchAllParticipating();
    return Object.values(groups);
  }

  isReady(): boolean {
    return this.isConnected;
  }

  getQrCode(): string | null {
    return this.qrCode;
  }
}
