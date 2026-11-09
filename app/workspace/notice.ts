/** A short confirmation ("Kept in your notebook.") shown by the app shell. Failures still go through `onError`. */
export const NOTICE = "workspace:notice";
export const notice = (text: string) => window.dispatchEvent(new CustomEvent<string>(NOTICE, { detail: text }));
