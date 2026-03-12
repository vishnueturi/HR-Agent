
  # HR-Agent-ReactJS

  This is a code bundle for HR-Agent-ReactJS. The original project is available at https://www.figma.com/design/c1vBuhxQcekPrvHPVlqPvN/HR-Agent-ReactJS.

  ## Running the code

  Run `npm i` to install the dependencies.

  Run `npm run dev` to start the development server.

  ## Backend integration

  The chat UI calls the backend endpoints described in `backend.md`:

  - `POST /Basicchat/Conversation/Start` (requires JWT)
  - `POST /Basicchat/Conversation/Continue`
  - SignalR hub at `/chathub` (joins group via `JoinConversation(sessionId)`)

  ### Configuration (Vite env vars)

  Create a `.env.local` (or set these in your environment) to point the UI at your backend and token key:

```bash
VITE_API_BASE_URL=http://localhost:5257
VITE_HRMS_TOKEN_KEY=accessToken
```

  ### Auth token

  Per `backend.md`, this UI reads the HRMS JWT from `localStorage` using the key `VITE_HRMS_TOKEN_KEY` (default: `accessToken`) and sends it as `Authorization: Bearer <token>` for both REST and SignalR.
  