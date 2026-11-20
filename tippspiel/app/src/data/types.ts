// Spiegelt die Tabellen aus tippspiel/supabase/migrations.

export type EventStatus = 'scheduled' | 'live' | 'finished' | 'cancelled' | 'postponed';
export type OutcomeStatus = 'open' | 'suspended' | 'won' | 'lost' | 'void';
export type BetType = 'single' | 'combo' | 'system' | 'builder';
export type BetStatus = 'open' | 'won' | 'lost' | 'void' | 'cashed_out';

export interface Sport { key: string; title: string; icon: string; sort: number }
export interface League { key: string; sportKey: string; title: string; country: string; sort: number; hasDraw: boolean }

export interface SportEvent {
  id: string;
  leagueKey: string;
  sportKey: string;
  home: string;
  away: string;
  commence: number;           // ms
  status: EventStatus;
  homeScore: number | null;
  awayScore: number | null;
  minute: string | null;
  isTop: boolean;
}

export interface Market {
  id: string;
  eventId: string;
  key: string;               // h2h, double_chance, totals, btts, spreads, h2h_h1 …
  line: number | null;
  name: string;
  status: 'open' | 'suspended' | 'settled';
  sort: number;
}

export interface Outcome {
  id: string;
  marketId: string;
  eventId: string;
  name: string;              // home/draw/away, over/under …
  label: string;
  price: number;
  prevPrice: number | null;
  changedAt: number | null;
  status: OutcomeStatus;
}

export interface Boost {
  outcomeId: string;
  eventId: string;
  original: number;
  boosted: number;
  title: string;
}

export interface BetSelection {
  outcomeId: string;
  eventId: string;
  eventName: string;
  marketName: string;
  label: string;
  price: number;
  boosted: boolean;
  status: 'open' | 'won' | 'lost' | 'void';
}

export interface Bet {
  id: string;
  type: BetType;
  systemK: number | null;
  lines: number;
  stake: number;
  totalOdds: number;
  potentialPayout: number;
  status: BetStatus;
  payout: number;
  placedAt: number;
  settledAt: number | null;
  selections: BetSelection[];
}

export interface Wallet { balance: number; lastDailyBonus: string | null; lastRefillAt: number | null }

export interface LeaderRow { rank: number; username: string; profit: number; settled: number; won: number; isMe: boolean }
export interface Group { id: string; name: string; inviteCode: string; members: number; isOwner: boolean }

export interface Stats {
  betsTotal: number; betsOpen: number; hitRate: number | null;
  biggestWin: number | null; profitTotal: number; favoriteLeague: string | null;
}

/** Eine Auswahl im Wettschein */
export interface SlipItem { outcomeId: string; eventId: string; price: number }

export type PlaceResult =
  | { ok: true; balance: number }
  | { ok: false; code: 'ODDS_CHANGED'; changes: { outcomeId: string; newPrice: number }[] }
  | { ok: false; code: string; message: string };

export interface BetRequest { type: BetType; systemK?: number; stake: number; selections: SlipItem[] }
