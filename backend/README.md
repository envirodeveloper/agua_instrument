# Agua Instruments backend

Express app that serves the website (`frontend/`) and the API. Run from the repo root: `npm start`.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/visitors` | Visitor popup → row in `data/aguainstruments-visitors.xlsx` |
| `GET /api/visitors/download` | Download visitors Excel (header `x-admin-key: ADMIN_KEY`) |
| `POST /api/contact`, `POST /api/careers` | Contact / career forms (email) |
| `POST /api/enquiry` | Enquiry form → lead in MongoDB, returns a 2 h chat token |
| `POST /api/chat`, `GET /api/chat/history`, `POST /api/chat/quote` | Product chatbot (lead token required) |
| `/api/admin/*` | Chatbot admin (inventory, website knowledge, leads, AI settings), JWT from `POST /api/admin/login` |

Pages: `/enquiry?src=<campaign>` is the link you email to prospects. `/admin-chatbot.html` is the admin.

## Environment variables

See `.env.example`. Required for the chatbot: `MONGO_URI`, `ENCRYPTION_KEY`, `JWT_SECRET`, `ADMIN_KEY`.

## Chatbot knowledge

- **Inventory** (`products` collection): imported from the inventory Excel. Manage it in Admin > Inventory
  (import with preview + merge/replace, edit, hide, export, template). Columns are matched by header name.
  Extra columns are kept and shown to the bot. Changes apply to the next chat message.
  First-time / offline import: `node local-tools/import-excel.js [file.xlsx] [--replace] [--dry-run] [--reindex-site]`.
- **Website pages** (`knowledgepages`, `knowledgechunks`): product pages read from `frontend/`. Re-index in
  Admin > Website knowledge after publishing page changes.
- The bot looks things up with tools (`search_products`, `get_product_details`, `search_product_pages`) before
  answering, for up to 4 rounds, and answers only from what the tools return.

## Guardrails

- The chat needs a lead token from the form. Rate limits: 5 enquiries/h per IP, 10 messages/min per lead.
  Admin caps: questions per chat, per lead per day, and total AI answers per day.
- Jailbreak, off-topic and abusive messages are answered with a fixed reply and **no AI call**, and the chat is flagged.
- The system prompt restricts the bot to Agua products. It never invents part numbers, specs or prices, and quote
  questions go to the "Request a quote" button.
- Replies that mention part numbers not found in the catalog or tool results are flagged for review.
- Replies are rendered as text (no HTML). Links are allowed only to aguainstruments.com.

## Hostinger deploy checklist

1. Set `MONGO_URI`, `ENCRYPTION_KEY` (same as local), `JWT_SECRET`, `ADMIN_KEY`, and the email vars in the Node.js app settings.
2. In MongoDB Atlas > Network Access, allow the Hostinger server IP.
3. Deploy and restart. The log should show `[db] MongoDB connected`.
4. Admin > AI settings > **Send test question**.
