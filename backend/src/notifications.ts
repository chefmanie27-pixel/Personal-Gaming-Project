import type { Prisma } from "@prisma/client";
import { settingsSchema } from "./social.js";
export interface DeliveryMessage {
  userId: string;
  dedupe: string;
  kind: string;
  message: string;
  entityId?: string;
}
export interface NotificationTransport {
  name: "in-app" | "email" | "push";
  enabled: boolean;
  deliver(
    message: DeliveryMessage,
  ): Promise<"delivered" | "duplicate" | "disabled">;
}
export const deliveryCapabilities = {
  inApp: true,
  email: false,
  push: false,
} as const;
export function disabledTransport(
  name: "email" | "push",
): NotificationTransport {
  return {
    name,
    enabled: false,
    async deliver() {
      return "disabled";
    },
  };
}
export async function deliverInApp(
  db: Prisma.TransactionClient,
  message: DeliveryMessage,
) {
  const p = await db.socialProfile.findUnique({
    where: { userId: message.userId },
    select: { settings: true },
  });
  if (p && !settingsSchema.parse(p.settings).notifications)
    return "disabled" as const;
  const result = await db.socialNotification.createMany({
    data: [message],
    skipDuplicates: true,
  });
  return result.count ? ("delivered" as const) : ("duplicate" as const);
}
