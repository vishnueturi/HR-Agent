# HR-Agent-ReactJS

Frontend for the HR Agent chat UI. Aligned with patterns from **Recco.App** (reference: `D:\9.0\Recco.App`). Backend: **HRAgent** at `D:\2.0\Agent Hub\HRAgent`.

- **Recco.App file dump:** see [RECCO_APP_FILE_DUMP.md](./RECCO_APP_FILE_DUMP.md) for the full list of files in the reference project (1513 source/config files).

*Development helpers:* the local dev server displays a desktop notification when the code finishes compiling (`npm run dev`), via a Vite plugin using **node-notifier**.

Original Figma design: https://www.figma.com/design/c1vBuhxQcekPrvHPVlqPvN/HR-Agent-ReactJS.

## Running the code

- `npm i` — install dependencies  
- `npm run dev` — start the development server  

## Backend integration

The chat UI uses the backend described in `backend.md`:

- `POST /Basicchat/Conversation/Start` (requires JWT)
- `POST /Basicchat/Conversation/Continue`
- SignalR hub at `/chathub` (`JoinConversation(sessionId)`)

### Configuration (Vite env)

Use `.env.local` (or environment variables). See `src/env.d.ts` for all supported `VITE_*` keys. Example:

```bash
VITE_API_BASE_URL=http://localhost:5257
VITE_HRMS_TOKEN_KEY=accessToken
```

### Auth token

The UI reads the HRMS JWT from `localStorage` under `VITE_HRMS_TOKEN_KEY` (default: `accessToken`) and sends it as `Authorization: Bearer <token>` for REST and SignalR.
  