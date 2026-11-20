import db from "../db.server";

/** Load a shop's settings, creating the default row on first use. */
export async function getSettings(shop: string) {
  return db.shopSettings.upsert({
    where: { shop },
    create: { shop },
    update: {},
  });
}

export type Settings = Awaited<ReturnType<typeof getSettings>>;
