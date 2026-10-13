import { FastifyPluginAsync } from 'fastify';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]);

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB

interface UploadBody {
  filename?: string;
  mimeType?: string;
  base64?: string;
  dataUrl?: string;
}

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  // Bild abrufen (öffentlich, mit aggressivem Caching)
  fastify.get<{ Params: { id: string } }>('/api/uploads/:id', async (request, reply) => {
    const { id } = request.params;

    const upload = await fastify.prisma.upload.findUnique({
      where: { id },
    });

    if (!upload) {
      return reply.status(404).send({ error: 'Bild nicht gefunden' });
    }

    reply
      .header('Content-Type', upload.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(upload.filename)}"`);

    return reply.send(Buffer.from(upload.data));
  });

  // Bild hochladen (nur authentifizierte Benutzer)
  fastify.post<{ Body: UploadBody }>(
    '/api/uploads',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = request.body || {};
      let rawBase64 = body.base64 || body.dataUrl || '';
      let mimeType = (body.mimeType || '').toLowerCase().trim();
      let filename = (body.filename || 'upload.png').trim();

      // Data-URL Präfix parsen (z.B. "data:image/png;base64,iVBOR...")
      if (rawBase64.startsWith('data:')) {
        const matches = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
        if (matches) {
          if (!mimeType) {
            mimeType = matches[1].toLowerCase().trim();
          }
          rawBase64 = matches[2];
        } else {
          return reply.status(400).send({ error: 'Ungültiges Data-URL-Format' });
        }
      }

      if (!rawBase64) {
        return reply.status(400).send({ error: 'Keine Bilddaten übermittelt' });
      }

      // Dateiendung zu MimeType mappen falls nötig
      if (!mimeType || mimeType === 'application/octet-stream') {
        const lowerName = filename.toLowerCase();
        if (lowerName.endsWith('.png')) mimeType = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
        else if (lowerName.endsWith('.svg')) mimeType = 'image/svg+xml';
        else if (lowerName.endsWith('.gif')) mimeType = 'image/gif';
      }

      if (mimeType === 'image/jpg') {
        mimeType = 'image/jpeg';
      }

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(400).send({
          error: `Nicht unterstütztes Bildformat (${mimeType || 'unbekannt'}). Erlaubt: PNG, JPEG, WebP, SVG, GIF.`,
        });
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(rawBase64, 'base64');
      } catch {
        return reply.status(400).send({ error: 'Ungültige Base64-Codierung' });
      }

      if (buffer.length === 0) {
        return reply.status(400).send({ error: 'Die hochgeladene Datei ist leer' });
      }

      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: `Datei ist zu gross (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximal erlaubt: 6 MB.`,
        });
      }

      const upload = await fastify.prisma.upload.create({
        data: {
          filename: filename.slice(0, 200),
          mimeType,
          size: buffer.length,
          data: new Uint8Array(buffer),
        },
      });

      return {
        id: upload.id,
        url: `/api/uploads/${upload.id}`,
        filename: upload.filename,
        size: upload.size,
        mimeType: upload.mimeType,
      };
    }
  );
};

export default uploadRoutes;
