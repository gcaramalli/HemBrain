export type Role = "admin" | "member";

export type Family = { id: string; name: string };

export type Profile = {
  id: string;
  family_id: string;
  display_name: string;
  email: string | null;
  role: Role;
  color: string;
  locale: "en" | "fr" | "sv";
  work_hidden_tabs?: string[]; // Work tabs this account hides (0021)
  digest_opt_out?: boolean; // no weekly news email (0027)
};

export type Member = {
  id: string;
  family_id: string;
  profile_id: string | null;
  name: string;
  emoji: string;
  color: string;
  birthdate: string | null;
  notes: string | null;
  // Kids: usual drop-off / pick-up ("08:00:00") and where.
  dropoff_time: string | null;
  pickup_time: string | null;
  care_place: string | null;
  care_days: number[];
  // Kids: current sizes (Wardrobe tile), e.g. "92" and "23".
  clothing_size: string | null;
  shoe_size: string | null;
  sizes_updated_on: string | null;
};

// A parent saying they can (or can't) do one drop-off or pick-up.
export type CareAvailability = {
  kid_id: string;
  day: string;
  kind: "dropoff" | "pickup";
  member_id: string;
  available: boolean;
};

export type Invite = { email: string; family_id: string; role: Role; code: string; expires_at: string; member_id: string | null; created_at: string };

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  responsible_member_id: string | null;
  for_member_id: string | null; // the first of `for_member_ids`, kept in step by a trigger
  for_member_ids?: string[]; // who it is about (empty = everyone)
  recurrence: "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | null;
  recurrence_until: string | null;
  // Drop-off / pick-up of a child (Kids tab).
  care?: "dropoff" | "pickup" | null;
  // Dates of a repeating event removed or changed on their own.
  skip_dates?: string[];
  created_by?: string | null;
};

// One occurrence of an event (a repeating event yields several). Family dates
// (our anniversary, the kids' birthdays) are shown as read-only occurrences
// with a `badge` and a `link` instead of an editable event.
export type EventOccurrence = CalendarEvent & {
  key: string;
  occurrence_start: string;
  occurrence_end: string | null;
  badge?: string;
  link?: string;
};

export type Occasion = {
  id: string;
  kind: "wedding" | "birthday" | "other";
  title: string;
  date: string; // original day, YYYY-MM-DD
  ours: boolean;
  member_ids: string[];
  ended: boolean;
  notes: string | null;
};

export type List = { id: string; name: string; kind: "grocery" | "todo"; position: number };

export type ListItem = {
  id: string;
  list_id: string;
  title: string;
  quantity: string | null;
  notes: string | null;
  done: boolean;
  done_at: string | null;
  due_date: string | null;
  assignee_member_id: string | null;
  category: string | null;
  created_by: string | null;
  created_at: string;
};

export type RestockSuggestion = {
  item_key: string;
  item_name: string;
  times_bought: number;
  last_bought_at: string;
  avg_interval_days: number;
  next_due_on: string;
};

export type Recipe = {
  id: string;
  title: string;
  description: string | null;
  ingredients: string[];
  steps: string | null;
  tags: string[];
  prep_minutes: number | null;
  servings: number | null;
  source_url: string | null;
  favorite: boolean;
  kid_friendly: boolean;
};

export type Meal = {
  id: string;
  eaten_on: string;
  slot: "breakfast" | "lunch" | "dinner" | "snack";
  title: string;
  recipe_id: string | null;
  food_groups: string[];
  place: "home" | "out" | "takeaway";
  member_ids: string[];
  notes: string | null;
  // How a kid took it (kid tab → Food).
  reaction?: "loved" | "ok" | "refused" | null;
  created_at: string;
};

export type Note = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  updated_at: string;
};

export type Gift = {
  id: string;
  from_profile: string;
  to_profile: string;
  emoji: string;
  message: string | null;
  created_at: string;
  opened_at: string | null;
};

// Private space: only the owner's account can read these (RLS on profile_id).
export type PrivateBoard = {
  id: string;
  title: string;
  emoji: string;
  kind: "list" | "note" | "gifts" | "work";
  body: string;
  position: number;
  // Behind the account's code (private_pin_*), when one is set.
  locked: boolean;
  updated_at: string;
};

export type PrivateItem = {
  id: string;
  board_id: string;
  title: string;
  done: boolean;
  person: string | null; // gifts: who it's for
  occasion: string | null; // gifts: Christmas, birthday…
  created_at: string;
};

// Private work space (owner-only): people at work, projects, recurring
// meetings, and what to do / hand over / discuss with them.
export type WorkRole = "boss" | "peer" | "team" | "other";
export type WorkPerson = { id: string; name: string; role: WorkRole; notes: string; created_at: string };
export type WorkProject = { id: string; name: string; person_ids: string[]; archived: boolean; notes: string; created_at: string };
export type WorkMeeting = { id: string; name: string; weekday: number | null; person_ids: string[]; created_at: string };
export type WorkItem = {
  id: string;
  title: string;
  kind: "todo" | "give" | "discuss"; // I do it / hand it over / bring it up
  status: "open" | "waiting" | "done"; // waiting = handed over, waiting on the person
  person_id: string | null;
  project_id: string | null;
  meeting_id: string | null;
  due_date: string | null;
  not_before: string | null; // off agendas until then ("for next week's meeting")
  priority: boolean; // listed first everywhere
  waiting_since: string | null;
  done_at: string | null;
  created_at: string;
};

// Kid tab tiles (shared by the family).
export type KidClothes = {
  id: string;
  kid_id: string;
  title: string;
  category: string; // ids in src/lib/wardrobe.ts
  size: string | null;
  status: "have" | "need" | "outgrown";
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type KidSleep = {
  id: string;
  kid_id: string;
  kind: "nap" | "night";
  starts_at: string;
  ends_at: string | null; // null = asleep now
  wakings: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type KidBoard = { id: string; kid_id: string; title: string; emoji: string; kind: "list" | "note"; body: string; position: number; updated_at: string };
export type KidItem = { id: string; board_id: string; title: string; done: boolean; created_at: string };

// A contract, insurance, warranty receipt or ID (Papers). profile_id null =
// the family's; set = private to that account.
export type Paper = {
  id: string;
  family_id: string;
  profile_id: string | null;
  category: string;
  title: string;
  provider: string | null;
  reference: string | null;
  member_ids: string[];
  amount: number | null;
  currency: string;
  period: "month" | "quarter" | "year" | "once" | null;
  starts_on: string | null;
  renews_on: string | null;
  notice_days: number | null;
  expires_on: string | null;
  warranty_until: string | null;
  summary: string | null;
  details: Record<string, string>;
  file_path: string | null;
  file_name: string | null;
  ended: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// A country one member of the family has been to (Travels).
export type VisitedCountry = {
  id: string;
  member_id: string;
  country: string; // ISO 3166-1 alpha-2
  first_year: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

// One trip, or a stretch lived somewhere (Travels → Timeline). Months are the
// first day of the month; no start = year unknown.
export type Trip = {
  id: string;
  country: string;
  start_month: string | null;
  end_month: string | null;
  lived: boolean;
  note: string | null;
  member_ids: string[];
  created_by: string | null;
  created_at: string;
};

// Shared expenses (Home → Expenses): who paid, for whom, split equally.
export type Expense = {
  id: string;
  family_id: string;
  title: string;
  amount: number;
  currency: string;
  paid_by: string;
  split_among: string[];
  // {member_id: weight}; null = equal between split_among
  shares: Record<string, number> | null;
  spent_on: string;
  settlement: boolean;
  created_by: string | null;
  created_at: string;
};
