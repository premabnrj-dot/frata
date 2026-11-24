Studio's agent and its environment (docs/plans/2026-11-22-v3a-runtime.md R3; ADR-0020). Applied with `ant apply` in
`frata-studio-eval` or by the owner, never from a session without the owner's word; the three ids it records go into
Vercel as STUDIO_AGENT_ID, STUDIO_AGENT_VERSION and STUDIO_ENVIRONMENT_ID. The frontmatter is JSON (valid YAML) so
`check:studio` reads it without a YAML parser and compares it with the policy: the model pin and `inference_geo: us`,
web tools off, no `multiagent`, `allow_package_managers: false`, the hosts exactly `api.frrata.shop`, and the custom
tools equal to `TOOL_NAMES` (src/domains/studio/tools.ts). The vault is made per session in code (a header credential
for api.frrata.shop only), never by a file here.
