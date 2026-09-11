export { contentTokens } from "./text";

/** Words too common in CVs to flag as "overused". */
export const GENERIC = new Set(
  "team teams work worked working project projects data report reports reporting business client clients customer customers process processes support supported management new daily weekly monthly using across including".split(" "),
);
