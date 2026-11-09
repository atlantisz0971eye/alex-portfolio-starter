/** What the person has open right now, so "this email" means something to the assistant. Set by the view that shows it. */
export type OpenMail = { account: string; id: string };

let mail: OpenMail | null = null;

export const openMail = () => mail;

/** Returns the function that clears it again, unless another email has been opened since. */
export function setOpenMail(next: OpenMail) {
  mail = next;
  return () => { if (mail === next) mail = null; };
}
