// Shapes of the JSON returned by the HackTrack C++ client (bridge mode).

export type Role = "participant" | "judge" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  handle: string;
  country: string;
  teamId: string | null;
  judgeId: string | null;
};

export type Event = {
  name: string;
  tagline: string;
  startsAt: string;
  deadline: string;
  resultsAt: string;
  judgingOpen: boolean;
  votingOpen: boolean;
  resultsPublished: boolean;
  judgesPerProject: number;
  maxTeamSize: number;
  votesPerUser: number;
};

export type Track = { id: string; code: string; name: string; description: string };
export type Prize = { id: string; name: string; amount: string; trackId: string | null; winners: number };

/** Generalized list: a node is either a group (children) or a scored leaf. */
export type RubricNode = {
  id: string;
  name: string;
  weight: number;
  description?: string;
  maxScore?: number;
  effectiveWeight?: number;
  children?: RubricNode[];
};

export type Judge = { id: string; userId: string; name: string; handle: string; title: string };

export type Member = { userId?: string; name: string; handle: string; role: "captain" | "member"; country: string; initials: string };

export type Team = {
  id: string;
  name: string;
  inviteCode?: string;
  createdAt: string;
  projectId: number | null;
  members: Member[];
  project?: { id: number; name: string; status: "draft" | "submitted" };
};

export type Project = {
  id: number;
  code: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  trackId: string | null;
  teamId: string;
  stack: string[];
  status: "submitted" | "draft";
  submittedAt: string | null;
  updatedAt: string;
  repo: string;
  demo: string;
  team?: { id: string; name: string; members: Pick<Member, "name" | "initials" | "role" | "country" | "handle">[] };
  ownTeam?: boolean;
};

export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "flagged";

export type Assignment = {
  judgeId: string;
  projectId: number;
  status: AssignmentStatus;
  scores: Record<string, number>;
  confidence: number;
  notes: string;
  submittedAt: string | null;
  updatedAt: string | null;
  weighted?: number | null;
  project?: Project;
};

export type Comment = { id: string; author: string; handle: string; body: string; at: string };
export type AuditEvent = { id: string; at: string; actor: string; action: string; object: string; ip: string; detail: string };

export type UndoEntry = { id: number; label: string; actor: string; at: string; reverse: { method: string; path: string }[] };

export type Bootstrap = {
  event: Event;
  tracks: Track[];
  prizes: Prize[];
  rubric: RubricNode[];
  rubricDepth: number;
  judges: Judge[];
  counts: { projects: number; submitted: number; teams: number };
  serverTime: string;
};

export type RankingRow = {
  rank: number;
  projectId: number;
  average: number;
  normalized: number;
  judges: number;
  votes: number;
  project?: Project;
};

export type PrizeResult = Prize & {
  winner: { projectId: number; name: string; teamName: string; teamId: string; score: number } | null;
};

export type VoteRow = { rank: number; projectId: number; votes: number; name: string };

export type Results = {
  published: boolean;
  preview?: boolean;
  resultsAt?: string;
  by?: "average" | "normalized";
  ranking: RankingRow[];
  prizes: PrizeResult[];
  votes?: VoteRow[];
  algorithm?: { structure: string; scored: number; extracted: number };
};

export type TraceEntry = {
  id: number;
  at: string;
  kind: "http" | "ds";
  method: string;
  target: string;
  detail: string;
  status: number;
  attempts: number;
  ms: number;
  error: string;
};

export const ROLE_LABEL: Record<Role, string> = { participant: "Participant", judge: "Judge", admin: "Admin" };

/** Flatten the rubric's leaves (the criteria a judge actually scores). */
export function rubricLeaves(nodes: RubricNode[], parent?: RubricNode): (RubricNode & { group?: string })[] {
  return nodes.flatMap((n) => (n.children ? rubricLeaves(n.children, n) : [{ ...n, group: parent?.name }]));
}
