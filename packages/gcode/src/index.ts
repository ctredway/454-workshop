/**
 * @454/gcode: reading G-code the way 454's machine side sees it.
 *
 * The parser itself was moved unchanged from 454 Control and is pinned by golden tests against
 * real job files; these types describe what it returns.
 */
// @ts-ignore: the parser is still plain JavaScript while its behaviour is pinned by tests
import { parseGcode as parseImpl, splitGcodeComments as splitImpl, cleanForSend as cleanImpl } from './parse.js';

/** One straight piece of motion. Arcs arrive already broken into these. */
export interface Segment {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  /** A G0 move. */
  rapid: boolean;
  /** The file line it came from, counting from 1. */
  line: number;
  /** Feed in mm/min, null for rapids. */
  feed: number | null;
  tool: number | null;
  /** Seconds from the start of the job, by the estimate. */
  t0: number; t1: number;
  units: 'mm' | 'in';
}

export interface Issue {
  sev: 'err' | 'warn' | 'info';
  line: number;
  msg: string;
}

export interface ParseResult {
  segs: Segment[];
  issues: Issue[];
  tools: { line: number; tool: number | null }[];
  /** Named toolpaths, from ";Toolpath:" comments. */
  sections?: { line: number; name: string; tool?: string }[];
  cutDist: number;
  rapidDist: number;
  /** Estimated seconds for the whole file. */
  totalTime: number;
  /** Highest and lowest spindle speeds the file asks for (0 if none). */
  sMax: number;
  sMin: number;
  lines: string[];
}

export interface ParseOptions {
  /** Rapid rate assumed for the time estimate, mm/min. */
  rapidRate?: number;
  /** The controller's accelerations ($120-122), mm/s^2. With these the estimate follows GRBL's planner. */
  accel?: { x: number; y: number; z: number };
  /** The controller's maximum rates ($110-112), mm/min. */
  maxRate?: { x: number; y: number; z: number };
  /** Junction deviation ($11), mm. */
  junctionDev?: number;
}

export function parseGcode(text: string, opts: ParseOptions = {}): ParseResult {
  return parseImpl(text, opts) as ParseResult;
}

/** A line with its comments removed, including nested ones like "(Tool: End Mill (2 mm))". */
export function cleanForSend(line: string): string {
  return cleanImpl(line) as string;
}

export function splitGcodeComments(line: string): { code: string; comments: string[] } {
  return splitImpl(line);
}
