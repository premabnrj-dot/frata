# tools/echo

A throwaway header-echo page for Studio's R8 probe. Its own Vercel project (`frrata-echo`, root directory `tools/echo`,
deployment protection off), never the `frata` app. `GET /headers` answers the request headers as JSON; nothing is stored
or logged. Delete the project and this folder once the probe has passed and its result is in
`docs/research/2026-11-22-studio-agent-spike.md`.
