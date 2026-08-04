/** Lightweight India pincode → city/state lookup (prefix-based, Flipkart-style PDP). */

export type PincodeInfo = {
  pincode: string;
  city: string;
  state: string;
  /** Faster metro / tier-1 delivery corridor */
  isMetro: boolean;
};

/** Common 3-digit prefixes → city/state (covers major delivery hubs). */
const PREFIX3: Record<string, { city: string; state: string; metro?: boolean }> = {
  "110": { city: "New Delhi", state: "Delhi", metro: true },
  "121": { city: "Faridabad", state: "Haryana", metro: true },
  "122": { city: "Gurugram", state: "Haryana", metro: true },
  "201": { city: "Noida", state: "Uttar Pradesh", metro: true },
  "400": { city: "Mumbai", state: "Maharashtra", metro: true },
  "401": { city: "Thane", state: "Maharashtra", metro: true },
  "411": { city: "Pune", state: "Maharashtra", metro: true },
  "560": { city: "Bengaluru", state: "Karnataka", metro: true },
  "600": { city: "Chennai", state: "Tamil Nadu", metro: true },
  "700": { city: "Kolkata", state: "West Bengal", metro: true },
  "500": { city: "Hyderabad", state: "Telangana", metro: true },
  "501": { city: "Hyderabad", state: "Telangana", metro: true },
  "502": { city: "Sangareddy", state: "Telangana" },
  "380": { city: "Ahmedabad", state: "Gujarat", metro: true },
  "302": { city: "Jaipur", state: "Rajasthan", metro: true },
  "226": { city: "Lucknow", state: "Uttar Pradesh" },
  "208": { city: "Kanpur", state: "Uttar Pradesh" },
  "462": { city: "Bhopal", state: "Madhya Pradesh" },
  "452": { city: "Indore", state: "Madhya Pradesh" },
  "641": { city: "Coimbatore", state: "Tamil Nadu" },
  "682": { city: "Kochi", state: "Kerala" },
  "695": { city: "Thiruvananthapuram", state: "Kerala" },
  "751": { city: "Bhubaneswar", state: "Odisha" },
  "781": { city: "Guwahati", state: "Assam" },
  "800": { city: "Patna", state: "Bihar" },
  "160": { city: "Chandigarh", state: "Chandigarh", metro: true },
  "140": { city: "Mohali", state: "Punjab" },
  "141": { city: "Ludhiana", state: "Punjab" },
  "143": { city: "Amritsar", state: "Punjab" },
  "248": { city: "Dehradun", state: "Uttarakhand" },
  "395": { city: "Surat", state: "Gujarat" },
  "390": { city: "Vadodara", state: "Gujarat" },
  "440": { city: "Nagpur", state: "Maharashtra" },
};

/** First digit of Indian pincode → broad postal circle / state. */
const FIRST_DIGIT: Record<string, { region: string; state: string }> = {
  "1": { region: "North", state: "Delhi" },
  "2": { region: "North", state: "Uttar Pradesh" },
  "3": { region: "West", state: "Rajasthan" },
  "4": { region: "West", state: "Maharashtra" },
  "5": { region: "South", state: "Telangana" },
  "6": { region: "South", state: "Tamil Nadu" },
  "7": { region: "East", state: "West Bengal" },
  "8": { region: "East", state: "Bihar" },
  "9": { region: "APO / Army", state: "India" },
};

export function isValidIndianPincode(raw: string): boolean {
  return /^[1-9][0-9]{5}$/.test(String(raw || "").trim());
}

export function lookupPincode(raw: string): PincodeInfo | null {
  const pincode = String(raw || "").trim();
  if (!isValidIndianPincode(pincode)) return null;

  const p3 = PREFIX3[pincode.slice(0, 3)];
  if (p3) {
    return { pincode, city: p3.city, state: p3.state, isMetro: !!p3.metro };
  }

  const first = FIRST_DIGIT[pincode[0]];
  return {
    pincode,
    city: first?.region ? `${first.region} India` : "India",
    state: first?.state || "India",
    isMetro: false,
  };
}

export function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** Flipkart-style friendly date: "Tomorrow, 8 May" / "Wed, 8 May" */
export function formatDeliveryDay(date: Date): string {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(date);
  target.setHours(12, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  const dayMonth = target.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (diff === 0) return `Today, ${dayMonth}`;
  if (diff === 1) return `Tomorrow, ${dayMonth}`;
  const weekday = target.toLocaleDateString("en-IN", { weekday: "short" });
  return `${weekday}, ${dayMonth}`;
}
