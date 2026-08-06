// Schema files are loaded as raw text via Bun's `with { type: "text" }` import.
declare module "*.graphql" {
  const content: string;
  export default content;
}
