import { ProfileView } from "@/lib/models/ProfileView";

export async function getProfileViewCount(steamId: string): Promise<number> {
  const doc = await ProfileView.findOne({ steamId }).select("viewCount").lean();
  return doc?.viewCount ?? 0;
}

export async function incrementProfileViewCount(steamId: string): Promise<number> {
  const doc = await ProfileView.findOneAndUpdate(
    { steamId },
    { $inc: { viewCount: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .select("viewCount")
    .lean();
  return doc?.viewCount ?? 1;
}
