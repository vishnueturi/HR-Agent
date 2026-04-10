import envConfig from '../constants';
import { getHrmsAccessToken } from './config';

interface HrBasicDetailsApiResponse {
  Details?: {
    FirstName?: string;
    LastName?: string;
    Designation?: string;
    ProfilePicUrl?: string;
    EmailId?: string;
    SnoozedAlerts?: unknown[];
  };
  State?: boolean;
  Message?: string;
  HasRestriction?: boolean;
}

export interface HrBasicDetailsUser {
  firstName: string;
  lastName: string;
  email: string;
  profilePicUrl: string;
}

function authHeader(): Record<string, string> {
  const token = getHrmsAccessToken();
  if (!token?.trim()) return {};
  const t = token.trim();
  const value = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  return { Authorization: value };
}

/** Loads signed-in HR profile for the sidebar (name, email, photo). */
export async function fetchHrBasicDetails(): Promise<HrBasicDetailsUser | null> {
  const url = `${envConfig.ONBLICK_API_BASE_URL}/GetHRBasicDetails`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...authHeader(),
      Accept: 'application/json',
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as HrBasicDetailsApiResponse;
  if (!data.State || !data.Details) return null;

  const d = data.Details;
  return {
    firstName: d.FirstName?.trim() ?? '',
    lastName: d.LastName?.trim() ?? '',
    email: d.EmailId?.trim() ?? '',
    profilePicUrl: d.ProfilePicUrl?.trim() ?? '',
  };
}
