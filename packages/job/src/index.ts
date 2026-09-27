// @454/job: turning a G-code file into the lines 454 sends. Moved unchanged from 454 Control.
// @ts-ignore: plain JavaScript, pinned by golden tests
export { createJobBuilder } from './build.js';

/** One line of the job as sent: the file's own (ln = its line number) or added by 454 (syn). */
export interface JobItem { text: string; ln?: number; syn?: boolean; [k: string]: unknown }
