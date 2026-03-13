export enum Language {
  ENGLISH = 'English',
  HINDI = 'Hindi',
  MARATHI = 'Marathi'
}

/** Used for greeting: "Mr. X" / "Ms. X" / "X". Never say "Mr./Ms." together. */
export type Gender = 'male' | 'female' | 'unknown';

/** Agent persona voice: female = Ankita (Kore), male = Omkar (Puck). */
export type AgentGender = 'female' | 'male';

export interface TranscriptItem {
  id: string;
  source: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';
