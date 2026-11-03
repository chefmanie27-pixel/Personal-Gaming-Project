import { Router } from "express";
import sharp from "sharp";
import { prisma } from "./db.js";
import { requireAuth, type AuthRequest } from "./auth.js";
import { authRateLimit } from "./rateLimit.js";
import { config } from "./config.js";
export async function normalizeArtwork(bytes: Buffer) {
  if (bytes.length > 2 * 1024 * 1024 || bytes.length < 12)
    throw new Error("Choose a PNG, JPEG or WebP image up to 2 MiB.");
  const image = sharp(bytes, {
    limitInputPixels: 16000000,
    animated: false,
    failOn: "warning",
  }).timeout({ seconds: 8 });
  const info = await image.metadata();
  if (
    !["png", "jpeg", "webp"].includes(info.format ?? "") ||
    (info.pages ?? 1) > 1
  )
    throw new Error("Only still PNG, JPEG and WebP images are supported.");
  const output = await image
    .rotate()
    .resize(1920, 1080, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
  if (output.length > 2 * 1024 * 1024)
    throw new Error("The processed image is too large.");
  return output;
}
export const artworkRouter = Router();
artworkRouter.get("/mine", requireAuth, async (req: AuthRequest, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const rows = await prisma.artworkUpload.findMany({
      where: { userId: req.user!.id },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    res.json({
      data: rows.map((r) => ({
        ...r,
        url: config.PUBLIC_API_ORIGIN + "/api/artwork/" + r.id,
      })),
    });
  } catch (e) {
    next(e);
  }
});
artworkRouter.post(
  "/",
  requireAuth,
  authRateLimit(10, 60000),
  async (req: AuthRequest, res, next) => {
    try {
      if (!Buffer.isBuffer(req.body))
        return res
          .status(400)
          .json({ error: "Upload a PNG, JPEG or WebP image." });
      let bytes: Buffer;
      try {
        bytes = await normalizeArtwork(req.body);
      } catch {
        return res.status(400).json({
          error:
            "Invalid image. Use a still PNG, JPEG or WebP up to 2 MiB and 16 megapixels.",
        });
      }
      const row = await prisma.$transaction(
        async (db) => {
          if (
            (await db.artworkUpload.count({
              where: { userId: req.user!.id },
            })) >= 20
          )
            return null;
          return db.artworkUpload.create({
            data: { userId: req.user!.id, bytes },
            select: { id: true },
          });
        },
        { isolationLevel: "Serializable" },
      );
      if (!row)
        return res.status(400).json({
          error: "You have 20 uploaded images. Delete an unused image first.",
        });
      return res.status(201).json({
        data: {
          id: row.id,
          url: config.PUBLIC_API_ORIGIN + "/api/artwork/" + row.id,
        },
      });
    } catch (e) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2034")
        return res
          .status(409)
          .json({ error: "Another upload is saving. Retry shortly." });
      next(e);
    }
  },
);
artworkRouter.delete(
  "/:id",
  requireAuth,
  async (req: AuthRequest, res, next) => {
    try {
      const r = await prisma.artworkUpload.deleteMany({
        where: { id: String(req.params.id), userId: req.user!.id },
      });
      return r.count
        ? res.json({ success: true })
        : res.status(404).json({ error: "Image not found." });
    } catch (e) {
      next(e);
    }
  },
);
// Uploaded artwork is deliberately public by its unguessable URL; never store private screenshots here.
artworkRouter.get("/:id", async (req, res, next) => {
  try {
    if (!/^[a-z0-9]{20,40}$/.test(String(req.params.id)))
      return res.sendStatus(404);
    const row = await prisma.artworkUpload.findUnique({
      where: { id: String(req.params.id) },
      select: { bytes: true },
    });
    if (!row) return res.sendStatus(404);
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
    res.setHeader("Cache-Control", "no-store");
    return res.send(Buffer.from(row.bytes));
  } catch (e) {
    next(e);
  }
});
