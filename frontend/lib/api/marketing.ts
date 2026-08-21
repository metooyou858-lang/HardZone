import { apiFetch } from "./client";
import { assertSupportedPhoto } from "./upload-images";

export type MarketingCampaignStatus = "draft" | "active" | "archived";
export type ReferralStatus = "registered" | "completed" | "cancelled";
export type RewardStatus = "pending" | "issued" | "cancelled";
export type RewardRecipient = "referrer" | "referred";
export type RewardType = "discount_percent" | "free_visit";

export type MarketingRewardRule = {
  recipient: RewardRecipient;
  reward_type: RewardType;
  value: number;
};

export type MarketingCampaignListItem = {
  id: string;
  name: string;
  campaign_type: string;
  status: MarketingCampaignStatus;
  banner_url: string | null;
  public_rules: string;
  reward_rules: MarketingRewardRule[];
  starts_at: string | null;
  ends_at: string | null;
  participants_count: number;
  pending_rewards_count: number;
  created_at: string;
  updated_at: string;
};

export type MarketingReferralReward = {
  id: string;
  recipient_role: RewardRecipient;
  client_id: string;
  reward_type: RewardType;
  reward_value: string;
  reward_snapshot: MarketingRewardRule;
  status: RewardStatus;
  issued_at: string | null;
  note: string | null;
};

export type MarketingReferral = {
  id: string;
  campaign_id: string;
  referrer_client_id: string;
  referred_client_id: string;
  referrer_name: string;
  referrer_phone: string | null;
  referred_name: string;
  referred_phone: string | null;
  status: ReferralStatus;
  note: string | null;
  created_at: string;
  updated_at: string;
  rewards: MarketingReferralReward[];
};

export type MarketingCampaign = MarketingCampaignListItem & {
  created_by_name: string | null;
  updated_by_name: string | null;
  referrals: MarketingReferral[];
};

export type MarketingClientOption = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  phone: string | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export async function fetchMarketingCampaigns(): Promise<MarketingCampaignListItem[]> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaignListItem[]>>("/marketing");
  return response.data;
}

export async function fetchMarketingCampaign(id: string): Promise<MarketingCampaign> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaign>>(`/marketing/${id}`);
  return response.data;
}

export async function createMarketingCampaign(data: {
  name: string;
  campaign_type: string;
  status: MarketingCampaignStatus;
  public_rules: string;
  reward_rules: MarketingRewardRule[];
  starts_at?: string | null;
  ends_at?: string | null;
}): Promise<MarketingCampaignListItem> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaignListItem>>("/marketing", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function updateMarketingCampaign(
  id: string,
  data: Partial<{
    name: string;
    campaign_type: string;
    status: MarketingCampaignStatus;
    public_rules: string;
    reward_rules: MarketingRewardRule[];
    starts_at: string | null;
    ends_at: string | null;
  }>
): Promise<MarketingCampaignListItem> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaignListItem>>(`/marketing/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function uploadMarketingBanner(id: string, file: File): Promise<MarketingCampaignListItem> {
  assertSupportedPhoto(file);
  const formData = new FormData();
  formData.append("banner", file);
  const response = await apiFetch<ApiEnvelope<MarketingCampaignListItem>>(`/marketing/${id}/banner`, {
    method: "POST",
    body: formData,
  });
  return response.data;
}

export async function searchMarketingClients(query: string): Promise<MarketingClientOption[]> {
  const params = new URLSearchParams({ q: query });
  const response = await apiFetch<ApiEnvelope<MarketingClientOption[]>>(`/marketing/client-search?${params.toString()}`);
  return response.data;
}

export async function createMarketingReferral(
  campaignId: string,
  data: { referrer_client_id: string; referred_client_id: string; note?: string | null }
): Promise<MarketingCampaign> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaign>>(`/marketing/${campaignId}/referrals`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return response.data;
}

export async function updateMarketingReferralStatus(id: string, status: ReferralStatus): Promise<MarketingCampaign> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaign>>(`/marketing/referrals/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  return response.data;
}

export async function updateMarketingReward(
  id: string,
  status: RewardStatus,
  note?: string | null
): Promise<MarketingCampaign> {
  const response = await apiFetch<ApiEnvelope<MarketingCampaign>>(`/marketing/rewards/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, note: note ?? null }),
  });
  return response.data;
}
